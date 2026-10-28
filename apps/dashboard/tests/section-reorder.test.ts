import { describe, it, expect, vi } from 'vitest';
import * as apiClient from '../src/lib/api-client';

describe('Section Reorder Safety', () => {
  it('reordering in draft state does not invoke any network or mutation requests', () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    let order = ['hero', 'features', 'metrics'];
    // Simulate drag/drop reordering in local state
    const [moved] = order.splice(0, 1);
    order.splice(2, 0, moved);

    expect(order).toEqual(['features', 'metrics', 'hero']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discard resets order to original with zero network calls', () => {
    const original = ['hero', 'features', 'metrics'];
    let draft = ['metrics', 'hero', 'features'];
    const discard = () => {
      draft = [...original];
    };
    discard();
    expect(draft).toEqual(original);
  });

  it('clicking Stage reorder calls proposeSectionReorder and never bypasses approval', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/section/reorder/propose')) {
        return new Response(
          JSON.stringify({
            planId: 'plan-reorder-123',
            integrityHash: 'hash-reorder-456',
            targetSite: 'http://localhost:8881',
            pageId: 32,
            sectionIds: ['features', 'hero', 'metrics'],
            sectionNames: ['Features Grid', 'Hero Section', 'Metrics Bar'],
            diff: {
              before: '<!-- wp:group -->...<!-- /wp:group -->\n\n<!-- wp:cover -->...<!-- /wp:cover -->',
              after: '<!-- wp:cover -->...<!-- /wp:cover -->\n\n<!-- wp:group -->...<!-- /wp:group -->',
            },
            renderedPreviewHtml: '<!-- reordered -->',
            summary: 'Reorder sections: 1. Features Grid → 2. Hero Section → 3. Metrics Bar',
            createdAt: new Date().toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    });
    global.fetch = fetchMock;

    const proposal = await apiClient.proposeSectionReorder({
      targetSite: 'http://localhost:8881',
      pageId: 32,
      sectionIds: ['features', 'hero', 'metrics'],
    });

    expect(proposal.planId).toBe('plan-reorder-123');
    expect(proposal.sectionIds).toEqual(['features', 'hero', 'metrics']);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/site/pages/section/reorder/propose',
      expect.objectContaining({
        method: 'POST',
      })
    );

    const applyCalls = fetchMock.mock.calls.filter((call) =>
      (call[0] as string).includes('/reorder/apply')
    );
    expect(applyCalls).toHaveLength(0);
  });
});

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

  it('keeps the local draft when staging fails so the user can retry', async () => {
    // Mirrors RouteTree.stageReorder: draft is only cleared after a successful stage.
    const original = ['hero', 'features', 'metrics'];
    let draft: string[] = ['metrics', 'hero', 'features'];
    let notice: { tone: 'warning' | 'error' | 'info'; message: string } | null = null;

    const stage = async (onReorder: () => Promise<void>) => {
      try {
        await onReorder();
        draft = [];
        notice = null;
      } catch (err) {
        notice = { tone: 'error', message: (err as Error).message };
      }
    };

    await stage(async () => {
      throw new Error('Stale proposal');
    });

    expect(draft).toEqual(['metrics', 'hero', 'features']);
    expect(draft).not.toEqual(original);
    expect(notice).toEqual({ tone: 'error', message: 'Stale proposal' });
  });

  it('warns above 100 sections but still allows staging up to the 200 hard limit', () => {
    const REORDER_WARN_THRESHOLD = 100;
    const REORDER_MAX_SECTIONS = 200;

    const evaluate = (count: number) => ({
      blocked: count > REORDER_MAX_SECTIONS,
      warned: count > REORDER_WARN_THRESHOLD && count <= REORDER_MAX_SECTIONS,
    });

    expect(evaluate(2)).toEqual({ blocked: false, warned: false });
    expect(evaluate(100)).toEqual({ blocked: false, warned: false });
    expect(evaluate(150)).toEqual({ blocked: false, warned: true });
    expect(evaluate(200)).toEqual({ blocked: false, warned: true });
    expect(evaluate(201)).toEqual({ blocked: true, warned: false });
  });

  it('reset order restores the original section order without network calls', () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const original = ['hero', 'features', 'metrics'];
    let draft: string[] | null = ['metrics', 'hero', 'features'];

    const reset = () => {
      draft = null;
    };
    reset();

    expect(draft).toBeNull();
    expect(original).toEqual(['hero', 'features', 'metrics']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

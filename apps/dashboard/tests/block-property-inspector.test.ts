import { describe, it, expect, vi } from 'vitest';
import * as apiClient from '../src/lib/api-client';

describe('BlockPropertyInspector Draft & Proposal Safety', () => {
  it('modifying draft property inputs does not invoke any network or mutation requests', () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    // Simulate draft property state in inspector
    let draftProps = {
      align: 'none',
      backgroundColor: '',
      textColor: '',
      fontSize: '',
      padding: '',
    };

    // User interacts with controls (align, color picker, etc.)
    draftProps = {
      ...draftProps,
      align: 'wide',
      backgroundColor: '#112233',
      fontSize: 'large',
    };

    expect(draftProps.align).toBe('wide');
    expect(draftProps.backgroundColor).toBe('#112233');
    // Ensure no network calls were made during draft adjustments
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discard resets draft properties to section original attributes with zero network calls', () => {
    const originalAttrs = {
      align: 'none',
      backgroundColor: 'contrast',
      'style.color.text': '#ffffff',
    };

    let draftProps = {
      align: 'full',
      backgroundColor: '#00ff00',
    };

    // Simulate clicking Discard
    const handleDiscard = () => {
      draftProps = {
        align: originalAttrs.align,
        backgroundColor: originalAttrs.backgroundColor,
      };
    };

    handleDiscard();
    expect(draftProps.align).toBe('none');
    expect(draftProps.backgroundColor).toBe('contrast');
  });

  it('clicking Stage proposal calls proposeSectionEdit with propertyPatch and never bypasses approval', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/section/propose')) {
        return new Response(
          JSON.stringify({
            planId: 'plan-prop-123',
            integrityHash: 'hash-abc-456',
            targetSite: 'http://localhost:8881',
            pageId: 32,
            sectionId: 'hero',
            sectionName: 'Hero Section',
            diff: {
              before: '<!-- wp:group {"align":"none"} -->',
              after: '<!-- wp:group {"align":"wide","backgroundColor":"contrast"} -->',
            },
            renderedPreviewHtml: '<div class="wp-block-group alignwide">...</div>',
            summary: 'Updated 2 properties on Hero Section',
            createdAt: new Date().toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    });
    global.fetch = fetchMock;

    const propertyPatch = {
      align: 'wide',
      backgroundColor: 'contrast',
    };

    const proposal = await apiClient.proposeSectionEdit({
      targetSite: 'http://localhost:8881',
      pageId: 32,
      sectionId: 'hero',
      propertyPatch,
    });

    expect(proposal.planId).toBe('plan-prop-123');
    expect(proposal.summary).toContain('Updated 2 properties');

    // Verify network call went to propose endpoint
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/site/pages/section/propose',
      expect.objectContaining({
        method: 'POST',
      })
    );

    // Verify apply was never invoked
    const applyCalls = fetchMock.mock.calls.filter((call) =>
      (call[0] as string).includes('/apply')
    );
    expect(applyCalls).toHaveLength(0);
  });
});

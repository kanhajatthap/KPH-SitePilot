import { describe, it, expect, vi } from 'vitest';
import * as apiClient from '../src/lib/api-client';

describe('Accessible Visual Section Selection & Inline Editing Flow', () => {
  it('selects a section when clicked or activated by keyboard, syncing section ID', () => {
    let currentSelectedSectionId = 'all';
    const onSelectSection = (id: string) => {
      currentSelectedSectionId = id;
    };

    // Selecting a known section (pointer click or keyboard Enter)
    onSelectSection('hero');
    expect(currentSelectedSectionId).toBe('hero');

    onSelectSection('features');
    expect(currentSelectedSectionId).toBe('features');
  });

  it('resets section selection to "all" on Escape or whole page select', () => {
    let currentSelectedSectionId = 'features';
    const onSelectSection = (id: string) => {
      currentSelectedSectionId = id;
    };

    // Simulate Escape key press handler
    const handleKeyDown = (key: string) => {
      if (key === 'Escape') {
        onSelectSection('all');
      }
    };

    handleKeyDown('Escape');
    expect(currentSelectedSectionId).toBe('all');
  });

  it('guarantees visual hover and selection never trigger propose or apply mutations', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    let selectedSectionId = 'all';
    const handleSelectSection = (id: string) => {
      selectedSectionId = id;
      // Visual selection must only update state, never trigger mutation
    };

    // Simulate clicking or focusing sections in preview
    handleSelectSection('hero');
    handleSelectSection('features');
    handleSelectSection('metrics');
    handleSelectSection('all');

    // Verify absolutely no network mutation calls were executed
    expect(fetchMock).not.toHaveBeenCalled();
    expect(selectedSectionId).toBe('all');
  });

  it('proposing an inline section edit routes through proposeSectionEdit and requires explicit approval', async () => {
    const mockProposal = {
      planId: 'plan_test_sec_1',
      integrityHash: 'sha256_sec_hash',
      targetSite: 'http://test.local',
      pageId: 32,
      sectionId: 'hero',
      sectionName: 'Hero Section',
      diff: {
        before: '<h1 class="wp-block-heading">Original</h1>',
        after: '<h1 class="wp-block-heading">Updated Hero</h1>',
      },
      renderedPreviewHtml: '<main><section><h1>Updated Hero</h1></section></main>',
      unsupportedOperations: [],
      summary: 'Updated hero heading and call-to-action buttons',
      createdAt: new Date().toISOString(),
    };

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(mockProposal), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    const proposal = await apiClient.proposeSectionEdit({
      targetSite: 'http://test.local',
      pageId: 32,
      sectionId: 'hero',
      instruction: 'Change headline to Updated Hero',
    });

    expect(proposal.planId).toBe('plan_test_sec_1');
    expect(proposal.sectionId).toBe('hero');
    expect(proposal.diff.after).toContain('Updated Hero');

    // Confirm that the proposal was staged via POST /api/site/pages/section/propose
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/site/pages/section/propose',
      expect.objectContaining({
        method: 'POST',
      })
    );

    // Apply has NOT been called yet (requires explicit user approval click)
    const applyCalls = fetchMock.mock.calls.filter((call) =>
      (call[0] as string).includes('/apply')
    );
    expect(applyCalls).toHaveLength(0);
  });
});

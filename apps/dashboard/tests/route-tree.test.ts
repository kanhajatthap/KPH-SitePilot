import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as apiClient from '../src/lib/api-client';

describe('RouteTree Logic & Client Contract Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockPages = [
    {
      id: 32,
      title: 'Modern Tech Home',
      slug: 'modern-tech-home',
      status: 'publish',
      url: 'http://test.local/modern-tech-home',
    },
    {
      id: 42,
      title: 'About Us',
      slug: 'about',
      status: 'draft',
      url: 'http://test.local/about',
    },
  ];

  const mockSections = [
    {
      id: 'hero',
      name: 'Hero Section',
      blockName: 'core/cover',
      excerpt: 'Hero headline...',
      attributes: { align: 'full', backgroundColor: 'contrast' },
    },
    {
      id: 'features',
      name: 'Features Grid',
      blockName: 'core/columns',
      excerpt: 'Features list...',
      attributes: { align: 'wide' },
    },
  ];

  it('listSitePages fetches and formats pages for tree display', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ pages: mockPages, count: 2, verified: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    const result = await apiClient.listSitePages('http://test.local');
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].id).toBe(32);
    expect(result.pages[0].title).toBe('Modern Tech Home');
    expect(result.pages[1].status).toBe('draft');
    expect(fetchMock).toHaveBeenCalledWith('/api/site/pages/list?targetSite=http%3A%2F%2Ftest.local');
  });

  it('fetchPageSections loads and parses block sections for a selected tree page', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          pageId: 32,
          title: 'Modern Tech Home',
          status: 'publish',
          url: 'http://test.local/modern-tech-home',
          sections: mockSections,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    global.fetch = fetchMock;

    const result = await apiClient.fetchPageSections(32, 'http://test.local');
    expect(result.pageId).toBe(32);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].id).toBe('hero');
    expect(result.sections[0].attributes).toEqual({
      align: 'full',
      backgroundColor: 'contrast',
    });
    expect(result.sections[1].name).toBe('Features Grid');
    expect(fetchMock).toHaveBeenCalledWith('/api/site/pages/sections?id=32&targetSite=http%3A%2F%2Ftest.local');
  });

  it('handles empty page response without throwing or generating mock items', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ pages: [], count: 0, verified: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    const result = await apiClient.listSitePages('http://test.local');
    expect(result.pages).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it('throws descriptive error on API failure enabling retry UI', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'NETWORK_ERROR', message: 'Backend unreachable' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    await expect(apiClient.listSitePages('http://test.local')).rejects.toThrow('Backend unreachable');
  });

  it('guarantees that reading routes and sections performs no mutation actions', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ pages: mockPages, sections: mockSections }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    await apiClient.listSitePages('http://test.local');
    await apiClient.fetchPageSections(32, 'http://test.local');

    // Verify all outbound requests were read-only GET calls
    for (const call of fetchMock.mock.calls) {
      const url = call[0] as string;
      const init = call[1] as RequestInit | undefined;
      expect(!init?.method || init.method === 'GET').toBe(true);
      expect(url).not.toContain('/apply');
      expect(url).not.toContain('/propose');
    }
  });
});

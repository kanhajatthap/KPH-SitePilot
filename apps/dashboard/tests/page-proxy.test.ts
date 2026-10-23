import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as proposePage } from '../src/app/api/site/pages/propose/route';
import { POST as applyPage } from '../src/app/api/site/pages/apply/route';
import { API_SERVER_URL } from '../src/lib/api-proxy';

const fetchMock = vi.fn();

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3002${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('page creation dashboard proxies', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it('rejects a non-local target before forwarding', async () => {
    const res = await proposePage(
      request('/api/site/pages/propose', {
        targetSite: 'https://production.example.com',
        title: 'About',
        content: '<!-- wp:paragraph --><p>About</p><!-- /wp:paragraph -->',
      })
    );

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('TARGET_NOT_ALLOWED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards a valid page proposal and returns the upstream JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'proposed',
        planId: '11111111-1111-4111-8111-111111111111',
        integrityHash: 'hash',
      })
    );

    const res = await proposePage(
      request('/api/site/pages/propose', {
        targetSite: 'http://test.local',
        title: 'About',
        content: '<!-- wp:paragraph --><p>About</p><!-- /wp:paragraph -->',
        status: 'publish',
        isFrontPage: false,
        builder: 'gutenberg',
      })
    );

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('proposed');
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_SERVER_URL}/api/site/pages/propose`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"targetSite":"http://test.local"'),
      })
    );
  });

  it('turns an upstream HTML response into a JSON 502, not an HTML body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<!DOCTYPE html><html><body>Bad gateway</body></html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      })
    );

    const res = await proposePage(
      request('/api/site/pages/propose', {
        targetSite: 'http://test.local',
        title: 'About',
        content: '<!-- wp:paragraph --><p>About</p><!-- /wp:paragraph -->',
      })
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('UPSTREAM_INVALID_RESPONSE');
    expect(body.message).toContain('text/html');
  });

  it('requires planId and integrityHash on apply', async () => {
    const res = await applyPage(
      request('/api/site/pages/apply', {
        targetSite: 'http://test.local',
        integrityHash: 'hash',
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps apply failures as JSON when the upstream returns HTML', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<!DOCTYPE html><html><body>Not found</body></html>', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })
    );

    const res = await applyPage(
      request('/api/site/pages/apply', {
        targetSite: 'http://test.local',
        planId: '11111111-1111-4111-8111-111111111111',
        integrityHash: 'hash',
      })
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('UPSTREAM_INVALID_RESPONSE');
  });
});

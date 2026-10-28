import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as proposeSection } from '../src/app/api/site/pages/section/propose/route';
import { POST as applySection } from '../src/app/api/site/pages/section/apply/route';

const fetchMock = vi.fn();

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3002${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('section-level dashboard proxies (propose & apply)', () => {
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

  describe('/api/site/pages/section/propose', () => {
    it('rejects a non-local target site before forwarding', async () => {
      const res = await proposeSection(
        request('/api/site/pages/section/propose', {
          targetSite: 'https://production.example.com',
          pageId: 42,
          sectionId: 'hero',
          propertyPatch: { align: 'wide' },
        })
      );

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('TARGET_NOT_ALLOWED');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requires numeric pageId and non-empty sectionId', async () => {
      const res = await proposeSection(
        request('/api/site/pages/section/propose', {
          targetSite: 'http://test.local',
          pageId: 'invalid',
          sectionId: '',
        })
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('VALIDATION_FAILED');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('forwards valid propose payload to upstream API and returns proposal JSON', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            planId: 'plan-123',
            integrityHash: 'hash-abc',
            targetSite: 'http://test.local',
            pageId: 42,
            sectionId: 'hero',
            summary: 'Staged 1 property',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      const res = await proposeSection(
        request('/api/site/pages/section/propose', {
          targetSite: 'http://test.local',
          pageId: 42,
          sectionId: 'hero',
          propertyPatch: { align: 'wide' },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.planId).toBe('plan-123');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/site/pages/section/propose'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('/api/site/pages/section/apply', () => {
    it('rejects non-local target site before forwarding', async () => {
      const res = await applySection(
        request('/api/site/pages/section/apply', {
          targetSite: 'https://production.example.com',
          planId: 'plan-123',
          integrityHash: 'hash-abc',
          pageId: 42,
        })
      );

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('TARGET_NOT_ALLOWED');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requires planId, integrityHash, and valid pageId', async () => {
      const res = await applySection(
        request('/api/site/pages/section/apply', {
          targetSite: 'http://test.local',
          pageId: 42,
        })
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('VALIDATION_FAILED');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('forwards valid apply payload to upstream API', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'applied',
            pageId: 42,
            verified: true,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      const res = await applySection(
        request('/api/site/pages/section/apply', {
          targetSite: 'http://test.local',
          planId: 'plan-123',
          integrityHash: 'hash-abc',
          pageId: 42,
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.verified).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/site/pages/section/apply'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateApiRequest, findOwnedSite, updateOwnedSite, revokeSiteForUser, rotateSiteCredentials } =
  vi.hoisted(() => ({
    authenticateApiRequest: vi.fn(),
    findOwnedSite: vi.fn(),
    updateOwnedSite: vi.fn(),
    revokeSiteForUser: vi.fn(),
    rotateSiteCredentials: vi.fn(),
  }));

vi.mock('../src/lib/auth/api', () => ({ authenticateApiRequest }));
vi.mock('../src/lib/connector/store', () => ({
  findOwnedSite,
  updateOwnedSite,
  revokeSiteForUser,
  rotateSiteCredentials,
}));

import { GET, PATCH, DELETE } from '../src/app/api/connector/sites/[id]/route';
import { POST as ROTATE } from '../src/app/api/connector/sites/[id]/rotate-secret/route';

const SITE_ID = '11111111-2222-4333-8444-555555555555';
const USER = { id: '6a1c0f5e-1111-4a2b-9c3d-000000000001', email: 'user@example.test' };

const SITE = {
  id: SITE_ID,
  project_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  url: 'https://shop.example.com',
  name: 'Shop',
  environment: 'production' as const,
  status: 'active' as const,
  scopes: ['read', 'content'],
  capabilities: {
    plugins: [{ slug: 'woocommerce' }],
    postTypes: [{ slug: 'post' }, { slug: 'page' }],
    taxonomies: [{ slug: 'category' }],
    theme: { blockTheme: true },
    multisite: false,
  },
  plugin_version: '0.7.0',
  wp_version: '6.8',
  php_version: '8.2',
  last_seen_at: null,
  created_at: '2026-11-01T00:00:00.000Z',
};

function params(id = SITE_ID) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(body: unknown) {
  return new Request(`https://kph-sitepilot.vercel.app/api/connector/sites/${SITE_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('site detail (E2-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: USER } });
  });

  it('returns the site plus a capability summary', async () => {
    findOwnedSite.mockResolvedValue(SITE);

    const response = await GET(new Request('https://x/api/connector/sites/id'), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(findOwnedSite).toHaveBeenCalledWith(USER.id, SITE_ID);
    expect(body.capabilitySummary).toEqual({
      pluginCount: 1,
      postTypeCount: 2,
      taxonomyCount: 1,
      blockTheme: true,
      multisite: false,
      isManifestEmpty: false,
    });
  });

  it('answers 404 for another account\'s site and 400 for a malformed id', async () => {
    findOwnedSite.mockResolvedValue(null);
    expect((await GET(new Request('https://x'), params())).status).toBe(404);

    // A non-uuid never reaches storage at all.
    expect((await GET(new Request('https://x'), params('../../etc/passwd'))).status).toBe(400);
    expect(findOwnedSite).toHaveBeenCalledTimes(1);
  });

  it('requires a session and an account', async () => {
    authenticateApiRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    });
    expect((await GET(new Request('https://x'), params())).status).toBe(401);

    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'local', user: null } });
    expect((await GET(new Request('https://x'), params())).status).toBe(400);
  });
});

describe('site update (E2-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: USER } });
  });

  it('applies an allowlisted patch and returns the new row', async () => {
    updateOwnedSite.mockResolvedValue({ ...SITE, status: 'paused' });

    const response = await PATCH(jsonRequest({ status: 'paused' }), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateOwnedSite).toHaveBeenCalledWith(USER.id, SITE_ID, { status: 'paused' });
    expect(body.site.status).toBe('paused');
  });

  it('rejects unknown fields instead of ignoring them', async () => {
    const response = await PATCH(jsonRequest({ status: 'paused', token_hash: 'hijack' }), params());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(updateOwnedSite).not.toHaveBeenCalled();
  });

  it('rejects an invented status, an empty patch and invalid JSON', async () => {
    expect((await PATCH(jsonRequest({ status: 'deleted' }), params())).status).toBe(400);
    expect((await PATCH(jsonRequest({}), params())).status).toBe(400);
    expect(
      (
        await PATCH(
          new Request('https://x', { method: 'PATCH', body: 'not json' }),
          params()
        )
      ).status
    ).toBe(400);
    expect(updateOwnedSite).not.toHaveBeenCalled();
  });
});

describe('site disconnect (E2-15 / E2-17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: USER } });
  });

  it('revokes rather than deleting history', async () => {
    revokeSiteForUser.mockResolvedValue('ok');

    const response = await DELETE(new Request('https://x', { method: 'DELETE' }), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ site: { id: SITE_ID, status: 'revoked' } });
    expect(revokeSiteForUser).toHaveBeenCalledWith(SITE_ID, USER.id);
  });

  it('maps not_found and unavailable without leaking which one', async () => {
    revokeSiteForUser.mockResolvedValue('not_found');
    expect((await DELETE(new Request('https://x', { method: 'DELETE' }), params())).status).toBe(404);

    revokeSiteForUser.mockResolvedValue('unavailable');
    expect((await DELETE(new Request('https://x', { method: 'DELETE' }), params())).status).toBe(503);
  });
});

describe('secret rotation (E2-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: USER } });
  });

  it('returns new credentials exactly once', async () => {
    rotateSiteCredentials.mockResolvedValue({ token: 'tok_new', secret: 'sec_new' });

    const response = await ROTATE(new Request('https://x', { method: 'POST' }), params());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.credentials).toEqual({ token: 'tok_new', secret: 'sec_new' });
    expect(body.note).toMatch(/not retrievable/);
    expect(rotateSiteCredentials).toHaveBeenCalledWith(USER.id, SITE_ID);
  });

  it('never rotates a site the caller does not own', async () => {
    rotateSiteCredentials.mockResolvedValue(null);
    expect((await ROTATE(new Request('https://x', { method: 'POST' }), params())).status).toBe(404);
  });

  it('says CONFIG_MISSING when the encryption key is absent', async () => {
    rotateSiteCredentials.mockRejectedValue(new Error('SITEPILOT_ENCRYPTION_KEY is not configured.'));

    const response = await ROTATE(new Request('https://x', { method: 'POST' }), params());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('CONFIG_MISSING');
    expect(JSON.stringify(body)).not.toContain('tok_');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('../src/lib/supabase/server', () => ({ createSupabaseServerClient }));

import { authorizeTargetSite } from '../src/lib/auth/site-access';

type QueryResult = { data: unknown; error: unknown };

function mockConnections(result: QueryResult) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  createSupabaseServerClient.mockResolvedValue({ from });
  return { from, select, eq };
}

const SAAS_CONTEXT = {
  mode: 'saas' as const,
  user: { id: 'user-1', email: 'user@example.test' },
};

describe('authorizeTargetSite', () => {
  const originalWpSiteUrl = process.env.WP_SITE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WP_SITE_URL;
  });

  afterEach(() => {
    if (originalWpSiteUrl === undefined) delete process.env.WP_SITE_URL;
    else process.env.WP_SITE_URL = originalWpSiteUrl;
  });

  it('does not query ownership in local mode', async () => {
    const result = await authorizeTargetSite({ mode: 'local', user: null }, 'http://anything.local');
    expect(result.ok).toBe(true);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('allows requests without a target site', async () => {
    const result = await authorizeTargetSite(SAAS_CONTEXT, null);
    expect(result.ok).toBe(true);
  });

  it('allows the deployment-owned WordPress site', async () => {
    process.env.WP_SITE_URL = 'http://plugin-test.local';
    const result = await authorizeTargetSite(SAAS_CONTEXT, 'http://plugin-test.local:80/wp-admin');
    expect(result.ok).toBe(true);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('allows a site registered as an active connection owned by the caller', async () => {
    mockConnections({
      data: [
        { target_site: 'http://other-owner.local', status: 'active' },
        { target_site: 'http://tenant-a.local', status: 'active' },
      ],
      error: null,
    });

    const result = await authorizeTargetSite(SAAS_CONTEXT, 'http://tenant-a.local');
    expect(result.ok).toBe(true);
  });

  it('rejects a site that is not an owned connection', async () => {
    mockConnections({ data: [{ target_site: 'http://tenant-a.local', status: 'active' }], error: null });

    const result = await authorizeTargetSite(SAAS_CONTEXT, 'http://tenant-b.local');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toMatchObject({ code: 'TARGET_NOT_AUTHORIZED' });
    }
  });

  it('fails closed when the multi-tenant schema has not been applied', async () => {
    mockConnections({ data: null, error: { code: 'PGRST205', message: 'relation not found' } });

    const result = await authorizeTargetSite(SAAS_CONTEXT, 'http://tenant-a.local');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      expect(await result.response.json()).toMatchObject({ code: 'SCHEMA_NOT_READY' });
    }
  });

  it('rejects malformed target URLs', async () => {
    const result = await authorizeTargetSite(SAAS_CONTEXT, 'not a url');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });
});

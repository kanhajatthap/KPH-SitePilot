import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseAdminClient } = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock('../src/lib/supabase/admin', () => ({ createSupabaseAdminClient }));

import { GET } from '../src/app/api/cron/daily/route';
import { isCronPath, isPrivatePath } from '../src/lib/auth/routes';

function request(token?: string) {
  return new Request('https://kph-sitepilot.vercel.app/api/cron/daily', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function fakeClient(options: { purgeError?: string; tableError?: string } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: options.purgeError ? { message: options.purgeError } : null });
  const limit = vi.fn().mockResolvedValue({ count: 3, error: options.tableError ? { message: options.tableError } : null });
  const select = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { rpc, from }, rpc, from };
}

describe('daily cron endpoint', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    createSupabaseAdminClient.mockReturnValue(fakeClient().client);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('stays closed when no secret is configured', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request('anything'));

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('CONFIG_MISSING');
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong secret', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('wrong-secret'))).status).toBe(401);
    // Length differs → still a clean 401, never an exception.
    expect((await GET(request('short'))).status).toBe(401);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('purges and touches the keep-alive tables with the right secret', async () => {
    const fake = fakeClient();
    createSupabaseAdminClient.mockReturnValue(fake.client);

    const response = await GET(request('test-cron-secret'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, purged: true, keepAlive: { projects: 'ok', sites: 'ok' }, errors: [] });
    expect(typeof body.durationMs).toBe('number');
    expect(fake.rpc).toHaveBeenCalledWith('purge_expired_connector_state');
    expect(fake.from).toHaveBeenCalledWith('projects');
    expect(fake.from).toHaveBeenCalledWith('sites');
  });

  it('reports a partial failure without leaking internals', async () => {
    createSupabaseAdminClient.mockReturnValue(fakeClient({ purgeError: 'permission denied for function' }).client);

    const response = await GET(request('test-cron-secret'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.purged).toBe(false);
    expect(body.errors.join(' ')).toContain('purge');
    expect(JSON.stringify(body)).not.toContain('service_role');
  });

  it('answers 503 when the deployment has no server credentials', async () => {
    createSupabaseAdminClient.mockReturnValue(null);

    const response = await GET(request('test-cron-secret'));

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('STORAGE_UNAVAILABLE');
  });
});

describe('cron path routing', () => {
  it('is treated as a machine endpoint, not a private page', () => {
    expect(isCronPath('/api/cron/daily')).toBe(true);
    expect(isPrivatePath('/api/cron/daily')).toBe(false);
    // Everything else under /api stays session-gated.
    expect(isPrivatePath('/api/chat')).toBe(true);
    expect(isPrivatePath('/api/cronlike')).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { callApi } = vi.hoisted(() => ({ callApi: vi.fn() }));

vi.mock('../src/lib/api-call', () => ({ callApi }));

import { GET } from '../src/app/api/health/route';

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SITEPILOT_ENCRYPTION_KEY',
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_SHA',
] as const;

const SAMPLE_ENV = '0123456789abcdef'.repeat(4); // 64 hex chars = 32 bytes

describe('hosted health endpoint', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function hosted() {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-placeholder';
    process.env.SUPABASE_URL = 'https://project-ref.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-placeholder';
    process.env.SITEPILOT_ENCRYPTION_KEY = SAMPLE_ENV;
  }

  it('reports ok with version, mode and environment when everything is wired', async () => {
    hosted();
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef1234567890';
    callApi.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({
      status: 'ok',
      service: 'kph-sitepilot-dashboard',
      mode: 'hosted',
      environment: 'production',
      commit: 'abcdef1',
      checks: {
        dashboard: 'ok',
        apiServer: 'connected',
        auth: 'ready',
        storage: 'ready',
        encryption: 'ready',
      },
    });
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
  });

  it('stays healthy when the connector is not configured yet', async () => {
    // Sign-in works, but no service role key / encryption key: a fresh deploy.
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-placeholder';
    callApi.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.storage).toBe('not-configured');
    expect(body.checks.encryption).toBe('missing');
  });

  it('reports local mode without claiming hosted checks', async () => {
    callApi.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });

    const response = await GET();
    const body = await response.json();

    expect(body.mode).toBe('local');
    expect(body.checks.auth).toBe('not-configured');
    expect(body.checks.encryption).toBe('not-configured');
    expect(body.environment).toBe(process.env.NODE_ENV ?? 'development');
  });

  it('turns a failing API into a degraded 502 and a dead one into 503', async () => {
    callApi.mockResolvedValue({ ok: false, status: 500 });

    const degraded = await GET();
    expect(degraded.status).toBe(502);
    expect((await degraded.json()).checks.apiServer).toBe('degraded');

    callApi.mockRejectedValue(new Error('fetch failed'));
    const failed = await GET();
    expect(failed.status).toBe(503);
    expect((await failed.json()).checks.apiServer).toBe('disconnected');
  });

  it('never leaks key material or the project URL', async () => {
    hosted();
    callApi.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });

    const text = JSON.stringify(await (await GET()).json());

    expect(text).not.toContain('service-role-placeholder');
    expect(text).not.toContain(SAMPLE_ENV);
    expect(text).not.toContain('supabase.co');
    expect(text).not.toContain('eyJ');
  });
});

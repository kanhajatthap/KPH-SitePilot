import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../src/app/api/auth/status/route';
import { localAuthDiagnostics, probeAuthProvider } from '../src/lib/auth/diagnostics';

const ANON_KEY = 'public-anon-placeholder';
const SUPABASE_URL = 'https://project-ref.supabase.co';

function withEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('auth email diagnostics endpoint', () => {
  const original = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    site: process.env.NEXT_PUBLIC_SITE_URL,
    vercel: process.env.VERCEL_URL,
    resend: process.env.RESEND_API_KEY,
    from: process.env.SITEPILOT_MAIL_FROM,
  };

  beforeEach(() => {
    withEnv({
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      NEXT_PUBLIC_SITE_URL: 'https://kph-sitepilot.vercel.app',
      VERCEL_URL: undefined,
    });
  });

  afterEach(() => {
    withEnv({
      NEXT_PUBLIC_SUPABASE_URL: original.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: original.key,
      NEXT_PUBLIC_SITE_URL: original.site,
      VERCEL_URL: original.vercel,
      RESEND_API_KEY: original.resend,
      SITEPILOT_MAIL_FROM: original.from,
    });
    vi.restoreAllMocks();
  });

  it('reports the redirect URLs it will actually send', async () => {
    const response = await GET(new Request('https://kph-sitepilot.vercel.app/api/auth/status?probe=0'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.authEnabled).toBe(true);
    expect(body.siteUrl).toEqual({
      url: 'https://kph-sitepilot.vercel.app',
      source: 'configured',
      secure: true,
      trusted: true,
    });
    expect(body.emailRedirects).toEqual({
      confirm: 'https://kph-sitepilot.vercel.app/auth/confirm',
      callback: 'https://kph-sitepilot.vercel.app/auth/callback',
      recovery: 'https://kph-sitepilot.vercel.app/auth/confirm?next=%2Freset-password',
    });
    // With no app-side mailer the report says so rather than pretending the
    // inbox is somebody else's problem. The sender address is the only new fact.
    expect(body.mailer).toEqual({ configured: false, provider: 'resend', from: null });
    expect(body.warnings).toEqual([
      'No app-side mailer is configured (RESEND_API_KEY + SITEPILOT_MAIL_FROM), so authentication email depends on the Supabase project SMTP.',
    ]);
    // No key material, no project URL, no user data.
    const text = JSON.stringify(body);
    expect(text).not.toContain('eyJ');
    expect(text).not.toContain('supabase.co');
    expect(text).not.toContain(ANON_KEY);
  });

  it('goes quiet about the mailer once one is configured', async () => {
    withEnv({
      RESEND_API_KEY: 're_test_key_1234567890',
      SITEPILOT_MAIL_FROM: 'no-reply@kph.example',
    });

    const response = await GET(new Request('https://kph-sitepilot.vercel.app/api/auth/status?probe=0'));
    const body = await response.json();

    expect(body.warnings).toEqual([]);
    expect(body.mailer).toEqual({
      configured: true,
      provider: 'resend',
      from: 'no-reply@kph.example',
    });
    // The key itself must never reach the response.
    expect(JSON.stringify(body)).not.toContain('re_test_key');
  });

  it('shouts when production would email loopback links', async () => {
    // VERCEL_ENV is how a deployed build announces itself; NODE_ENV is read-only here.
    withEnv({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3002', VERCEL_ENV: 'production' });

    try {
      const response = await GET(new Request('https://kph-sitepilot.vercel.app/api/auth/status?probe=0'));
      const body = await response.json();

      expect(body.siteUrl.url).toBe('http://localhost:3002');
      expect(body.warnings.join(' ')).toMatch(/loopback origin in production/);
    } finally {
      withEnv({ VERCEL_ENV: undefined });
    }
  });

  it('says so when Supabase is not configured at all', async () => {
    withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined, NEXT_PUBLIC_SITE_URL: undefined });

    const response = await GET(new Request('http://localhost:3002/api/auth/status?probe=0'));
    const body = await response.json();

    expect(body.authEnabled).toBe(false);
    expect(body.emailDelivery).toBe('not-configured');
    expect(body.nextSteps).toEqual([]);
    expect(body.warnings.join(' ')).toMatch(/not configured/);
  });
});

describe('Supabase auth provider probe', () => {
  beforeEach(() => {
    withEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY });
  });

  afterEach(() => {
    withEnv({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
  });

  it('reports that confirmation is required and signups are open', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ mailer_autoconfirm: false, disable_signup: false }), { status: 200 })
    );

    const result = await probeAuthProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    expect(result).toMatchObject({ reachable: true, confirmationRequired: true, signupsEnabled: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${SUPABASE_URL}/auth/v1/settings`);
    expect((init as RequestInit).headers).toMatchObject({ apikey: ANON_KEY });
  });

  it('turns a transport failure into a type, never a stack trace', async () => {
    const fetchFn = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { name: 'AbortError' }));

    const result = await probeAuthProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    expect(result).toMatchObject({ reachable: false, error: 'timeout' });
  });

  it('maps an HTTP error without echoing the response body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{"message":"nope"}', { status: 401 }));

    const result = await probeAuthProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    expect(result).toMatchObject({ reachable: false, status: 401, error: 'http-401' });
    expect(JSON.stringify(result)).not.toContain('nope');
  });

  it('is honest that SMTP state cannot be read with the anon key', () => {
    const diagnostics = localAuthDiagnostics(process.env, null);
    expect(diagnostics.emailDelivery).toBe('unverified');
    expect(diagnostics.nextSteps.join(' ')).toMatch(/custom SMTP/);
  });
});

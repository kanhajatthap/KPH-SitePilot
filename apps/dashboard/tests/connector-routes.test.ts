import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST as pairRoute } from '../src/app/api/connector/pair/route';
import { POST as pairingCodeRoute } from '../src/app/api/connector/pairing-codes/route';
import { GET as sitesRoute } from '../src/app/api/connector/sites/route';
import { POST as jobsRoute } from '../src/app/api/connector/jobs/route';
import { DELETE as deleteSiteRoute } from '../src/app/api/connector/sites/[id]/route';
import { resetPairingRateLimit } from '../src/lib/connector/rate-limit';

const savedEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  encryptionKey: process.env.SITEPILOT_ENCRYPTION_KEY,
};

function pairRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('https://app.example.com/api/connector/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    body,
  });
}

describe('connector routes', () => {
  beforeEach(() => {
    resetPairingRateLimit();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SITEPILOT_ENCRYPTION_KEY;
  });

  afterEach(() => {
    resetPairingRateLimit();
    if (savedEnv.supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.supabaseUrl;
    if (savedEnv.supabaseAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedEnv.supabaseAnon;
    if (savedEnv.encryptionKey === undefined) delete process.env.SITEPILOT_ENCRYPTION_KEY;
    else process.env.SITEPILOT_ENCRYPTION_KEY = savedEnv.encryptionKey;
  });

  it('requires an account before disconnecting a site', async () => {
    const res = await deleteSiteRoute(new Request('https://app.example.com/api/connector/sites/x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CONNECTOR_REQUIRES_ACCOUNT');
  });

  it('rejects a non-JSON pairing body', async () => {
    const res = await pairRoute(pairRequest('not json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('rejects a malformed pairing payload before touching storage', async () => {
    const res = await pairRoute(pairRequest(JSON.stringify({ code: 'ABCD-EFGH' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues.some((issue: { path: string }) => issue.path === 'siteUrl')).toBe(true);
  });

  it('fails closed when the encryption key is missing', async () => {
    const res = await pairRoute(
      pairRequest(JSON.stringify({ code: 'ABCD-EFGH', siteUrl: 'https://shop.example.com' }))
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('CONFIG_MISSING');
    expect(JSON.stringify(body)).not.toMatch(/[0-9a-f]{64}/);
  });

  it('reports missing connector storage instead of pretending to pair', async () => {
    process.env.SITEPILOT_ENCRYPTION_KEY = 'a'.repeat(64);

    const res = await pairRoute(
      pairRequest(JSON.stringify({ code: 'ABCD-EFGH', siteUrl: 'https://shop.example.com' }))
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('STORAGE_UNAVAILABLE');
  });

  it('rate-limits brute-force pairing attempts', async () => {
    process.env.SITEPILOT_ENCRYPTION_KEY = 'a'.repeat(64);
    let lastStatus = 0;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const res = await pairRoute(
        pairRequest(JSON.stringify({ code: 'ZZZZZZZZ', siteUrl: 'https://shop.example.com' }))
      );
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });

  it('refuses to mint a pairing code without an account', async () => {
    const res = await pairingCodeRoute(
      new Request('https://app.example.com/api/connector/pairing-codes', { method: 'POST' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CONNECTOR_REQUIRES_ACCOUNT');
    expect(JSON.stringify(body)).not.toMatch(/[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}/);
  });

  it('refuses to queue a job without an account', async () => {
    const res = await jobsRoute(
      new Request('https://app.example.com/api/connector/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: '11111111-1111-4111-8111-111111111111', tool: 'site.info' }),
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CONNECTOR_REQUIRES_ACCOUNT');
  });

  it('refuses to list sites without an account', async () => {
    const res = await sitesRoute();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CONNECTOR_REQUIRES_ACCOUNT');
  });
});

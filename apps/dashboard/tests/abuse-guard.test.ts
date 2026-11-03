import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryAbuseStore } from '@wp-agent/api-core';
import {
  clientIpFrom,
  enforceAbuseLimit,
  getSharedAbuseStore,
  resetAbuseStore,
} from '../src/lib/abuse';
import {
  checkConnectorRateLimit,
  checkPairingRateLimit,
  resetPairingRateLimit,
} from '../src/lib/connector/rate-limit';
import { POST as pairRoute } from '../src/app/api/connector/pair/route';

const SRC = path.resolve(__dirname, '../src');
const ENV_KEYS = [
  'SITEPILOT_ENCRYPTION_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SITEPILOT_ABUSE_PAIR',
] as const;
const saved = new Map<string, string | undefined>();

function pairRequest() {
  return new Request('https://app.example.com/api/connector/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.77' },
    body: JSON.stringify({ code: 'ZZZZZZZZ', siteUrl: 'https://shop.example.com' }),
  });
}

describe('E11-02 dashboard abuse gate', () => {
  beforeEach(() => {
    resetAbuseStore();
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    resetAbuseStore();
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('reads the first forwarded hop as the client IP', () => {
    expect(
      clientIpFrom(
        new Request('https://x.example/api', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })
      )
    ).toBe('203.0.113.9');
    expect(clientIpFrom(new Request('https://x.example/api', { headers: { 'x-real-ip': '198.51.100.4' } }))).toBe('198.51.100.4');
    expect(clientIpFrom(new Request('https://x.example/api'))).toBe('unknown');
  });

  it('allows a normal request with visible rate-limit metadata', async () => {
    const gate = await enforceAbuseLimit({
      action: 'chat',
      dimension: 'user',
      subjectId: 'user-1',
      env: { SITEPILOT_ABUSE_CHAT: '3' },
    });
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.headers['X-Abuse']).toBe('ok');
      expect(gate.headers['X-RateLimit-Limit']).toBe('3');
      expect(gate.headers['X-RateLimit-Remaining']).toBe('2');
      expect(gate.headers['Retry-After']).toBeUndefined();
    }
  });

  it('returns a typed, honest 429 at the burst ceiling', async () => {
    const input = { action: 'plan' as const, dimension: 'user' as const, subjectId: 'user-secret-id', env: { SITEPILOT_ABUSE_PLAN: '2' } };
    expect((await enforceAbuseLimit(input)).ok).toBe(true);
    expect((await enforceAbuseLimit(input)).ok).toBe(true);
    const denied = await enforceAbuseLimit(input);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.response.status).toBe(429);
      expect(denied.response.headers.get('Cache-Control')).toBe('no-store');
      expect(Number(denied.response.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
      expect(denied.response.headers.get('X-Abuse-Dimension')).toBe('user');
      const body = await denied.response.json();
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.action).toBe('plan');
      expect(body.limit).toBe(2);
      expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(body)).not.toContain('user-secret-id');
    }
  });

  it('degrades visibly when the counter throws, but never blocks the user', async () => {
    const gate = await enforceAbuseLimit({
      action: 'pair',
      dimension: 'ip',
      subjectId: '203.0.113.9',
      store: createMemoryAbuseStore({ failWith: 'counter offline' }),
    });
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.decision).toBeNull();
      expect(gate.headers['X-Abuse']).toBe('unavailable');
    }
  });

  it('keeps the three dimensions independent', async () => {
    const env = { SITEPILOT_ABUSE_PAIR: '1', SITEPILOT_ABUSE_CHAT: '1' };
    expect((await enforceAbuseLimit({ action: 'pair', dimension: 'ip', subjectId: 'same-id', env })).ok).toBe(true);
    expect((await enforceAbuseLimit({ action: 'pair', dimension: 'ip', subjectId: 'same-id', env })).ok).toBe(false);
    expect((await enforceAbuseLimit({ action: 'chat', dimension: 'user', subjectId: 'same-id', env })).ok).toBe(true);
    expect(getSharedAbuseStore().size()).toBe(2);
  });

  it('backs the legacy per-IP and per-site limiters with one shared counter', () => {
    for (let i = 0; i < 10; i += 1) expect(checkPairingRateLimit('203.0.113.9', 1_000).ok).toBe(true);
    expect(checkPairingRateLimit('203.0.113.9', 1_000)).toMatchObject({ ok: false });
    expect(checkConnectorRateLimit('site-1', 1_000).ok).toBe(true);
    expect(checkPairingRateLimit('198.51.100.1', 1_000).ok).toBe(true);
    resetPairingRateLimit();
    expect(checkPairingRateLimit('203.0.113.9', 1_000).ok).toBe(true);
    expect(getSharedAbuseStore().size()).toBe(1);
  });

  it('makes the public pairing route answer a graceful typed 429 under a burst', async () => {
    let last: Response | null = null;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      last = await pairRoute(pairRequest());
    }
    expect(last?.status).toBe(429);
    const body = await last!.json();
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.dimension).toBe('ip');
    expect(Number(last!.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body)).not.toContain('203.0.113.77');

    resetPairingRateLimit();
    const afterReset = await pairRoute(pairRequest());
    expect(afterReset.status).not.toBe(429);
  });

  it('wires the per-user guard into both expensive user API routes', () => {
    for (const route of ['app/api/chat/route.ts', 'app/api/plan/route.ts']) {
      const source = fs.readFileSync(path.join(SRC, route), 'utf8');
      expect(source, route).toContain('enforceAbuseLimit');
      expect(source, route).toContain("dimension: 'user'");
      expect(source, route).toContain('abuse.headers');
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  ABUSE_ACTIONS,
  ABUSE_ENV_KEYS,
  DEFAULT_ABUSE_LIMITS,
  abuseExceededBody,
  abuseHeaders,
  abuseKey,
  createMemoryAbuseStore,
  decideAbuse,
  enforceAbuse,
  resolveAbuseLimits,
  type AbuseDecision,
} from '../src/abuse';

const NOW = new Date('2026-11-03T11:00:00.000Z');

describe('E11-02 abuse policy', () => {
  it('defends exactly three dimensions across four actions', () => {
    expect(ABUSE_ACTIONS).toEqual(['pair', 'connector', 'plan', 'chat']);
    const dimensions = new Set(Object.values(DEFAULT_ABUSE_LIMITS).map((limit) => limit.dimension));
    expect([...dimensions].sort()).toEqual(['ip', 'site', 'user']);
    expect(DEFAULT_ABUSE_LIMITS.pair).toMatchObject({ action: 'pair', dimension: 'ip', limit: 10 });
    expect(DEFAULT_ABUSE_LIMITS.connector).toMatchObject({ dimension: 'site', limit: 240 });
    expect(DEFAULT_ABUSE_LIMITS.plan.dimension).toBe('user');
    expect(DEFAULT_ABUSE_LIMITS.chat.dimension).toBe('user');
    for (const limit of Object.values(DEFAULT_ABUSE_LIMITS)) {
      expect(limit.limit).toBeGreaterThan(0);
      expect(limit.windowSeconds).toBeGreaterThan(0);
      expect(limit.description.length).toBeGreaterThan(0);
    }
  });

  it('accepts bounded env overrides and ignores junk', () => {
    const env = {
      SITEPILOT_ABUSE_PAIR: '25',
      SITEPILOT_ABUSE_PAIR_WINDOW: '120',
      SITEPILOT_ABUSE_PLAN: 'lots',
      SITEPILOT_ABUSE_CHAT: '0',
      SITEPILOT_ABUSE_CONNECTOR: '999999',
      SITEPILOT_ABUSE_CONNECTOR_WINDOW: '-4',
    };
    const limits = resolveAbuseLimits(env);
    expect(limits.pair).toMatchObject({ limit: 25, windowSeconds: 120 });
    expect(limits.plan.limit).toBe(DEFAULT_ABUSE_LIMITS.plan.limit);
    expect(limits.chat.limit).toBe(DEFAULT_ABUSE_LIMITS.chat.limit);
    expect(limits.connector).toMatchObject({
      limit: DEFAULT_ABUSE_LIMITS.connector.limit,
      windowSeconds: DEFAULT_ABUSE_LIMITS.connector.windowSeconds,
    });
    for (const action of ABUSE_ACTIONS) expect(ABUSE_ENV_KEYS[action]).toContain('SITEPILOT_ABUSE_');
  });

  it('scopes keys by action and dimension and never trusts a blank subject', () => {
    expect(abuseKey('pair', 'ip', '203.0.113.9')).toBe('abuse:pair:ip:203.0.113.9');
    expect(abuseKey('chat', 'user', '203.0.113.9')).not.toBe(abuseKey('pair', 'ip', '203.0.113.9'));
    expect(abuseKey('pair', 'ip', '   ')).toBe('abuse:pair:ip:unknown');
    expect(abuseKey('pair', 'ip', 'x'.repeat(500))).toHaveLength('abuse:pair:ip:'.length + 200);
  });

  it('denies at the boundary without recording the blocked attempt', () => {
    const base = { action: 'plan' as const, dimension: 'user' as const, limit: 2, windowSeconds: 60 };
    const first = decideAbuse({ ...base, hits: [], now: NOW });
    expect(first.decision).toMatchObject({ allowed: true, used: 1, remaining: 1 });
    const second = decideAbuse({ ...base, hits: first.hits, now: NOW });
    expect(second.decision).toMatchObject({ allowed: true, used: 2, remaining: 0 });
    const third = decideAbuse({ ...base, hits: second.hits, now: NOW });
    expect(third.decision).toMatchObject({ allowed: false, used: 2, remaining: 0, retryAfterSeconds: 60 });
    expect(third.hits).toEqual(second.hits);
    expect(third.decision.resetAt).toBe(new Date(NOW.getTime() + 60_000).toISOString());
  });

  it('rolls the window over after the oldest hit expires', () => {
    const store = createMemoryAbuseStore({ now: () => NOW });
    const input = { action: 'chat' as const, dimension: 'user' as const, subjectId: 'user-1' };
    const limits = resolveAbuseLimits({ SITEPILOT_ABUSE_CHAT: '1' });
    expect(enforceAbuse(store, input, { limits, now: NOW }).allowed).toBe(true);
    expect(enforceAbuse(store, input, { limits, now: NOW }).allowed).toBe(false);
    const later = new Date(NOW.getTime() + 61_000);
    const rolled = enforceAbuse(store, input, { limits, now: later });
    expect(rolled.allowed).toBe(true);
    expect(rolled.used).toBe(1);
  });

  it('keeps separate subjects independent', () => {
    const store = createMemoryAbuseStore({ now: () => NOW });
    const limits = resolveAbuseLimits({ SITEPILOT_ABUSE_PAIR: '1' });
    expect(enforceAbuse(store, { action: 'pair', dimension: 'ip', subjectId: 'a' }, { limits, now: NOW }).allowed).toBe(true);
    expect(enforceAbuse(store, { action: 'pair', dimension: 'ip', subjectId: 'a' }, { limits, now: NOW }).allowed).toBe(false);
    expect(enforceAbuse(store, { action: 'pair', dimension: 'ip', subjectId: 'b' }, { limits, now: NOW }).allowed).toBe(true);
    expect(store.size()).toBe(2);
  });

  it('produces honest headers and a typed body with no subject id', () => {
    const denied: AbuseDecision = {
      allowed: false,
      action: 'pair',
      dimension: 'ip',
      limit: 10,
      windowSeconds: 60,
      used: 10,
      remaining: 0,
      resetAt: new Date(NOW.getTime() + 30_000).toISOString(),
      retryAfterSeconds: 30,
    };
    const headers = abuseHeaders(denied);
    expect(headers['Retry-After']).toBe('30');
    expect(headers['X-RateLimit-Limit']).toBe('10');
    expect(headers['X-RateLimit-Remaining']).toBe('0');
    expect(headers['X-RateLimit-Policy']).toBe('10;w=60');
    expect(headers['X-Abuse-Dimension']).toBe('ip');
    const allowedHeaders = abuseHeaders({ ...denied, allowed: true, remaining: 4 });
    expect(allowedHeaders['Retry-After']).toBeUndefined();

    const body = abuseExceededBody(denied);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.retryAfterSeconds).toBe(30);
    expect(body.message).toContain('30s');
    expect(JSON.stringify(body)).not.toContain('203.0.113.9');
    expect(body).not.toHaveProperty('subjectId');
  });

  it('fails closed when a store throws (caller decides degradation)', () => {
    const store = createMemoryAbuseStore({ failWith: 'counter offline' });
    expect(() =>
      enforceAbuse(store, { action: 'chat', dimension: 'user', subjectId: 'u' }, { now: NOW })
    ).toThrow('counter offline');
  });
});

describe('E11-02 deterministic load simulation (graceful 429s)', () => {
  it('10 sites × 60s polling stays under the per-site ceiling', () => {
    const store = createMemoryAbuseStore({ now: () => NOW });
    let allowed = 0;
    for (let site = 0; site < 10; site += 1) {
      for (let second = 0; second < 60; second += 1) {
        const at = new Date(NOW.getTime() + second * 1_000);
        const decision = enforceAbuse(
          store,
          { action: 'connector', dimension: 'site', subjectId: `site-${site}` },
          { now: at }
        );
        if (decision.allowed) allowed += 1;
      }
    }
    expect(allowed).toBe(600);
    expect(store.size()).toBe(10);
  });

  it('50 concurrent plan requests degrade to typed 429s, not an outage', () => {
    const store = createMemoryAbuseStore({ now: () => NOW });
    const decisions: AbuseDecision[] = [];
    for (let i = 0; i < 50; i += 1) {
      decisions.push(
        enforceAbuse(store, { action: 'plan', dimension: 'user', subjectId: 'user-1' }, { now: NOW })
      );
    }
    const allowed = decisions.filter((decision) => decision.allowed);
    const denied = decisions.filter((decision) => !decision.allowed);
    expect(allowed).toHaveLength(DEFAULT_ABUSE_LIMITS.plan.limit);
    expect(denied).toHaveLength(50 - DEFAULT_ABUSE_LIMITS.plan.limit);
    for (const decision of denied) {
      const body = abuseExceededBody(decision);
      const headers = abuseHeaders(decision);
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1);
      expect(new Date(body.resetAt).getTime()).toBeGreaterThan(NOW.getTime());
      expect(JSON.stringify(body)).not.toContain('user-1');
      expect(body.limit).toBe(DEFAULT_ABUSE_LIMITS.plan.limit);
    }
  });

  it('1,000 job-result events from one site stop at the ceiling and recover', () => {
    const store = createMemoryAbuseStore({ now: () => NOW });
    let allowed = 0;
    let denied = 0;
    for (let i = 0; i < 1_000; i += 1) {
      const decision = enforceAbuse(
        store,
        { action: 'connector', dimension: 'site', subjectId: 'site-hot' },
        { now: NOW }
      );
      if (decision.allowed) allowed += 1;
      else denied += 1;
    }
    expect(allowed).toBe(DEFAULT_ABUSE_LIMITS.connector.limit);
    expect(denied).toBe(1_000 - DEFAULT_ABUSE_LIMITS.connector.limit);
    const after = enforceAbuse(
      store,
      { action: 'connector', dimension: 'site', subjectId: 'site-hot' },
      { now: new Date(NOW.getTime() + 61_000) }
    );
    expect(after.allowed).toBe(true);
    expect(after.used).toBe(1);
  });
});

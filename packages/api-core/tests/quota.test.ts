import { describe, expect, it } from 'vitest';
import {
  DAY_SECONDS,
  DEFAULT_QUOTAS,
  decideQuota,
  quotaCounterKey,
  quotaExceededBody,
  quotaHeaders,
  resolveQuotaLimits,
} from '../src/quota';

const NOW = new Date('2026-11-02T10:00:00.000Z');

describe('quota limits', () => {
  it('ships generous daily defaults for every kind', () => {
    expect(DEFAULT_QUOTAS.ai).toMatchObject({ limit: 200, windowSeconds: DAY_SECONDS });
    expect(DEFAULT_QUOTAS.plan.windowSeconds).toBe(DAY_SECONDS);
    expect(DEFAULT_QUOTAS.job.windowSeconds).toBe(DAY_SECONDS);
    for (const quota of Object.values(DEFAULT_QUOTAS)) {
      expect(quota.description.length).toBeGreaterThan(0);
    }
  });

  it('lets an operator override a limit and ignores junk', () => {
    const limits = resolveQuotaLimits({
      SITEPILOT_QUOTA_AI: '50',
      SITEPILOT_QUOTA_PLAN: 'lots',
      SITEPILOT_QUOTA_JOB: '-5',
    });

    expect(limits.ai.limit).toBe(50);
    // A typo must never take the product down: fall back to the safe default.
    expect(limits.plan.limit).toBe(DEFAULT_QUOTAS.plan.limit);
    expect(limits.job.limit).toBe(DEFAULT_QUOTAS.job.limit);
    expect(resolveQuotaLimits({ SITEPILOT_QUOTA_AI: '999999' }).ai.limit).toBe(DEFAULT_QUOTAS.ai.limit);
  });

  it('builds one counter key per user per kind', () => {
    const userId = '6a1c0f5e-1111-4a2b-9c3d-000000000001';
    expect(quotaCounterKey('ai', userId)).toBe(`quota:ai:${userId}`);
    expect(quotaCounterKey('ai', userId)).not.toBe(quotaCounterKey('job', userId));
  });
});

describe('quota decisions', () => {
  const limit = { limit: 3, windowSeconds: 3600, description: 'test' };

  it('allows while under the limit and reports the remainder', () => {
    const decision = decideQuota('ai', limit, 2, new Date(NOW.getTime() - 60_000), NOW);

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(1);
    expect(decision.used).toBe(2);
    expect(decision.retryAfterSeconds).toBe(60 * 59);
  });

  it('denies at the limit and names the real reset time', () => {
    const startedAt = new Date(NOW.getTime() - 30 * 60_000);
    const decision = decideQuota('ai', limit, 3, startedAt, NOW);

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    // 30 minutes into a 60-minute window: half the window is left, not all of it.
    expect(decision.retryAfterSeconds).toBe(30 * 60);
    expect(decision.resetAt).toBe(new Date(startedAt.getTime() + 3600_000).toISOString());
  });

  it('treats a spent window as fresh', () => {
    const decision = decideQuota('ai', limit, 99, new Date(NOW.getTime() - 3600_000), NOW);

    expect(decision.allowed).toBe(true);
    expect(decision.used).toBe(0);
    expect(decision.remaining).toBe(3);
    expect(decision.retryAfterSeconds).toBe(3600);
  });

  it('never reports a zero retry-after or negative remaining', () => {
    const decision = decideQuota('job', limit, 1_000, new Date(NOW.getTime() - 1000), NOW);

    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(decision.remaining).toBe(0);
  });
});

describe('quota response metadata', () => {
  const limit = { limit: 3, windowSeconds: 3600, description: 'test' };

  it('emits rate-limit headers and Retry-After only when blocked', () => {
    const allowed = quotaHeaders(decideQuota('ai', limit, 1, new Date(NOW.getTime() - 60_000), NOW));
    expect(allowed['X-RateLimit-Limit']).toBe('3');
    expect(allowed['X-RateLimit-Remaining']).toBe('2');
    expect(allowed['Retry-After']).toBeUndefined();

    const blocked = quotaHeaders(decideQuota('ai', limit, 3, new Date(NOW.getTime() - 60_000), NOW));
    expect(blocked['Retry-After']).toBe(String(60 * 60 - 60));
    expect(blocked['X-RateLimit-Policy']).toBe('3;w=3600');
  });

  it('writes a body that states the number, the window and the reset time', () => {
    const decision = decideQuota('ai', limit, 3, new Date(NOW.getTime() - 60_000), NOW);
    const body = quotaExceededBody(decision);

    expect(body.code).toBe('QUOTA_EXCEEDED');
    expect(body.message).toContain('3 test');
    expect(body.message).toContain(decision.resetAt);
    expect(body.retryAfterSeconds).toBe(decision.retryAfterSeconds);
    // No secret, no internal path, no provider name.
    expect(JSON.stringify(body)).not.toMatch(/supabase|api\.|sk_|Bearer/i);
  });
});

/**
 * Legacy per-endpoint limiters, now backed by the E11-02 shared abuse counter.
 *
 * Keeping these names means existing routes and tests stay unchanged, but there
 * is now ONE sliding-window implementation for per-IP pairing, per-site signed
 * connector traffic and per-user API bursts instead of three ad-hoc maps.
 *
 * Multi-instance deployments get a per-instance budget, which is acceptable for
 * a one-minute abuse window; `getSharedAbuseStore()` returns the injectable port
 * so a shared store can replace it later without touching the routes.
 */
import {
  DEFAULT_ABUSE_LIMITS,
  abuseKey,
  type AbuseDecision,
} from '@wp-agent/api-core';
import {
  clientIpFrom,
  getSharedAbuseStore,
  resetAbuseStore,
} from '../abuse';

export { clientIpFrom };

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

function toLegacyResult(decision: AbuseDecision): RateLimitResult {
  return decision.allowed
    ? { ok: true, remaining: decision.remaining }
    : { ok: false, retryAfterSeconds: decision.retryAfterSeconds };
}

/** Public pairing: 10 attempts per client IP per minute (code-guessing guard). */
export function checkPairingRateLimit(key: string, now = Date.now()): RateLimitResult {
  const limit = DEFAULT_ABUSE_LIMITS.pair;
  return toLegacyResult(
    getSharedAbuseStore().consume({
      key: abuseKey('pair', 'ip', key),
      action: 'pair',
      dimension: 'ip',
      limit: limit.limit,
      windowSeconds: limit.windowSeconds,
      now: new Date(now),
    })
  );
}

/**
 * Per-site request budget for signed connector calls (heartbeat, claim, result).
 * 240/min leaves a 1/s polling connector 4x headroom while stopping a runaway
 * loop from exhausting the free tier.
 */
export function checkConnectorRateLimit(key: string, now = Date.now()): RateLimitResult {
  const limit = DEFAULT_ABUSE_LIMITS.connector;
  return toLegacyResult(
    getSharedAbuseStore().consume({
      key: abuseKey('connector', 'site', key),
      action: 'connector',
      dimension: 'site',
      limit: limit.limit,
      windowSeconds: limit.windowSeconds,
      now: new Date(now),
    })
  );
}

/** Resets the shared limiter (tests only). */
export function resetPairingRateLimit(): void {
  resetAbuseStore();
}

/** Resets the shared limiter (tests only). */
export function resetConnectorRateLimit(): void {
  resetAbuseStore();
}

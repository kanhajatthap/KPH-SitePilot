/**
 * E11-02 — transport-neutral abuse / burst rate limits.
 *
 * Quotas (`quota.ts`) are *daily cost ceilings* counted in Postgres. This module
 * is the short-window *abuse guard*: per-IP pairing, per-site connector polling
 * and per-user plan/chat bursts. It is pure and injectable — the counter is a
 * sliding window over an injectable clock, so a deterministic load simulation
 * can prove that overload produces graceful, honest 429s instead of an outage.
 *
 * A denial never echoes the subject id (IP, user id or site id) and always
 * reports the REAL reset time and `Retry-After`, never a made-up "30 seconds".
 */

export type AbuseAction = 'pair' | 'connector' | 'plan' | 'chat';
export type AbuseDimension = 'ip' | 'user' | 'site';

export interface AbuseLimit {
  action: AbuseAction;
  dimension: AbuseDimension;
  limit: number;
  windowSeconds: number;
  description: string;
}

export const ABUSE_ACTIONS: readonly AbuseAction[] = ['pair', 'connector', 'plan', 'chat'];

/**
 * One minute is long enough to stop a loop and short enough that a human is
 * never locked out for long. 240/min leaves a 1/s polling connector 4x headroom.
 */
export const DEFAULT_ABUSE_LIMITS: Record<AbuseAction, AbuseLimit> = {
  pair: { action: 'pair', dimension: 'ip', limit: 10, windowSeconds: 60, description: 'pairing attempts per minute' },
  connector: { action: 'connector', dimension: 'site', limit: 240, windowSeconds: 60, description: 'connector requests per minute' },
  plan: { action: 'plan', dimension: 'user', limit: 30, windowSeconds: 60, description: 'plan requests per minute' },
  chat: { action: 'chat', dimension: 'user', limit: 60, windowSeconds: 60, description: 'chat messages per minute' },
};

export const ABUSE_ENV_KEYS: Record<AbuseAction, string> = {
  pair: 'SITEPILOT_ABUSE_PAIR',
  connector: 'SITEPILOT_ABUSE_CONNECTOR',
  plan: 'SITEPILOT_ABUSE_PLAN',
  chat: 'SITEPILOT_ABUSE_CHAT',
};

const MIN_LIMIT = 1;
const MAX_LIMIT = 100_000;
const MIN_WINDOW_SECONDS = 1;
const MAX_WINDOW_SECONDS = 86_400;

function parseBoundedInt(value: string | undefined, min: number, max: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/** Malformed or out-of-range overrides fall back to the safe default. */
export function resolveAbuseLimits(
  env: Record<string, string | undefined> = process.env
): Record<AbuseAction, AbuseLimit> {
  const resolved = {} as Record<AbuseAction, AbuseLimit>;
  for (const action of ABUSE_ACTIONS) {
    const base = DEFAULT_ABUSE_LIMITS[action];
    const limit = parseBoundedInt(env[ABUSE_ENV_KEYS[action]], MIN_LIMIT, MAX_LIMIT);
    const windowSeconds = parseBoundedInt(
      env[`${ABUSE_ENV_KEYS[action]}_WINDOW`],
      MIN_WINDOW_SECONDS,
      MAX_WINDOW_SECONDS
    );
    resolved[action] = {
      ...base,
      limit: limit ?? base.limit,
      windowSeconds: windowSeconds ?? base.windowSeconds,
    };
  }
  return resolved;
}

/** Subject ids are scoped by action + dimension, never shared across them. */
export function abuseKey(action: AbuseAction, dimension: AbuseDimension, subjectId: string): string {
  const safe = String(subjectId ?? '').trim().slice(0, 200) || 'unknown';
  return `abuse:${action}:${dimension}:${safe}`;
}

export interface AbuseDecision {
  allowed: boolean;
  action: AbuseAction;
  dimension: AbuseDimension;
  limit: number;
  windowSeconds: number;
  used: number;
  remaining: number;
  /** ISO timestamp at which the oldest hit in the window expires. */
  resetAt: string;
  /** Whole seconds until reset; always at least 1. */
  retryAfterSeconds: number;
}

export interface DecideAbuseInput {
  action: AbuseAction;
  dimension: AbuseDimension;
  limit: number;
  windowSeconds: number;
  /** All recorded hit timestamps (ms) — the caller owns the window filter. */
  hits: readonly number[];
  now: Date;
}

/**
 * Pure sliding-window decision. On an allow, the new hit is included in `used`
 * and `remaining`; on a denial nothing is recorded, so a blocked client cannot
 * extend its own penalty by retrying.
 */
export function decideAbuse(input: DecideAbuseInput): {
  decision: AbuseDecision;
  hits: number[];
} {
  const limit = Math.max(MIN_LIMIT, Math.floor(input.limit));
  const windowSeconds = Math.min(
    MAX_WINDOW_SECONDS,
    Math.max(MIN_WINDOW_SECONDS, Math.floor(input.windowSeconds))
  );
  const windowMs = windowSeconds * 1000;
  const nowMs = input.now.getTime();
  const recent = input.hits.filter((stamp) => nowMs - stamp < windowMs).sort((a, b) => a - b);

  if (recent.length >= limit) {
    const resetMs = recent[0] + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - nowMs) / 1000));
    return {
      decision: {
        allowed: false,
        action: input.action,
        dimension: input.dimension,
        limit,
        windowSeconds,
        used: recent.length,
        remaining: 0,
        resetAt: new Date(resetMs).toISOString(),
        retryAfterSeconds,
      },
      hits: recent,
    };
  }

  const nextHits = [...recent, nowMs];
  const resetMs = (recent[0] ?? nowMs) + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - nowMs) / 1000));
  return {
    decision: {
      allowed: true,
      action: input.action,
      dimension: input.dimension,
      limit,
      windowSeconds,
      used: nextHits.length,
      remaining: Math.max(0, limit - nextHits.length),
      resetAt: new Date(resetMs).toISOString(),
      retryAfterSeconds,
    },
    hits: nextHits,
  };
}

/** `X-RateLimit-*` metadata plus `Retry-After` only on a denial. */
export function abuseHeaders(decision: AbuseDecision): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(decision.limit),
    'X-RateLimit-Remaining': String(decision.remaining),
    'X-RateLimit-Reset': decision.resetAt,
    'X-RateLimit-Policy': `${decision.limit};w=${decision.windowSeconds}`,
    'X-Abuse-Action': decision.action,
    'X-Abuse-Dimension': decision.dimension,
  };
  if (!decision.allowed) headers['Retry-After'] = String(decision.retryAfterSeconds);
  return headers;
}

export interface AbuseExceededBody {
  error: 'RATE_LIMIT_EXCEEDED';
  code: 'RATE_LIMIT_EXCEEDED';
  message: string;
  action: AbuseAction;
  dimension: AbuseDimension;
  limit: number;
  windowSeconds: number;
  used: number;
  resetAt: string;
  retryAfterSeconds: number;
}

/** Typed 429 body. No subject id, no stack, no guess about the reset time. */
export function abuseExceededBody(decision: AbuseDecision): AbuseExceededBody {
  return {
    error: 'RATE_LIMIT_EXCEEDED',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests (${decision.limit} ${decision.action} requests per ${decision.windowSeconds}s). Retry in ${decision.retryAfterSeconds}s; the limit resets at ${decision.resetAt}.`,
    action: decision.action,
    dimension: decision.dimension,
    limit: decision.limit,
    windowSeconds: decision.windowSeconds,
    used: decision.used,
    resetAt: decision.resetAt,
    retryAfterSeconds: decision.retryAfterSeconds,
  };
}

export interface AbuseConsumeInput {
  key: string;
  action: AbuseAction;
  dimension: AbuseDimension;
  limit: number;
  windowSeconds: number;
  now?: Date;
}

export interface AbuseStore {
  /** Synchronous = atomic within one JS turn: no await gap for a race. */
  consume(input: AbuseConsumeInput): AbuseDecision;
  reset(): void;
  size(): number;
}

export interface MemoryAbuseStoreOptions {
  now?: () => Date;
  /** Injects a store failure so callers can test their degradation policy. */
  failWith?: string;
  maxKeys?: number;
}

/** In-process sliding-window counter. Production can swap in a shared store. */
export function createMemoryAbuseStore(options: MemoryAbuseStoreOptions = {}): AbuseStore {
  const hits = new Map<string, number[]>();
  const now = options.now ?? (() => new Date());
  const maxKeys = options.maxKeys ?? 5_000;

  return {
    consume(input) {
      if (options.failWith) throw new Error(options.failWith);
      const at = input.now ?? now();
      const result = decideAbuse({
        action: input.action,
        dimension: input.dimension,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
        hits: hits.get(input.key) ?? [],
        now: at,
      });
      hits.set(input.key, result.hits);

      if (hits.size > maxKeys) {
        const windowMs = result.decision.windowSeconds * 1000;
        for (const [key, stamps] of hits) {
          if (stamps.every((stamp) => at.getTime() - stamp >= windowMs)) hits.delete(key);
        }
      }
      return result.decision;
    },
    reset() {
      hits.clear();
    },
    size() {
      return hits.size;
    },
  };
}

export interface EnforceAbuseInput {
  action: AbuseAction;
  dimension: AbuseDimension;
  subjectId: string | null | undefined;
}

export interface EnforceAbuseOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
  limits?: Record<AbuseAction, AbuseLimit>;
}

/** Resolves the limit, builds the scoped key and consumes one unit. */
export function enforceAbuse(
  store: AbuseStore,
  input: EnforceAbuseInput,
  options: EnforceAbuseOptions = {}
): AbuseDecision {
  const limits = options.limits ?? resolveAbuseLimits(options.env ?? process.env);
  const limit = limits[input.action];
  return store.consume({
    key: abuseKey(input.action, input.dimension, input.subjectId ?? ''),
    action: input.action,
    dimension: input.dimension,
    limit: limit.limit,
    windowSeconds: limit.windowSeconds,
    now: options.now,
  });
}

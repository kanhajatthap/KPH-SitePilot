/**
 * Per-user free-tier quotas.
 *
 * Everything here is pure: limits, window maths, the 429 body and the headers.
 * The counter lives in Postgres (`consume_agent_rate_limit`, a fixed-window
 * counter with the user id as the key) so two concurrent requests can never both
 * read "99 used" and both be allowed.
 *
 * Why quotas at all when the model key is the user's own (BYOK)? Three reasons:
 *
 *   1. a runaway client loop is indistinguishable from abuse at the provider;
 *   2. connector jobs wake a customer's WordPress site — that is someone else's
 *      CPU, so it needs a ceiling;
 *   3. a free tier needs a number that can be explained in one sentence.
 *
 * A quota is a cost guardrail, not an authorisation boundary: it never decides
 * *what* a user may do, only how much of it per day.
 */

export type QuotaKind = 'ai' | 'plan' | 'job';

export interface QuotaLimit {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. Never shorter than a minute. */
  windowSeconds: number;
  /** One line the UI can show verbatim. */
  description: string;
}

export const DAY_SECONDS = 86_400;

const MIN_WINDOW_SECONDS = 60;
const MAX_LIMIT = 100_000;

/** Generous daily ceilings: high enough to feel free, low enough to stop a loop. */
export const DEFAULT_QUOTAS: Record<QuotaKind, QuotaLimit> = {
  ai: { limit: 200, windowSeconds: DAY_SECONDS, description: 'AI messages per day' },
  plan: { limit: 100, windowSeconds: DAY_SECONDS, description: 'plans per day' },
  job: { limit: 500, windowSeconds: DAY_SECONDS, description: 'site jobs per day' },
};

export const QUOTA_ENV_KEYS: Record<QuotaKind, string> = {
  ai: 'SITEPILOT_QUOTA_AI',
  plan: 'SITEPILOT_QUOTA_PLAN',
  job: 'SITEPILOT_QUOTA_JOB',
};

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) return null;
  return parsed;
}

/**
 * Applies `SITEPILOT_QUOTA_*` overrides on top of the defaults.
 *
 * A malformed value falls back to the default rather than throwing: a typo in an
 * env var must not take the product down, and the default is the safe number.
 */
export function resolveQuotaLimits(
  env: Record<string, string | undefined> = process.env
): Record<QuotaKind, QuotaLimit> {
  const resolved = {} as Record<QuotaKind, QuotaLimit>;

  for (const kind of Object.keys(DEFAULT_QUOTAS) as QuotaKind[]) {
    const override = parsePositiveInt(env[QUOTA_ENV_KEYS[kind]]);
    resolved[kind] = override
      ? { ...DEFAULT_QUOTAS[kind], limit: override }
      : { ...DEFAULT_QUOTAS[kind] };
  }

  return resolved;
}

/** The counter key. One row per user per quota kind. */
export function quotaCounterKey(kind: QuotaKind, userId: string): string {
  return `quota:${kind}:${userId}`;
}

export interface QuotaDecision {
  allowed: boolean;
  kind: QuotaKind;
  /** Requests allowed in the window. */
  limit: number;
  /** Window length that produced this decision (echoed, never re-derived). */
  windowSeconds: number;
  /** Human description of what was counted, e.g. "AI messages per day". */
  description: string;
  used: number;
  remaining: number;
  /** ISO timestamp of the next reset (window start + window length). */
  resetAt: string;
  /** Whole seconds until the window rolls over; always at least 1. */
  retryAfterSeconds: number;
}

/**
 * Turns "used / limit" into an allow/deny decision with an honest reset time.
 *
 * `windowStartedAt` is when the current window began, so the reset time is the
 * real one the user is waiting for — not "in 24 hours", which is what a naive
 * implementation reports and what makes a 429 feel arbitrary.
 */
export function decideQuota(
  kind: QuotaKind,
  limit: QuotaLimit,
  used: number,
  windowStartedAt: Date,
  now: Date = new Date()
): QuotaDecision {
  const windowMs = Math.max(limit.windowSeconds, MIN_WINDOW_SECONDS) * 1000;
  const startedAt = windowStartedAt.getTime();
  const windowExpired = now.getTime() - startedAt >= windowMs;

  const effectiveUsed = windowExpired ? 0 : Math.max(0, used);
  const allowed = effectiveUsed < limit.limit;
  const resetMs = windowExpired ? now.getTime() + windowMs : startedAt + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - now.getTime()) / 1000));

  return {
    allowed,
    kind,
    limit: limit.limit,
    windowSeconds: Math.max(limit.windowSeconds, MIN_WINDOW_SECONDS),
    description: limit.description,
    used: effectiveUsed,
    remaining: Math.max(0, limit.limit - effectiveUsed),
    resetAt: new Date(resetMs).toISOString(),
    retryAfterSeconds,
  };
}

/** `X-RateLimit-*` metadata, plus `Retry-After` when the quota is spent. */
export function quotaHeaders(decision: QuotaDecision): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(decision.limit),
    'X-RateLimit-Remaining': String(decision.remaining),
    'X-RateLimit-Reset': decision.resetAt,
    'X-RateLimit-Policy': `${decision.limit};w=${decision.windowSeconds}`,
  };

  if (!decision.allowed) headers['Retry-After'] = String(decision.retryAfterSeconds);
  return headers;
}

export interface QuotaExceededBody {
  error: 'QUOTA_EXCEEDED';
  code: 'QUOTA_EXCEEDED';
  message: string;
  kind: QuotaKind;
  limit: number;
  used: number;
  resetAt: string;
  retryAfterSeconds: number;
}

/**
 * The 429 body. States the number, the window and the exact reset time, so the
 * user is never told "try again later" by a service that knows exactly when.
 */
export function quotaExceededBody(decision: QuotaDecision): QuotaExceededBody {
  const description = decision.description;
  const reset = new Date(decision.resetAt);
  const minutes = Math.max(1, Math.ceil(decision.retryAfterSeconds / 60));

  return {
    error: 'QUOTA_EXCEEDED',
    code: 'QUOTA_EXCEEDED',
    message: `Free tier limit reached: ${decision.limit} ${description}. Resets at ${reset.toISOString()} (in about ${minutes} minute${minutes === 1 ? '' : 's'}).`,
    kind: decision.kind,
    limit: decision.limit,
    used: decision.used,
    resetAt: decision.resetAt,
    retryAfterSeconds: decision.retryAfterSeconds,
  };
}

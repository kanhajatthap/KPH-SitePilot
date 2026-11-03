import { NextResponse } from 'next/server';
import {
  abuseExceededBody,
  abuseHeaders,
  createMemoryAbuseStore,
  enforceAbuse as consumeAbuseUnit,
  type AbuseAction,
  type AbuseDecision,
  type AbuseDimension,
  type AbuseStore,
} from '@wp-agent/api-core';

/**
 * E11-02 — server-side abuse gate.
 *
 * One shared in-memory sliding-window counter backs both the public pairing
 * endpoint (per IP), the signed connector routes (per site) and the user APIs
 * (per user). Multi-instance deployments get a per-instance budget, which is
 * acceptable for a one-minute abuse window; a shared store can be injected.
 *
 * Failure policy matches `enforceQuota`: the limiter is a cost guardrail, not
 * an authorisation boundary, so a counter failure is **allowed** but visibly
 * flagged (`X-Abuse: unavailable`) instead of silently degrading.
 */
const sharedStore = createMemoryAbuseStore();

export function getSharedAbuseStore(): AbuseStore {
  return sharedStore;
}

/** Resets the shared counter (tests only). */
export function resetAbuseStore(): void {
  sharedStore.reset();
}

/** Best-effort client identity; the first forwarded hop is the client. */
export function clientIpFrom(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  const realIp = req.headers.get('x-real-ip');
  return realIp?.trim() || 'unknown';
}

export interface AbuseGateInput {
  action: AbuseAction;
  dimension: AbuseDimension;
  subjectId: string | null | undefined;
  now?: Date;
  env?: Record<string, string | undefined>;
  store?: AbuseStore;
}

export interface AbuseGateAllowed {
  ok: true;
  decision: AbuseDecision | null;
  headers: Record<string, string>;
}

export interface AbuseGateDenied {
  ok: false;
  decision: AbuseDecision;
  response: NextResponse;
}

export type AbuseGate = AbuseGateAllowed | AbuseGateDenied;

export async function enforceAbuseLimit(input: AbuseGateInput): Promise<AbuseGate> {
  try {
    const decision = consumeAbuseUnit(input.store ?? sharedStore, input, {
      now: input.now,
      env: input.env ?? process.env,
    });

    if (!decision.allowed) {
      return {
        ok: false,
        decision,
        response: NextResponse.json(abuseExceededBody(decision), {
          status: 429,
          headers: { ...abuseHeaders(decision), 'Cache-Control': 'no-store' },
        }),
      };
    }

    return {
      ok: true,
      decision,
      headers: { ...abuseHeaders(decision), 'X-Abuse': 'ok' },
    };
  } catch {
    // Never let a broken counter brick the product; never echo the raw error.
    return { ok: true, decision: null, headers: { 'X-Abuse': 'unavailable' } };
  }
}

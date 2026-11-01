import { NextResponse } from 'next/server';
import {
  decideQuota,
  quotaExceededBody,
  quotaHeaders,
  resolveQuotaLimits,
  type QuotaDecision,
  type QuotaKind,
} from '@wp-agent/api-core';
import { createSupabaseAdminClient } from './supabase/admin';
import type { AuthContext } from './auth/api';

/**
 * Server-side quota gate for the expensive API routes.
 *
 * The counter is `consume_agent_rate_limit(user_id, max_requests, window_seconds)`
 * — a single-statement fixed window in Postgres, so two concurrent requests can
 * never both observe "under the limit". A denial then re-reads
 * `agent_rate_limits.window_started_at` to report the **real** reset time instead
 * of a made-up "in 24 hours".
 *
 * Failure policy, stated explicitly because it is a real trade-off:
 *
 *   - local mode (no Supabase) → allowed, flagged `skipped`;
 *   - counter unavailable (RPC missing, network) → **allowed**, flagged
 *     `unavailable`. Quotas are a cost guardrail, not an authorisation boundary,
 *     so an infrastructure hiccup must not brick the product. The flag makes the
 *     degradation visible in response headers and logs rather than silent.
 */

export interface QuotaGateAllowed {
  ok: true;
  decision: QuotaDecision | null;
  headers: Record<string, string>;
}

export interface QuotaGateDenied {
  ok: false;
  response: NextResponse;
}

export type QuotaGate = QuotaGateAllowed | QuotaGateDenied;

interface RpcError {
  message?: string;
  code?: string;
}

/** Minimal shape of the admin client so tests can inject a fake. */
export interface QuotaClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: RpcError | null }>;
      };
    };
  };
}

export interface EnforceQuotaOptions {
  /** Injected in tests; defaults to the service-role client. */
  client?: QuotaClient | null;
  now?: Date;
  env?: Record<string, string | undefined>;
}

export function quotaSkippedHeaders(reason: 'skipped' | 'unavailable'): Record<string, string> {
  return { 'X-Quota': reason };
}

/**
 * Counts one unit of `kind` for the caller and allows or denies the request.
 */
export async function enforceQuota(
  context: AuthContext,
  kind: QuotaKind,
  options: EnforceQuotaOptions = {}
): Promise<QuotaGate> {
  const limits = resolveQuotaLimits(options.env ?? process.env);
  const limit = limits[kind];
  const now = options.now ?? new Date();

  // Local-first mode: there is exactly one user and no billing surface.
  if (context.mode !== 'saas' || !context.user) {
    return { ok: true, decision: null, headers: quotaSkippedHeaders('skipped') };
  }

  const client = options.client === undefined ? (createSupabaseAdminClient() as unknown as QuotaClient | null) : options.client;
  if (!client) {
    return { ok: true, decision: null, headers: quotaSkippedHeaders('unavailable') };
  }

  const { data: allowed, error: consumeError } = await client.rpc('consume_agent_rate_limit', {
    p_user_id: context.user.id,
    p_max_requests: limit.limit,
    p_window_seconds: limit.windowSeconds,
  });

  if (consumeError) {
    return { ok: true, decision: null, headers: quotaSkippedHeaders('unavailable') };
  }

  if (allowed !== false) {
    // The RPC answers yes/no without the count, so only the limit is reported.
    // Inventing a `remaining` or a `reset` here would be a guess dressed up as
    // telemetry; the exact numbers are only known on the denial path.
    return {
      ok: true,
      decision: null,
      headers: { 'X-RateLimit-Limit': String(limit.limit), 'X-Quota': 'ok' },
    };
  }

  // Denied: read the window start so the reset time is the real one.
  const { data: row } = await client
    .from('agent_rate_limits')
    .select('window_started_at, request_count')
    .eq('user_id', context.user.id)
    .maybeSingle();

  const windowStartedAt = toDate((row as { window_started_at?: string } | null)?.window_started_at) ?? now;
  const used = Number((row as { request_count?: number } | null)?.request_count ?? limit.limit);
  const decision = decideQuota(kind, limit, used, windowStartedAt, now);
  const denied: QuotaDecision = { ...decision, allowed: false, remaining: 0 };

  return {
    ok: false,
    response: NextResponse.json(quotaExceededBody(denied), {
      status: 429,
      headers: { ...quotaHeaders(denied), 'Cache-Control': 'no-store' },
    }),
  };
}

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

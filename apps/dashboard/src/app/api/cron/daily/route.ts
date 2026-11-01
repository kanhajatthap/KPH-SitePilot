import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/cron/daily` — housekeeping that keeps a free-tier deployment alive.
 *
 * Two jobs, both idempotent:
 *
 *   1. `purge_expired_connector_state()` — expired pairing codes, replay nonces,
 *      old job events and snapshots. Without it the free database fills up and
 *      every write starts failing.
 *   2. a tiny read, so a Supabase project on the free plan never hits the
 *      7-day inactivity pause that takes the whole product offline.
 *
 * Auth is deny-by-default: the caller must present `CRON_SECRET` as
 * `Authorization: Bearer …` (Vercel Cron does this automatically when the secret
 * is set as an env var of that name) and the comparison is timing-safe. With no
 * secret configured the route answers 503 instead of running unauthenticated —
 * an open purge endpoint would be a free denial-of-service.
 */

const KEEP_ALIVE_TABLES = ['projects', 'sites'] as const;

interface AdminClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns: string, options?: { count?: 'exact'; head?: boolean }): {
      limit(n: number): PromiseLike<{ count: number | null; error: { message: string } | null }>;
    };
  };
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface CronResult {
  ok: boolean;
  purged: boolean;
  keepAlive: Record<string, 'ok' | 'error'>;
  errors: string[];
  durationMs: number;
  timestamp: string;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      {
        error: 'CONFIG_MISSING',
        code: 'CONFIG_MISSING',
        message: 'CRON_SECRET is not set, so the cron endpoint stays closed.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!provided || !secretMatches(provided, secret)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', code: 'UNAUTHORIZED', message: 'Cron secret missing or invalid.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const client = createSupabaseAdminClient() as unknown as AdminClient | null;
  if (!client) {
    return NextResponse.json(
      {
        error: 'STORAGE_UNAVAILABLE',
        code: 'STORAGE_UNAVAILABLE',
        message: 'Server-side Supabase credentials are not configured.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const errors: string[] = [];

  const { error: purgeError } = await client.rpc('purge_expired_connector_state');
  if (purgeError) errors.push(`purge: ${purgeError.message}`);

  const keepAlive: Record<string, 'ok' | 'error'> = {};
  for (const table of KEEP_ALIVE_TABLES) {
    const { error } = await client.from(table).select('id', { count: 'exact', head: true }).limit(1);
    keepAlive[table] = error ? 'error' : 'ok';
    if (error) errors.push(`keep-alive ${table}: ${error.message}`);
  }

  const result: CronResult = {
    ok: errors.length === 0,
    purged: !purgeError,
    keepAlive,
    errors,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
    headers: { 'Cache-Control': 'no-store' },
  });
}

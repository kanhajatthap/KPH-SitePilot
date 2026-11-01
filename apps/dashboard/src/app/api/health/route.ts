import { NextResponse } from 'next/server';
import { callApi } from '../../../lib/api-call';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';
import { createSupabaseAdminClient } from '../../../lib/supabase/admin';
import { getEncryptionKey } from '../../../lib/connector/crypto';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';

type Status = 'ok' | 'degraded' | 'failed';
type ApiCheck = 'connected' | 'degraded' | 'disconnected';
type ConfigCheck = 'ready' | 'missing' | 'not-configured' | 'misconfigured';

/**
 * `GET /api/health` — is this deployment actually able to work?
 *
 * Deliberately booleans and versions only: no key, no host, no prefix, no user
 * data. Three audiences use it:
 *
 *   - uptime checks (`status === 'ok'`, HTTP 200);
 *   - the operator after a deploy (which mode, which commit, what is missing);
 *   - the connector page, which points here when a 503 needs explaining.
 *
 * Overall `status` tracks the API only. Connector readiness is reported
 * separately as `checks.storage` / `checks.encryption`, because a deployment that
 * can serve sign-in and the studio is healthy even before a WordPress site is
 * paired — mixing the two would make every fresh deploy look broken.
 */
export async function GET() {
  let authEnabled = false;
  let authMisconfigured = false;

  try {
    authEnabled = getSupabasePublicConfig() !== null;
  } catch {
    // Half-configured Supabase (URL without key, or the reverse) is its own state.
    authMisconfigured = true;
  }

  const mode = authEnabled ? 'hosted' : 'local';
  const authCheck: ConfigCheck = authEnabled ? 'ready' : authMisconfigured ? 'misconfigured' : 'not-configured';
  const storage: ConfigCheck = createSupabaseAdminClient() ? 'ready' : 'not-configured';

  let encryption: ConfigCheck = 'ready';
  try {
    getEncryptionKey();
  } catch {
    encryption = 'missing';
  }

  const { apiCheck, apiDetails } = await probeApi();

  const status: Status = apiCheck === 'connected' ? 'ok' : apiCheck === 'degraded' ? 'degraded' : 'failed';

  const body = {
    status,
    service: 'kph-sitepilot-dashboard',
    version: pkg.version,
    mode,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    checks: {
      dashboard: 'ok' as const,
      apiServer: apiCheck,
      auth: authCheck,
      storage: mode === 'hosted' ? storage : 'not-configured',
      encryption: mode === 'hosted' ? encryption : 'not-configured',
    },
    // Preserved for the existing local-first probes and dashboards.
    dashboard: 'ok' as const,
    apiServer: apiCheck,
    apiDetails,
    timestamp: new Date().toISOString(),
  };

  const httpStatus = status === 'ok' ? 200 : status === 'degraded' ? 502 : 503;

  return NextResponse.json(body, {
    status: httpStatus,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function probeApi(): Promise<{ apiCheck: ApiCheck; apiDetails: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await callApi('/health', { signal: controller.signal });
    if (res.ok) {
      return { apiCheck: 'connected', apiDetails: await res.json() };
    }
    return { apiCheck: 'degraded', apiDetails: null };
  } catch {
    return { apiCheck: 'disconnected', apiDetails: null };
  } finally {
    clearTimeout(timeout);
  }
}

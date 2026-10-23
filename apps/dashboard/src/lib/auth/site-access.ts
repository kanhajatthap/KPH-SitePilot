import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../supabase/server';
import type { AuthContext } from './api';

export type SiteAccessResult = { ok: true } | { ok: false; response: NextResponse };

function normaliseOrigin(value: string): string | null {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

function denied(message: string, code: string): SiteAccessResult {
  return {
    ok: false,
    response: NextResponse.json({ error: code, code, message }, { status: 403 }),
  };
}

function unavailable(message: string, code: string): SiteAccessResult {
  return {
    ok: false,
    response: NextResponse.json({ error: code, code, message }, { status: 503 }),
  };
}

/**
 * Authorises a WordPress target site for the authenticated caller.
 *
 * SaaS mode allows only:
 *   1. the deployment-owned local site configured through `WP_SITE_URL`, and
 *   2. sites registered as an active WordPress connection owned by the caller.
 *
 * Ownership is resolved through `wordpress_connection_metadata`, a
 * security-barrier view filtered by `auth.uid()`, so RLS — not a client-supplied
 * id — decides visibility. Unknown/unauthorised targets fail closed.
 */
export async function authorizeTargetSite(
  context: AuthContext,
  targetSite: string | null | undefined
): Promise<SiteAccessResult> {
  if (!targetSite) return { ok: true };
  if (context.mode === 'local') return { ok: true };
  if (!context.user) return denied('Sign in to access this site.', 'UNAUTHORIZED');

  const requested = normaliseOrigin(targetSite);
  if (!requested) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'VALIDATION_FAILED', code: 'VALIDATION_FAILED', message: 'Invalid target site URL.' },
        { status: 400 }
      ),
    };
  }

  // The local WordPress instance is deployment infrastructure, not user data.
  const deploymentSite = process.env.WP_SITE_URL ? normaliseOrigin(process.env.WP_SITE_URL) : null;
  if (deploymentSite && requested === deploymentSite) return { ok: true };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return denied('Site access cannot be verified.', 'AUTHORIZATION_UNAVAILABLE');

  const { data, error } = await supabase
    .from('wordpress_connection_metadata')
    .select('target_site, status')
    .eq('status', 'active');

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') {
      return unavailable(
        'The multi-tenant schema is not applied to this Supabase project. Apply the committed migration before using connected sites.',
        'SCHEMA_NOT_READY'
      );
    }
    return unavailable('Site ownership could not be verified. Try again.', 'AUTHORIZATION_UNAVAILABLE');
  }

  const owned = (data ?? []).some((row: { target_site?: string | null }) => {
    if (!row.target_site) return false;
    return normaliseOrigin(row.target_site) === requested;
  });

  if (!owned) {
    return denied(
      'This WordPress site is not registered as an active connection for your account.',
      'TARGET_NOT_AUTHORIZED'
    );
  }

  return { ok: true };
}

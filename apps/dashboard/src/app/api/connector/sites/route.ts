import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Lists the caller's connected WordPress sites.
 *
 * Reads the `site_metadata` security-barrier view with the *user* session, so
 * RLS decides visibility: a caller can never see another account's sites, and
 * no token or secret column is exposed by the view at all.
 */
export async function GET() {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      {
        error: 'CONNECTOR_REQUIRES_ACCOUNT',
        message: 'Sign in to see connected WordPress sites.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Supabase is not configured for this deployment.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { data, error } = await supabase
    .from('site_metadata')
    .select('id, project_id, url, name, environment, status, scopes, plugin_version, wp_version, php_version, capabilities, last_seen_at, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        error: 'CONNECTOR_STORAGE_UNAVAILABLE',
        message:
          'Connected sites could not be loaded. Apply the connector migration to this Supabase project first.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { sites: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

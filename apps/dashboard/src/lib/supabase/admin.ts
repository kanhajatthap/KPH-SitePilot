import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@wp-agent/supabase';

/**
 * Service-role Supabase client for server-only connector operations.
 *
 * The credentials are resolved by `@wp-agent/supabase` so that privileged
 * environment names stay in one audited place instead of being repeated across
 * the dashboard bundle. Never import this from a client component: the service
 * role bypasses RLS. Returns null when the deployment is not configured for
 * SaaS mode, so local-first workflows keep working without Supabase.
 */
export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when server-side connector storage is available. */
export function isConnectorStorageConfigured(): boolean {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return Boolean(url && serviceRoleKey);
}

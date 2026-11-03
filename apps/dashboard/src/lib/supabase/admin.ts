import { createClient } from '@supabase/supabase-js';
import {
  createRepositories,
  createSupabaseRepositoryClient,
  getSupabaseConfig,
  type Repositories,
  type SupabaseLike,
} from '@wp-agent/supabase';

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

/**
 * E1-05: the same service-role client exposed as six typed, injectable
 * repositories (`sites`, `plans`, `jobs`, `snapshots`, `audit`, `usage`).
 * Pass a fake `SupabaseLike` in tests; with no argument it resolves the real
 * server-only client and returns null when SaaS storage is not configured.
 * The service role bypasses RLS, so every repository query still pushes an
 * explicit project/owner filter.
 */
export function createAdminRepositories(client?: SupabaseLike | null): Repositories | null {
  const resolved =
    client === undefined
      ? (createSupabaseAdminClient() as unknown as SupabaseLike | null)
      : client;
  if (!resolved) return null;
  return createRepositories(createSupabaseRepositoryClient(resolved));
}

/** True when server-side connector storage is available. */
export function isConnectorStorageConfigured(): boolean {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return Boolean(url && serviceRoleKey);
}

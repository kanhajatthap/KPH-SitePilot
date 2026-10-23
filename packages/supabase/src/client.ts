export interface SupabaseConfig {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  isConfigured: boolean;
}

/**
 * Loads Supabase configuration from environment variables safely.
 * Returns isConfigured: false if not set, enabling zero-friction local standalone workflows.
 */
export function getSupabaseConfig(
  env: Record<string, string | undefined> = process.env
): SupabaseConfig {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  const isConfigured = Boolean(url && (anonKey || serviceRoleKey));

  return {
    url,
    anonKey,
    serviceRoleKey,
    isConfigured,
  };
}

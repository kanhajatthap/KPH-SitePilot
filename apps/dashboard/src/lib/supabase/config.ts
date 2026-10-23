export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export function getSupabasePublicConfig(
  env: Record<string, string | undefined> = process.env
): SupabasePublicConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url && !anonKey) {
    return null;
  }

  if (!url || !anonKey) {
    throw new Error('Supabase URL and anon key must both be configured.');
  }

  return { url, anonKey };
}

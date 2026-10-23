import { describe, expect, it } from 'vitest';
import { getSupabasePublicConfig } from '../src/lib/supabase/config';

describe('Supabase public configuration', () => {
  it('preserves the local mode when Supabase is not configured', () => {
    expect(getSupabasePublicConfig({})).toBeNull();
  });

  it('requires URL and anon key as a pair', () => {
    expect(() => getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }))
      .toThrow('Supabase URL and anon key must both be configured.');
  });

  it('uses only the public anon key and never reads a service-role key', () => {
    expect(getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-placeholder',
      SUPABASE_SERVICE_ROLE_KEY: 'must-not-be-used',
    })).toEqual({
      url: 'https://example.supabase.co',
      anonKey: 'public-anon-placeholder',
    });
  });
});

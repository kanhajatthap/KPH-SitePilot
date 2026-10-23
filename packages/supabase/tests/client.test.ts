import { describe, it, expect } from 'vitest';
import { getSupabaseConfig } from '../src/client.js';

describe('Supabase Client Configuration & Graceful Fallback', () => {
  it('returns isConfigured: false when environment variables are empty', () => {
    const config = getSupabaseConfig({});
    expect(config.isConfigured).toBe(false);
    expect(config.url).toBeUndefined();
    expect(config.anonKey).toBeUndefined();
  });

  it('returns isConfigured: true when URL and anon key are provided', () => {
    const config = getSupabaseConfig({
      SUPABASE_URL: 'https://xyzcompany.supabase.co',
      SUPABASE_ANON_KEY: 'mock-anon-key-12345',
    });

    expect(config.isConfigured).toBe(true);
    expect(config.url).toBe('https://xyzcompany.supabase.co');
    expect(config.anonKey).toBe('mock-anon-key-12345');
  });

  it('supports NEXT_PUBLIC_ prefixed environment variables', () => {
    const config = getSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://frontend.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'frontend-anon-key',
    });

    expect(config.isConfigured).toBe(true);
    expect(config.url).toBe('https://frontend.supabase.co');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseLike, SupabaseResponse } from '@wp-agent/supabase';
import { createAdminRepositories } from '../src/lib/supabase/admin';

const ENV_KEYS = [
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const originalEnv = new Map<string, string | undefined>();

function fakeSupabase(log: string[]): SupabaseLike {
  const response: SupabaseResponse = { data: [], error: null };
  const query = {
    select: (columns?: string) => {
      log.push(`select:${columns ?? '*'}`);
      return query;
    },
    eq: (column: string) => {
      log.push(`eq:${column}`);
      return query;
    },
    order: () => query,
    limit: () => query,
    single: () => query,
    then: (onfulfilled?: any, onrejected?: any): PromiseLike<any> =>
      Promise.resolve(response).then(onfulfilled, onrejected),
  };
  return {
    from: (table: string) => {
      log.push(`from:${table}`);
      return {
        select: query.select,
        insert: () => query,
        update: () => query,
      };
    },
  };
}

describe('E1-05 service-role repository integration', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('returns null when SaaS storage is not configured', () => {
    expect(createAdminRepositories()).toBeNull();
    expect(createAdminRepositories(null)).toBeNull();
  });

  it('builds all six typed repositories from an injected client', () => {
    const repos = createAdminRepositories(fakeSupabase([]));
    expect(repos).not.toBeNull();
    expect(Object.keys(repos!).sort()).toEqual(['audit', 'jobs', 'plans', 'sites', 'snapshots', 'usage']);
  });

  it('routes repository calls through the injected client', async () => {
    const log: string[] = [];
    const repos = createAdminRepositories(fakeSupabase(log));
    const result = await repos!.sites.listActive('project-1');
    expect(result.error).toBeNull();
    expect(log[0]).toBe('from:sites');
    expect(log).toContain('eq:project_id');
    expect(log).toContain('eq:status');
  });

  it('never resolves a real admin client when an explicit fake is supplied', () => {
    // No Supabase env is set in this suite, so a fallback resolution would be null.
    const log: string[] = [];
    expect(createAdminRepositories(fakeSupabase(log))).not.toBeNull();
    expect(log).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Supabase RLS & Multi-Tenant Schema Validation', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    '../../supabase/migrations/20261022000000_saas_schema.sql'
  );

  it('migration file exists and is readable', () => {
    // Check either relative from package or root
    const resolvedPath = fs.existsSync(migrationPath)
      ? migrationPath
      : path.resolve(process.cwd(), 'supabase/migrations/20261022000000_saas_schema.sql');

    expect(fs.existsSync(resolvedPath)).toBe(true);
    const sql = fs.readFileSync(resolvedPath, 'utf8');
    expect(sql.length).toBeGreaterThan(500);
  });

  it('enables ROW LEVEL SECURITY on all tenant tables', () => {
    const resolvedPath = fs.existsSync(migrationPath)
      ? migrationPath
      : path.resolve(process.cwd(), 'supabase/migrations/20261022000000_saas_schema.sql');

    const sql = fs.readFileSync(resolvedPath, 'utf8');

    const expectedTables = [
      'public.profiles',
      'public.projects',
      'public.wordpress_connections',
      'public.change_proposals',
      'public.audit_events',
      'public.agent_jobs',
      'public.model_usage',
      'public.agent_rate_limits',
    ];

    for (const table of expectedTables) {
      const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+${table.replace('.', '\\.')}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
      expect(sql).toMatch(rlsRegex);
    }
  });

  it('guarantees tenant isolation policies using auth.uid() across tables', () => {
    const resolvedPath = fs.existsSync(migrationPath)
      ? migrationPath
      : path.resolve(process.cwd(), 'supabase/migrations/20261022000000_saas_schema.sql');

    const sql = fs.readFileSync(resolvedPath, 'utf8');

    expect(sql.match(/auth\.uid\(\)/gi)?.length).toBeGreaterThanOrEqual(12);
  });

  it('enforces immutability on audit_events (no UPDATE or DELETE policies)', () => {
    const resolvedPath = fs.existsSync(migrationPath)
      ? migrationPath
      : path.resolve(process.cwd(), 'supabase/migrations/20261022000000_saas_schema.sql');

    const sql = fs.readFileSync(resolvedPath, 'utf8');

    // Check that there is no UPDATE or DELETE policy on audit_events
    expect(sql).not.toMatch(/CREATE\s+POLICY\s+.*\s+ON\s+public\.audit_events\s+FOR\s+UPDATE/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY\s+.*\s+ON\s+public\.audit_events\s+FOR\s+DELETE/i);
  });

  it('stores WordPress credentials in encrypted_credentials JSONB column without plain passwords', () => {
    const resolvedPath = fs.existsSync(migrationPath)
      ? migrationPath
      : path.resolve(process.cwd(), 'supabase/migrations/20261022000000_saas_schema.sql');

    const sql = fs.readFileSync(resolvedPath, 'utf8');

    expect(sql).toContain('encrypted_credentials JSONB NOT NULL');
    expect(sql).not.toMatch(/\bpassword\s+TEXT\b/i);
  });

  it('does not grant browser users access to encrypted credential columns', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/REVOKE ALL ON public\.profiles, public\.projects, public\.wordpress_connections/i);
    expect(sql).toMatch(/GRANT SELECT ON public\.wordpress_connection_metadata TO authenticated/i);
    expect(sql).not.toMatch(/GRANT\s+SELECT\s+ON\s+public\.wordpress_connections\s+TO\s+authenticated/i);
  });

  it('prevents users from changing their profile role or writing privileged job records', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).not.toMatch(/CREATE POLICY .* ON public\.profiles FOR UPDATE/i);
    expect(sql).not.toMatch(/CREATE POLICY .* ON public\.agent_jobs FOR INSERT/i);
    expect(sql).not.toMatch(/CREATE POLICY .* ON public\.model_usage FOR INSERT/i);
  });

  it('limits the rate-limit RPC to the service role', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.consume_agent_rate_limit[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.consume_agent_rate_limit[\s\S]*TO service_role/i);
  });
});

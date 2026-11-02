import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function readMigration(filename: string): string {
  const fromPkg = path.resolve(process.cwd(), '../../supabase/migrations', filename);
  const fromRoot = path.resolve(process.cwd(), 'supabase/migrations', filename);
  const resolved = fs.existsSync(fromPkg) ? fromPkg : fromRoot;
  expect(fs.existsSync(resolved), `Missing migration ${filename}`).toBe(true);
  return fs.readFileSync(resolved, 'utf8');
}

const V2_TABLES = [
  'sites',
  'pairing_codes',
  'plans',
  'approvals',
  'jobs',
  'job_events',
  'snapshots',
  'usage_events',
  'user_api_keys',
  'connector_nonces',
  'rate_limits',
  'automations',
  'feature_flags',
] as const;

const SERVICE_ONLY_TABLES = [
  'sites',
  'pairing_codes',
  'approvals',
  'user_api_keys',
  'connector_nonces',
  'rate_limits',
] as const;

describe('SitePilot v2 RLS, Grants & Runtime Functions (E1-04)', () => {
  const v2Sql = readMigration('20261101080000_sitepilot_v2.sql');
  const fnSql = readMigration('20261101090000_connector_functions.sql');
  const undoSql = readMigration('20261101100000_snapshot_undo_columns.sql');
  const defaultProjectSql = readMigration('20261102070000_auto_default_project.sql');

  it('enables and forces ROW LEVEL SECURITY on all 13 v2 tables', () => {
    for (const table of V2_TABLES) {
      expect(v2Sql, `ENABLE RLS on ${table}`).toMatch(
        new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i')
      );
      expect(v2Sql, `FORCE RLS on ${table}`).toMatch(
        new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i')
      );
    }
  });

  it('keeps credential and replay tables service-only (zero browser policies, zero authenticated grants)', () => {
    for (const table of SERVICE_ONLY_TABLES) {
      expect(v2Sql, `${table} must have no RLS policy`).not.toMatch(
        new RegExp(`CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+public\\.${table}\\b`, 'i')
      );
      expect(v2Sql, `${table} must not be granted to authenticated`).not.toMatch(
        new RegExp(`GRANT\\s+SELECT\\s+ON[^;]*\\bpublic\\.${table}\\b[^;]*TO\\s+authenticated`, 'i')
      );
    }
  });

  it('exposes owner-scoped SELECT policies only (no direct browser INSERT/UPDATE/DELETE on v2 tables)', () => {
    const ownerReadable = ['plans', 'jobs', 'job_events', 'snapshots', 'usage_events', 'automations'];

    for (const table of ownerReadable) {
      expect(v2Sql, `${table} SELECT policy`).toMatch(
        new RegExp(`CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+public\\.${table}\\s+FOR\\s+SELECT\\s+TO\\s+authenticated`, 'i')
      );
      for (const writeOp of ['INSERT', 'UPDATE', 'DELETE']) {
        expect(v2Sql, `${table} ${writeOp} forbidden`).not.toMatch(
          new RegExp(`CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+public\\.${table}\\s+FOR\\s+${writeOp}`, 'i')
        );
      }
    }
  });

  it('protects site_metadata with security_barrier and omits token_hash and secret_encrypted', () => {
    const viewStart = v2Sql.indexOf('CREATE VIEW public.site_metadata');
    const viewEnd = v2Sql.indexOf(';', viewStart);
    expect(viewStart).toBeGreaterThan(0);

    const viewDef = v2Sql.slice(viewStart, viewEnd);
    expect(viewDef).toMatch(/security_barrier\s*=\s*true/i);
    expect(viewDef).toMatch(/WHERE\s+p\.owner_id\s*=\s*\(\s*SELECT\s+auth\.uid\(\)\s*\)/i);
    expect(viewDef).not.toMatch(/token_hash/i);
    expect(viewDef).not.toMatch(/secret_encrypted/i);
  });

  it('revokes public/anon/authenticated execution on connector runtime RPCs', () => {
    for (const fnName of ['claim_next_job', 'touch_site_heartbeat', 'purge_expired_connector_state']) {
      expect(fnSql, `${fnName} SECURITY INVOKER`).toMatch(
        new RegExp(`FUNCTION\\s+public\\.${fnName}[\\s\\S]*?SECURITY\\s+INVOKER`, 'i')
      );
      expect(fnSql, `REVOKE ${fnName}`).toMatch(
        new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${fnName}\\([^)]*\\)\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated`, 'i')
      );
      expect(fnSql, `GRANT ${fnName} TO service_role`).toMatch(
        new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fnName}\\([^)]*\\)\\s+TO\\s+service_role`, 'i')
      );
    }
  });

  it('tracks snapshot undo columns and auto-provisions a default project per user', () => {
    expect(undoSql).toMatch(/restored_at/i);
    expect(undoSql).toMatch(/restore_job_id/i);
    expect(defaultProjectSql).toMatch(/INSERT\s+INTO\s+public\.projects/i);
    expect(defaultProjectSql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.handle_new_user\(\)/i);
  });
});

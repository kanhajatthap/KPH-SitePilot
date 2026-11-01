import type { PairingCodeRow, PairingStore } from './pairing';
import { createSupabaseAdminClient } from '../supabase/admin';

/**
 * Supabase (service-role) implementation of the pairing storage port.
 *
 * `pairing_codes` and `sites` are service-only tables: neither is readable with
 * the anon key, and `sites.secret_encrypted` is additionally encrypted at the
 * application layer.
 */
export function createSupabasePairingStore(): PairingStore | null {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  return {
    async findPairingCode(codeHash: string): Promise<PairingCodeRow | null> {
      const { data, error } = await supabase
        .from('pairing_codes')
        .select('id, project_id, expires_at, used_at, used_by_site')
        .eq('code_hash', codeHash)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return (data as PairingCodeRow | null) ?? null;
    },

    async createSite(row) {
      const { data, error } = await supabase
        .from('sites')
        .insert(row)
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      return { id: (data as { id: string }).id };
    },

    async markPairingCodeUsed(codeId: string, siteId: string) {
      const { error } = await supabase
        .from('pairing_codes')
        .update({ used_at: new Date().toISOString(), used_by_site: siteId })
        .eq('id', codeId)
        .is('used_at', null);

      if (error) throw new Error(error.message);
    },
  };
}

export interface CreatePairingCodeInput {
  projectId: string;
  createdBy: string;
  codeHash: string;
  expiresAt: string;
}

/** Inserts a pairing code row and returns its id. */
export async function insertPairingCode(input: CreatePairingCodeInput): Promise<string> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error('Connector storage is not configured.');

  const { data, error } = await supabase
    .from('pairing_codes')
    .insert({
      project_id: input.projectId,
      created_by: input.createdBy,
      code_hash: input.codeHash,
      expires_at: input.expiresAt,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Returns the caller's project id (first project they own), if any. */
export async function findOwnedProjectId(userId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { id?: string } | undefined;
  return row?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* Signed connector traffic: auth store, job store and site writer            */
/* -------------------------------------------------------------------------- */

import type { ConnectorAuthStore, ConnectorSiteRecord } from './auth';
import type { ConnectorJobStore, JobRow, JobResultInput, JobStatus } from './jobs';
import type { SiteWriter } from './handlers';

const UNIQUE_VIOLATION = '23505';

export function createSupabaseConnectorAuthStore(): ConnectorAuthStore | null {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  return {
    async findSiteById(siteId: string): Promise<ConnectorSiteRecord | null> {
      const { data, error } = await supabase
        .from('sites')
        .select('id, project_id, url, name, status, scopes, secret_encrypted')
        .eq('id', siteId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return (data as ConnectorSiteRecord | null) ?? null;
    },

    async recordNonce(siteId: string, nonce: string): Promise<boolean> {
      const { error } = await supabase
        .from('connector_nonces')
        .insert({ site_id: siteId, nonce });

      if (!error) return true;
      if (error.code === UNIQUE_VIOLATION) return false;
      throw new Error(error.message);
    },
  };
}

export function createSupabaseJobStore(): ConnectorJobStore | null {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  const supabase = client;

  async function appendEvent(jobId: string, type: string, message: string, data: Record<string, unknown>) {
    const { data: latest } = await supabase
      .from('job_events')
      .select('seq')
      .eq('job_id', jobId)
      .order('seq', { ascending: false })
      .limit(1);

    const nextSeq = ((latest?.[0] as { seq?: number } | undefined)?.seq ?? 0) + 1;
    await supabase
      .from('job_events')
      .insert({ job_id: jobId, seq: nextSeq, type, message, data });
  }

  return {
    async claimNextJob(siteId: string, leaseSeconds: number): Promise<JobRow | null> {
      const { data, error } = await supabase.rpc('claim_next_job', {
        p_site_id: siteId,
        p_lease_seconds: leaseSeconds,
      });

      if (error) throw new Error(error.message);
      const rows = (data ?? []) as JobRow[];
      return rows[0] ?? null;
    },

    async getJob(jobId: string, siteId: string): Promise<JobRow | null> {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, project_id, site_id, plan_id, tool, args, risk, status, attempts, max_attempts, lease_expires_at, created_at')
        .eq('id', jobId)
        .eq('site_id', siteId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return (data as JobRow | null) ?? null;
    },

    async finishJob(input: JobResultInput): Promise<{ status: JobStatus; attempts: number }> {
      const job = await this.getJob(input.jobId, input.siteId);
      if (!job) throw new Error('Job not found.');

      let status: JobStatus;
      if (input.ok) {
        status = 'succeeded';
      } else if (input.retryable !== false && job.attempts < job.max_attempts) {
        status = 'queued';
      } else {
        status = 'failed';
      }

      const { data, error } = await supabase
        .from('jobs')
        .update({
          status,
          result: input.ok ? input.result ?? {} : null,
          error: input.ok ? null : input.error ?? { code: 'TOOL_FAILED', message: 'Unknown failure' },
          lease_expires_at: null,
          claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.jobId)
        .eq('site_id', input.siteId)
        .select('status, attempts')
        .single();

      if (error) throw new Error(error.message);

      await appendEvent(
        input.jobId,
        status === 'succeeded' ? 'succeeded' : status === 'queued' ? 'retry_scheduled' : 'failed',
        status === 'succeeded'
          ? 'Connector reported success'
          : status === 'queued'
            ? 'Connector reported a retryable failure'
            : 'Connector reported a permanent failure',
        {
          durationMs: input.durationMs ?? null,
          error: input.ok ? null : input.error ?? null,
        }
      );

      const row = data as { status: JobStatus; attempts: number };
      return { status: row.status, attempts: row.attempts };
    },
  };
}

export function createSupabaseSiteWriter(): SiteWriter | null {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  return {
    async applyHeartbeat(siteId, input) {
      const { error } = await supabase.rpc('touch_site_heartbeat', {
        p_site_id: siteId,
        p_capabilities: input.capabilities ?? null,
        p_plugin_version: input.pluginVersion ?? null,
        p_wp_version: input.wpVersion ?? null,
        p_php_version: input.phpVersion ?? null,
      });

      if (error) throw new Error(error.message);
    },

    async applySiteInfo(siteId, info) {
      const capabilities =
        info.capabilities && typeof info.capabilities === 'object'
          ? (info.capabilities as Record<string, unknown>)
          : null;

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (capabilities) patch.capabilities = capabilities;
      if (typeof info.wpVersion === 'string') patch.wp_version = info.wpVersion;
      if (typeof info.phpVersion === 'string') patch.php_version = info.phpVersion;
      if (typeof info.pluginVersion === 'string') patch.plugin_version = info.pluginVersion;
      patch.last_seen_at = new Date().toISOString();

      const { error } = await supabase.from('sites').update(patch).eq('id', siteId);
      if (error) throw new Error(error.message);
    },
  };
}

/** Enqueues a job for a site. Returns null when storage is not configured. */
export async function enqueueConnectorJob(input: {
  projectId: string;
  siteId: string;
  tool: string;
  args?: Record<string, unknown>;
  risk?: 'R0' | 'R1' | 'R2' | 'R3';
  idempotencyKey?: string;
  planId?: string | null;
}): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      project_id: input.projectId,
      site_id: input.siteId,
      tool: input.tool,
      args: input.args ?? {},
      risk: input.risk ?? 'R0',
      idempotency_key:
        input.idempotencyKey ??
        `${input.tool}:${input.siteId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      plan_id: input.planId ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

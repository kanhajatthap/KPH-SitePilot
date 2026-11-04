import { ConnectorConfigError } from './crypto';
import { createHash } from 'node:crypto';
import type { PairingCodeRow, PairingStore } from './pairing';
import { createSupabaseAdminClient } from '../supabase/admin';
import { decryptSecret, getEncryptionKey } from './crypto';

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

export interface OwnedProjectRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
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

/** Checks that `projectId` belongs to `userId`. */
export async function projectBelongsToUser(
  projectId: string,
  userId: string
): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

/**
 * Ensures the caller owns at least one project, creating a default "My Sites"
 * workspace (and backfilling `profiles` if needed) when none exists yet.
 */
export async function ensureOwnedProjectId(
  userId: string,
  email?: string | null
): Promise<string | null> {
  const existing = await findOwnedProjectId(userId);
  if (existing) return existing;

  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  if (typeof email === 'string' && email.trim().length > 0) {
    await supabase
      .from('profiles')
      .upsert({ id: userId, email: email.trim() }, { onConflict: 'id' });
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      owner_id: userId,
      name: 'My Sites',
      description: 'Default workspace created automatically',
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Lists all projects owned by `userId` (auto-creating a default workspace if empty). */
export async function listOwnedProjects(
  userId: string,
  email?: string | null
): Promise<OwnedProjectRow[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, description, created_at, updated_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  if (Array.isArray(data) && data.length > 0) {
    return data as OwnedProjectRow[];
  }

  await ensureOwnedProjectId(userId, email);
  const { data: created, error: reloadErr } = await supabase
    .from('projects')
    .select('id, owner_id, name, description, created_at, updated_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true });

  if (reloadErr) throw new Error(reloadErr.message);
  return (created ?? []) as OwnedProjectRow[];
}

/** Creates a new project owned by `userId`. */
export async function createOwnedProject(
  userId: string,
  input: { name: string; description?: string | null },
  email?: string | null
): Promise<OwnedProjectRow | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  if (typeof email === 'string' && email.trim().length > 0) {
    await supabase
      .from('profiles')
      .upsert({ id: userId, email: email.trim() }, { onConflict: 'id' });
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      owner_id: userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
    })
    .select('id, owner_id, name, description, created_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return data as OwnedProjectRow;
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

    async revokeSite(siteId) {
      const { error } = await supabase
        .from('sites')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', siteId);

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

/* -------------------------------------------------------------------------- */
/* Plans, approvals, snapshots                                                */
/* -------------------------------------------------------------------------- */

import type { ApprovalRow, PlanRow, PlanStatus, PlanStore } from './plans';

export function createSupabasePlanStore(): PlanStore | null {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  const supabase = client;

  return {
    async insertPlan(row) {
      const { data, error } = await supabase.from('plans').insert(row).select('*').single();
      if (error) throw new Error(error.message);
      return data as PlanRow;
    },

    async getPlan(planId: string) {
      const { data, error } = await supabase.from('plans').select('*').eq('id', planId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PlanRow | null) ?? null;
    },

    async insertApproval(input) {
      const { data, error } = await supabase
        .from('approvals')
        .insert({
          plan_id: input.planId,
          approved_by: input.approvedBy,
          plan_hash: input.planHash,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return data as ApprovalRow;
    },

    async getApproval(planId: string) {
      const { data, error } = await supabase
        .from('approvals')
        .select('*')
        .eq('plan_id', planId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return (data as ApprovalRow | null) ?? null;
    },

    async setPlanStatus(planId: string, status: PlanStatus) {
      const { error } = await supabase
        .from('plans')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', planId);

      if (error) throw new Error(error.message);
    },

    async enqueueJob(input) {
      const { data, error } = await supabase
        .from('jobs')
        .insert({
          project_id: input.projectId,
          site_id: input.siteId,
          plan_id: input.planId,
          approval_id: input.approvalId,
          tool: input.tool,
          args: input.args,
          risk: input.risk,
          idempotency_key: input.idempotencyKey,
        })
        .select('id')
        .single();

      if (!error) return (data as { id: string }).id;

      // A retried execute must not create a second copy of the same step.
      if (error.code === UNIQUE_VIOLATION) {
        const { data: existing } = await supabase
          .from('jobs')
          .select('id')
          .eq('site_id', input.siteId)
          .eq('idempotency_key', input.idempotencyKey)
          .maybeSingle();

        return (existing as { id?: string } | null)?.id ?? null;
      }

      throw new Error(error.message);
    },
  };
}

export interface RecordSnapshotInput {
  projectId: string;
  siteId: string;
  jobId: string;
  resource: string;
  before: unknown;
  after?: unknown;
}

/** Stores a pre-write snapshot so a change can be undone later. */
export async function recordSnapshot(input: RecordSnapshotInput): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('snapshots')
    .insert({
      project_id: input.projectId,
      site_id: input.siteId,
      job_id: input.jobId,
      resource: input.resource,
      before: input.before,
      after: input.after ?? null,
      checksum: createHash('sha256').update(JSON.stringify(input.before ?? null)).digest('hex'),
      size_bytes: Buffer.byteLength(JSON.stringify(input.before ?? null), 'utf8'),
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export interface SnapshotRow {
  id: string;
  project_id: string;
  site_id: string;
  job_id: string | null;
  resource: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  restored_at?: string | null;
}

export async function getSnapshot(snapshotId: string): Promise<SnapshotRow | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from('snapshots').select('*').eq('id', snapshotId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SnapshotRow | null) ?? null;
}

export async function markSnapshotRestored(snapshotId: string, jobId: string | null): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  await supabase
    .from('snapshots')
    .update({ restored_at: new Date().toISOString(), restore_job_id: jobId })
    .eq('id', snapshotId);
}

/** True when the site belongs to the given user (checked in SQL, not by trust). */
export async function siteBelongsToUser(siteId: string, userId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('sites')
    .select('id, projects!inner(owner_id)')
    .eq('id', siteId)
    .maybeSingle();

  if (error || !data) return false;
  const owner = (data as { projects?: { owner_id?: string } }).projects?.owner_id;
  return owner === userId;
}

export interface SiteContextRow {
  id: string;
  projectId: string;
  status: string;
  url: string;
  name: string;
  capabilities: Record<string, unknown> | null;
}

/** Loads a site row plus the fields a planner needs. */
export async function getSiteContext(siteId: string): Promise<SiteContextRow | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('sites')
    .select('id, project_id, status, url, name, capabilities')
    .eq('id', siteId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as {
    id: string;
    project_id: string;
    status: string;
    url: string;
    name: string | null;
    capabilities: Record<string, unknown> | null;
  };

  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    url: row.url,
    name: row.name ?? row.url,
    capabilities: row.capabilities ?? null,
  };
}

export interface UserModelKey {
  provider: 'gemini' | 'openrouter' | 'groq';
  key: string;
}

/**
 * Loads and decrypts the caller's own model key (bring-your-own-key).
 *
 * Provider keys are never read from the deployment environment by the
 * dashboard (see `secret-boundary.test.ts`); the only way a model gets called
 * is a key the user stored in `user_api_keys`. Preference order favours the
 * provider the planner prompt is tuned for. Returns null when nothing usable
 * exists, and never throws.
 */
export async function getUserApiKey(userId: string): Promise<UserModelKey | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_api_keys')
    .select('provider, key_encrypted')
    .eq('owner_id', userId)
    .eq('status', 'active');

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const order: Array<UserModelKey['provider']> = ['gemini', 'openrouter', 'groq'];
  const rows = data as Array<{ provider: UserModelKey['provider']; key_encrypted: string }>;

  rows.sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));

  let encryptionKey: Buffer;
  try {
    encryptionKey = getEncryptionKey();
  } catch {
    return null;
  }

  for (const row of rows) {
    try {
      const key = decryptSecret(row.key_encrypted, encryptionKey);
      if (key && key.trim().length > 8) return { provider: row.provider, key: key.trim() };
    } catch {
      // A single unreadable row must not disable the planner for the account.
    }
  }

  return null;
}


export type RevokeSiteResult = 'revoked' | 'not_found' | 'unavailable';

/**
 * User-initiated disconnect: revokes the site and cancels jobs it has not
 * claimed yet. Ownership is checked first, so a caller can never revoke
 * somebody else's site (and learns nothing beyond "not found").
 */
export async function revokeSiteForUser(siteId: string, userId: string): Promise<RevokeSiteResult> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return 'unavailable';

  if (!(await siteBelongsToUser(siteId, userId))) return 'not_found';

  const { error } = await supabase
    .from('sites')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', siteId);

  if (error) return 'unavailable';

  await supabase
    .from('jobs')
    .update({ status: 'cancelled' })
    .eq('site_id', siteId)
    .eq('status', 'queued');

  return 'revoked';
}

/**
 * Owner-scoped site access for the platform site APIs (E2-15).
 *
 * `sites` is a service-only table, so ownership cannot be delegated to RLS on the
 * base table the way it is for `site_metadata`. Every read and write here goes
 * through an explicit `projects.owner_id = caller` filter instead, which makes a
 * cross-tenant id indistinguishable from a missing one (404, never 403).
 */
export interface OwnedSiteRow {
  id: string;
  project_id: string;
  url: string;
  name: string;
  environment: 'local' | 'staging' | 'production';
  status: 'active' | 'paused' | 'revoked' | 'offline';
  scopes: string[];
  capabilities: Record<string, unknown>;
  plugin_version: string | null;
  wp_version: string | null;
  php_version: string | null;
  last_seen_at: string | null;
  created_at: string;
}

const OWNED_SITE_COLUMNS =
  'id, project_id, url, name, environment, status, scopes, capabilities, plugin_version, wp_version, php_version, last_seen_at, created_at, projects!inner(owner_id)';

/** Returns the site only when `ownerId` owns its project. */
export async function findOwnedSite(ownerId: string, siteId: string): Promise<OwnedSiteRow | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('sites')
    .select(OWNED_SITE_COLUMNS)
    .eq('id', siteId)
    .eq('projects.owner_id', ownerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { projects: _owner, ...site } = data as unknown as OwnedSiteRow & { projects?: unknown };
  return site as OwnedSiteRow;
}

export interface SiteUpdate {
  name?: string;
  environment?: OwnedSiteRow['environment'];
  status?: OwnedSiteRow['status'];
  scopes?: string[];
}

/**
 * Applies an owner-checked partial update and returns the new row.
 *
 * Ownership is verified *before* issuing the `UPDATE`: in PostgREST an embedded
 * `.eq('projects.owner_id', …)` filter only constrains the returned `SELECT`
 * projection after mutating the base row. Checking `findOwnedSite` first ensures
 * a cross-tenant request never touches `sites`.
 */
export async function updateOwnedSite(
  ownerId: string,
  siteId: string,
  patch: SiteUpdate
): Promise<OwnedSiteRow | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const owned = await findOwnedSite(ownerId, siteId);
  if (!owned) return null;

  const { data, error } = await supabase
    .from('sites')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', siteId)
    .select(OWNED_SITE_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { projects: _owner, ...site } = data as unknown as OwnedSiteRow & { projects?: unknown };
  return site as OwnedSiteRow;
}

export interface RotatedCredentials {
  token: string;
  secret: string;
}

/**
 * Issues a new token + secret for a site and invalidates the previous pair.
 *
 * The secret is encrypted at rest and never stored in plaintext; the caller sees
 * it exactly once. Rotating also clears `revoked`, because an operator rotating a
 * credential is re-authorising the site — otherwise the new credentials would be
 * dead on arrival. Ownership is verified before writing so another account's
 * site id answers `null` without touching storage.
 */
export async function rotateSiteCredentials(
  ownerId: string,
  siteId: string
): Promise<RotatedCredentials | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { generateSiteSecret, generateSiteToken, hashToken, encryptSecret } = await import('./crypto');

  let encryptionKey: Buffer;
  try {
    encryptionKey = getEncryptionKey();
  } catch {
    throw new ConnectorConfigError('SITEPILOT_ENCRYPTION_KEY is not configured.');
  }

  const owned = await findOwnedSite(ownerId, siteId);
  if (!owned) return null;

  const token = generateSiteToken();
  const secret = generateSiteSecret();

  const { data, error } = await supabase
    .from('sites')
    .update({
      token_hash: hashToken(token),
      secret_encrypted: encryptSecret(secret, encryptionKey),
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', siteId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return { token, secret };
}

/* -------------------------------------------------------------------------- */
/* Bring-your-own-key (BYOK) storage port (E3-11 / E9-12)                     */
/* -------------------------------------------------------------------------- */

import type { ByokProvider, StoredUserKeySummary, UserKeyStore } from './keys';

export function createSupabaseUserKeyStore(): UserKeyStore | null {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  return {
    async listKeys(ownerId: string): Promise<StoredUserKeySummary[]> {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('provider, last4, status, updated_at')
        .eq('owner_id', ownerId);

      if (error) throw new Error(error.message);
      return (data ?? []) as StoredUserKeySummary[];
    },

    async getEncryptedKey(ownerId: string, provider: ByokProvider) {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('key_encrypted, status')
        .eq('owner_id', ownerId)
        .eq('provider', provider)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return (data as { key_encrypted: string; status: string } | null) ?? null;
    },

    async upsertKey(input): Promise<StoredUserKeySummary> {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('user_api_keys')
        .upsert(
          {
            owner_id: input.ownerId,
            provider: input.provider,
            key_encrypted: input.keyEncrypted,
            last4: input.last4,
            status: 'active',
            updated_at: now,
          },
          { onConflict: 'owner_id,provider' }
        )
        .select('provider, last4, status, updated_at')
        .single();

      if (error) throw new Error(error.message);
      return data as StoredUserKeySummary;
    },

    async deleteKey(ownerId: string, provider: ByokProvider): Promise<boolean> {
      const { data, error } = await supabase
        .from('user_api_keys')
        .delete()
        .eq('owner_id', ownerId)
        .eq('provider', provider)
        .select('id');

      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Activity & Audit Timeline (E9-10)                                          */
/* -------------------------------------------------------------------------- */

import { resolveUndoJob } from './undo';

export interface ActivitySiteSummary {
  id: string;
  project_id: string;
  name: string;
  url: string;
  environment: string;
  status: string;
  plugin_version: string | null;
  last_seen_at: string | null;
}

export interface ActivityPlanEntry {
  id: string;
  site_id: string;
  prompt: string;
  summary: string;
  risk: string;
  status: string;
  steps: Array<{ tool: string; summary?: string; risk?: string }>;
  created_at: string;
}

export interface ActivityJobEntry {
  id: string;
  site_id: string;
  plan_id: string | null;
  tool: string;
  risk: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error: { code?: string; message?: string } | null;
  created_at: string;
}

export interface ActivitySnapshotEntry {
  id: string;
  site_id: string;
  job_id: string | null;
  resource: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  restored_at: string | null;
  created_at: string;
  undoable: boolean;
  undoTool: string | null;
}

export interface OwnerActivityTimeline {
  sites: ActivitySiteSummary[];
  plans: ActivityPlanEntry[];
  jobs: ActivityJobEntry[];
  snapshots: ActivitySnapshotEntry[];
}

export async function listOwnerActivity(
  ownerId: string,
  options?: { siteId?: string | null; status?: string | null; limit?: number }
): Promise<OwnerActivityTimeline | 'site_not_found' | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const limit = Math.max(5, Math.min(60, options?.limit ?? 30));

  const { data: projectRows, error: projectErr } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', ownerId);

  if (projectErr) throw new Error(projectErr.message);
  const projectIds = (projectRows ?? []).map((p: { id: string }) => p.id);
  if (projectIds.length === 0) {
    return { sites: [], plans: [], jobs: [], snapshots: [] };
  }

  const { data: siteRows, error: siteErr } = await supabase
    .from('sites')
    .select('id, project_id, name, url, environment, status, plugin_version, last_seen_at')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false });

  if (siteErr) throw new Error(siteErr.message);
  const sites = (siteRows ?? []) as ActivitySiteSummary[];
  const ownedSiteIds = new Set(sites.map((s) => s.id));

  const requestedSiteId = options?.siteId?.trim() || null;
  if (requestedSiteId && !ownedSiteIds.has(requestedSiteId)) {
    return 'site_not_found';
  }

  if (sites.length === 0) {
    return { sites: [], plans: [], jobs: [], snapshots: [] };
  }

  const targetSiteIds = requestedSiteId ? [requestedSiteId] : Array.from(ownedSiteIds);
  const statusFilter = options?.status?.trim() || null;

  let plansQuery = supabase
    .from('plans')
    .select('id, site_id, prompt, summary, risk, status, steps, created_at')
    .in('site_id', targetSiteIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (statusFilter) {
    plansQuery = plansQuery.eq('status', statusFilter);
  }

  let jobsQuery = supabase
    .from('jobs')
    .select('id, site_id, plan_id, tool, risk, status, attempts, max_attempts, error, created_at')
    .in('site_id', targetSiteIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (statusFilter) {
    jobsQuery = jobsQuery.eq('status', statusFilter);
  }

  const snapshotsQuery = supabase
    .from('snapshots')
    .select('id, site_id, job_id, resource, before, after, restored_at, created_at')
    .in('site_id', targetSiteIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  const [plansRes, jobsRes, snapshotsRes] = await Promise.all([
    plansQuery,
    jobsQuery,
    snapshotsQuery,
  ]);

  if (plansRes.error) throw new Error(plansRes.error.message);
  if (jobsRes.error) throw new Error(jobsRes.error.message);
  if (snapshotsRes.error) throw new Error(snapshotsRes.error.message);

  const snapshots: ActivitySnapshotEntry[] = (
    (snapshotsRes.data ?? []) as Array<{
      id: string;
      site_id: string;
      job_id: string | null;
      resource: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      restored_at: string | null;
      created_at: string;
    }>
  ).map((snap) => {
    const resolution = resolveUndoJob({ resource: snap.resource, before: snap.before });
    return {
      ...snap,
      undoable: resolution.ok && !snap.restored_at,
      undoTool: resolution.ok ? resolution.tool : null,
    };
  });

  return {
    sites,
    plans: (plansRes.data ?? []) as ActivityPlanEntry[],
    jobs: (jobsRes.data ?? []) as ActivityJobEntry[],
    snapshots,
  };
}


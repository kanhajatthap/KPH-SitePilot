/**
 * E1-05 — typed, injectable repository contracts.
 *
 * Nothing here imports a Supabase SDK. Route handlers depend on this port, so
 * they can be tested with an in-memory fake while production uses the thin
 * adapter in `client.ts`. Every read is explicitly project/owner scoped and
 * credential columns are never part of the public row shapes.
 */

export type TableName =
  | 'sites'
  | 'plans'
  | 'jobs'
  | 'snapshots'
  | 'audit_events'
  | 'usage_events';

export type RiskLevel = 'R0' | 'R1' | 'R2' | 'R3';
export type SiteStatus = 'active' | 'paused' | 'revoked';
export type PlanStatus = 'proposed' | 'approved' | 'applied' | 'failed' | 'cancelled';
export type JobStatus = 'queued' | 'claimed' | 'succeeded' | 'retry' | 'failed' | 'cancelled';

/** `token_hash` / `secret_encrypted` are deliberately absent. */
export interface SiteRow {
  id: string;
  project_id: string;
  url: string;
  name: string;
  environment: string;
  status: SiteStatus;
  plugin_version: string | null;
  wp_version: string | null;
  php_version: string | null;
  capabilities: Record<string, unknown>;
  scopes: string[];
  last_seen_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PlanRow {
  id: string;
  project_id: string;
  site_id: string;
  prompt: string;
  summary: string;
  steps: Array<Record<string, unknown>>;
  risk: RiskLevel;
  status: PlanStatus;
  hash: string;
  model_provider: string | null;
  model_name: string | null;
  tokens_in: number;
  tokens_out: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  project_id: string;
  site_id: string;
  plan_id: string | null;
  tool: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
  claimed_at: string | null;
  lease_expires_at: string | null;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SnapshotRow {
  id: string;
  project_id: string;
  site_id: string;
  job_id: string | null;
  resource: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  checksum: string;
  size_bytes: number;
  restored_at: string | null;
  restore_job_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface AuditEventRow {
  id: string;
  project_id: string;
  user_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  created_at: string;
}

export interface UsageEventRow {
  id: string;
  owner_id: string;
  project_id: string | null;
  site_id: string | null;
  kind: string;
  provider: string | null;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type RepoRow = Record<string, unknown>;

export interface Filter {
  column: string;
  value: string | number | boolean | null;
}

export interface ReadSpec {
  table: TableName;
  /** Explicit projection — used to keep credential columns out of reads. */
  columns?: readonly string[];
  filters?: readonly Filter[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

export interface CreateSpec {
  table: TableName;
  row: Record<string, unknown>;
  columns?: readonly string[];
}

export interface PatchSpec {
  table: TableName;
  patch: Record<string, unknown>;
  filters: readonly Filter[];
  columns?: readonly string[];
}

export interface RepositoryError {
  code: string;
  message: string;
}

export interface Result<T> {
  data: T | null;
  error: RepositoryError | null;
}

export interface RepositoryClient {
  read<T>(spec: ReadSpec): Promise<Result<T[]>>;
  create<T>(spec: CreateSpec): Promise<Result<T>>;
  patch<T>(spec: PatchSpec): Promise<Result<T[]>>;
}

export interface RepositoryOptions {
  /** Injectable clock so `updated_at` is deterministic in tests. */
  now?: () => string;
}

export const SITE_COLUMNS: readonly string[] = [
  'id',
  'project_id',
  'url',
  'name',
  'environment',
  'status',
  'plugin_version',
  'wp_version',
  'php_version',
  'capabilities',
  'scopes',
  'last_seen_at',
  'created_by',
  'created_at',
  'updated_at',
];

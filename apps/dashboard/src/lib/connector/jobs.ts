/**
 * Job queue ports for the connector pipeline.
 *
 * The platform enqueues a job, the connector leases it with `claim_next_job`
 * (atomic, SKIP LOCKED), executes it and reports the result. Every mutation is
 * server-side and service-role only; the dashboard can read its own rows through
 * RLS but never writes them.
 */

export type JobStatus =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface JobRow {
  id: string;
  project_id: string;
  site_id: string;
  plan_id: string | null;
  tool: string;
  args: unknown;
  risk: 'R0' | 'R1' | 'R2' | 'R3';
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  lease_expires_at: string | null;
  created_at: string;
}

export interface JobResultInput {
  jobId: string;
  siteId: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string } | null;
  durationMs?: number;
  retryable?: boolean;
}

export interface ConnectorJobStore {
  claimNextJob(siteId: string, leaseSeconds: number): Promise<JobRow | null>;
  getJob(jobId: string, siteId: string): Promise<JobRow | null>;
  finishJob(input: JobResultInput): Promise<{ status: JobStatus; attempts: number }>;
}

export interface EnqueueJobInput {
  projectId: string;
  siteId: string;
  tool: string;
  args?: Record<string, unknown>;
  risk?: 'R0' | 'R1' | 'R2' | 'R3';
  idempotencyKey?: string;
  planId?: string | null;
  approvalId?: string | null;
}

/** Lease used when a connector claims work: long enough for a slow host. */
export const JOB_LEASE_SECONDS = 120;

/** Jobs a connector is allowed to see; everything else stays platform-only. */
export const CONNECTOR_TOOL_ALLOWLIST = new Set([
  'site.info',
  'site.health',
  'content.list',
  'content.get',
]);

export function toClaimPayload(job: JobRow) {
  return {
    id: job.id,
    tool: job.tool,
    args: job.args ?? {},
    risk: job.risk,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    leaseExpiresAt: job.lease_expires_at,
    createdAt: job.created_at,
  };
}

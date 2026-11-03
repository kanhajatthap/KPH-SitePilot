import { firstOrNull, projectScope } from './helpers.js';
import type {
  JobRow,
  JobStatus,
  RepositoryClient,
  RepositoryOptions,
  Result,
  RiskLevel,
} from './types.js';

export interface NewJob {
  project_id: string;
  site_id: string;
  tool: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
  idempotency_key: string;
  plan_id?: string | null;
  max_attempts?: number;
}

export interface JobOutcome {
  status: JobStatus;
  result?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  attempts?: number;
}

export interface JobsRepository {
  enqueue(job: NewJob): Promise<Result<JobRow>>;
  findById(projectId: string, jobId: string): Promise<Result<JobRow | null>>;
  listForPlan(projectId: string, planId: string): Promise<Result<JobRow[]>>;
  recordOutcome(projectId: string, jobId: string, outcome: JobOutcome): Promise<Result<JobRow[]>>;
}

export function createJobsRepository(
  client: RepositoryClient,
  options: RepositoryOptions = {}
): JobsRepository {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    enqueue(job) {
      return client.create<JobRow>({
        table: 'jobs',
        row: {
          plan_id: null,
          status: 'queued',
          attempts: 0,
          max_attempts: 3,
          claimed_at: null,
          lease_expires_at: null,
          result: null,
          error: null,
          created_at: now(),
          updated_at: now(),
          ...job,
        },
      });
    },

    async findById(projectId, jobId) {
      return firstOrNull(
        await client.read<JobRow>({
          table: 'jobs',
          filters: projectScope(projectId, { column: 'id', value: jobId }),
          limit: 1,
        })
      );
    },

    listForPlan(projectId, planId) {
      return client.read<JobRow>({
        table: 'jobs',
        filters: projectScope(projectId, { column: 'plan_id', value: planId }),
        order: { column: 'created_at', ascending: true },
      });
    },

    recordOutcome(projectId, jobId, outcome) {
      const patch: Record<string, unknown> = { status: outcome.status, updated_at: now() };
      if (outcome.result !== undefined) patch.result = outcome.result;
      if (outcome.error !== undefined) patch.error = outcome.error;
      if (outcome.attempts !== undefined) patch.attempts = outcome.attempts;
      return client.patch<JobRow>({
        table: 'jobs',
        patch,
        filters: projectScope(projectId, { column: 'id', value: jobId }),
      });
    },
  };
}

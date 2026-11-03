import { firstOrNull, projectScope } from './helpers.js';
import type {
  PlanRow,
  PlanStatus,
  RepositoryClient,
  RepositoryOptions,
  Result,
  RiskLevel,
} from './types.js';

export interface NewPlan {
  project_id: string;
  site_id: string;
  prompt: string;
  summary?: string;
  steps: Array<Record<string, unknown>>;
  risk: RiskLevel;
  hash: string;
  created_by: string;
  model_provider?: string | null;
  model_name?: string | null;
  tokens_in?: number;
  tokens_out?: number;
}

export interface PlansRepository {
  create(plan: NewPlan): Promise<Result<PlanRow>>;
  findById(projectId: string, planId: string): Promise<Result<PlanRow | null>>;
  listForSite(projectId: string, siteId: string, limit?: number): Promise<Result<PlanRow[]>>;
  updateStatus(projectId: string, planId: string, status: PlanStatus): Promise<Result<PlanRow[]>>;
}

export function createPlansRepository(
  client: RepositoryClient,
  options: RepositoryOptions = {}
): PlansRepository {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    create(plan) {
      return client.create<PlanRow>({
        table: 'plans',
        row: {
          summary: '',
          status: 'proposed',
          model_provider: null,
          model_name: null,
          tokens_in: 0,
          tokens_out: 0,
          created_at: now(),
          updated_at: now(),
          ...plan,
        },
      });
    },

    async findById(projectId, planId) {
      return firstOrNull(
        await client.read<PlanRow>({
          table: 'plans',
          filters: projectScope(projectId, { column: 'id', value: planId }),
          limit: 1,
        })
      );
    },

    listForSite(projectId, siteId, limit = 50) {
      return client.read<PlanRow>({
        table: 'plans',
        filters: projectScope(projectId, { column: 'site_id', value: siteId }),
        order: { column: 'created_at', ascending: false },
        limit,
      });
    },

    updateStatus(projectId, planId, status) {
      return client.patch<PlanRow>({
        table: 'plans',
        patch: { status, updated_at: now() },
        filters: projectScope(projectId, { column: 'id', value: planId }),
      });
    },
  };
}

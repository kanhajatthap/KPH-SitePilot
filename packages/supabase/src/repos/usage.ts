import type {
  RepositoryClient,
  RepositoryOptions,
  Result,
  UsageEventRow,
} from './types.js';

export interface NewUsageEvent {
  owner_id: string;
  kind: string;
  project_id?: string | null;
  site_id?: string | null;
  provider?: string | null;
  model?: string | null;
  tokens_in?: number;
  tokens_out?: number;
  metadata?: Record<string, unknown>;
}

export interface UsageTotals {
  events: number;
  tokensIn: number;
  tokensOut: number;
}

export interface UsageRepository {
  record(event: NewUsageEvent): Promise<Result<UsageEventRow>>;
  listForOwner(ownerId: string, limit?: number): Promise<Result<UsageEventRow[]>>;
  totalsForOwner(ownerId: string): Promise<Result<UsageTotals>>;
}

export function createUsageRepository(
  client: RepositoryClient,
  options: RepositoryOptions = {}
): UsageRepository {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    record(event) {
      return client.create<UsageEventRow>({
        table: 'usage_events',
        row: {
          project_id: null,
          site_id: null,
          provider: null,
          model: null,
          tokens_in: 0,
          tokens_out: 0,
          metadata: {},
          created_at: now(),
          ...event,
        },
      });
    },

    listForOwner(ownerId, limit = 100) {
      return client.read<UsageEventRow>({
        table: 'usage_events',
        filters: [{ column: 'owner_id', value: ownerId }],
        order: { column: 'created_at', ascending: false },
        limit,
      });
    },

    async totalsForOwner(ownerId) {
      const result = await client.read<UsageEventRow>({
        table: 'usage_events',
        filters: [{ column: 'owner_id', value: ownerId }],
      });
      if (result.error) return { data: null, error: result.error };
      const rows = result.data ?? [];
      return {
        data: {
          events: rows.length,
          tokensIn: rows.reduce((sum, row) => sum + (Number(row.tokens_in) || 0), 0),
          tokensOut: rows.reduce((sum, row) => sum + (Number(row.tokens_out) || 0), 0),
        },
        error: null,
      };
    },
  };
}

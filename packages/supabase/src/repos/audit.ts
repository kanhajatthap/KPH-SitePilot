import { firstOrNull, projectScope } from './helpers.js';
import { redactPayload } from './redact.js';
import type {
  AuditEventRow,
  RepositoryClient,
  RepositoryOptions,
  Result,
} from './types.js';

export interface NewAuditEvent {
  project_id: string;
  event_type: string;
  correlation_id: string;
  payload?: Record<string, unknown>;
  user_id?: string | null;
}

export interface AuditRepository {
  record(event: NewAuditEvent): Promise<Result<AuditEventRow>>;
  listForProject(projectId: string, limit?: number): Promise<Result<AuditEventRow[]>>;
  findByCorrelation(projectId: string, correlationId: string): Promise<Result<AuditEventRow | null>>;
}

/**
 * Every payload is redacted before it reaches storage: sensitive keys, bearer
 * tokens, `sk-…` keys and JWT-shaped strings are replaced, nesting is bounded
 * and long strings are truncated. Audit rows are owner-readable, so this is a
 * hard boundary rather than a nicety.
 */
export function createAuditRepository(
  client: RepositoryClient,
  options: RepositoryOptions = {}
): AuditRepository {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    record(event) {
      return client.create<AuditEventRow>({
        table: 'audit_events',
        row: {
          user_id: null,
          created_at: now(),
          ...event,
          // Always last: the caller's raw payload must never reach storage.
          payload: redactPayload(event.payload ?? {}),
        },
      });
    },

    listForProject(projectId, limit = 100) {
      return client.read<AuditEventRow>({
        table: 'audit_events',
        filters: projectScope(projectId),
        order: { column: 'created_at', ascending: false },
        limit,
      });
    },

    async findByCorrelation(projectId, correlationId) {
      return firstOrNull(
        await client.read<AuditEventRow>({
          table: 'audit_events',
          filters: projectScope(projectId, { column: 'correlation_id', value: correlationId }),
          limit: 1,
        })
      );
    },
  };
}

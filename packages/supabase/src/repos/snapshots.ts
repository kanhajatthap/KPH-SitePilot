import { firstOrNull, projectScope } from './helpers.js';
import type {
  RepositoryClient,
  RepositoryOptions,
  Result,
  SnapshotRow,
} from './types.js';

export interface NewSnapshot {
  project_id: string;
  site_id: string;
  resource: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  checksum: string;
  size_bytes: number;
  job_id?: string | null;
  expires_at: string;
}

export interface SnapshotsRepository {
  record(snapshot: NewSnapshot): Promise<Result<SnapshotRow>>;
  findById(projectId: string, snapshotId: string): Promise<Result<SnapshotRow | null>>;
  listRecent(projectId: string, siteId: string, limit?: number): Promise<Result<SnapshotRow[]>>;
  markRestored(
    projectId: string,
    snapshotId: string,
    restoreJobId: string | null
  ): Promise<Result<SnapshotRow[]>>;
}

export function createSnapshotsRepository(
  client: RepositoryClient,
  options: RepositoryOptions = {}
): SnapshotsRepository {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    record(snapshot) {
      return client.create<SnapshotRow>({
        table: 'snapshots',
        row: {
          job_id: null,
          restored_at: null,
          restore_job_id: null,
          created_at: now(),
          ...snapshot,
        },
      });
    },

    async findById(projectId, snapshotId) {
      return firstOrNull(
        await client.read<SnapshotRow>({
          table: 'snapshots',
          filters: projectScope(projectId, { column: 'id', value: snapshotId }),
          limit: 1,
        })
      );
    },

    listRecent(projectId, siteId, limit = 10) {
      return client.read<SnapshotRow>({
        table: 'snapshots',
        filters: projectScope(projectId, { column: 'site_id', value: siteId }),
        order: { column: 'created_at', ascending: false },
        limit,
      });
    },

    markRestored(projectId, snapshotId, restoreJobId) {
      return client.patch<SnapshotRow>({
        table: 'snapshots',
        patch: { restored_at: now(), restore_job_id: restoreJobId },
        filters: projectScope(projectId, { column: 'id', value: snapshotId }),
      });
    },
  };
}

import { firstOrNull, projectScope } from './helpers.js';
import type {
  RepositoryClient,
  RepositoryOptions,
  Result,
  SiteRow,
  SiteStatus,
} from './types.js';
import { SITE_COLUMNS } from './types.js';

export interface HeartbeatPatch {
  last_seen_at: string;
  plugin_version?: string | null;
  wp_version?: string | null;
  php_version?: string | null;
  capabilities?: Record<string, unknown>;
}

export interface SitesRepository {
  listActive(projectId: string): Promise<Result<SiteRow[]>>;
  findById(projectId: string, siteId: string): Promise<Result<SiteRow | null>>;
  findActiveByUrl(projectId: string, url: string): Promise<Result<SiteRow | null>>;
  updateStatus(projectId: string, siteId: string, status: SiteStatus): Promise<Result<SiteRow[]>>;
  touchHeartbeat(
    projectId: string,
    siteId: string,
    heartbeat: HeartbeatPatch
  ): Promise<Result<SiteRow[]>>;
}

/**
 * Reads always use `SITE_COLUMNS`, an explicit projection that omits
 * `token_hash` and `secret_encrypted`. A repository can never accidentally
 * return site credentials to a caller.
 */
export function createSitesRepository(
  client: RepositoryClient,
  options: RepositoryOptions = {}
): SitesRepository {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    listActive(projectId) {
      return client.read<SiteRow>({
        table: 'sites',
        columns: SITE_COLUMNS,
        filters: projectScope(projectId, { column: 'status', value: 'active' }),
        order: { column: 'created_at', ascending: false },
      });
    },

    async findById(projectId, siteId) {
      return firstOrNull(
        await client.read<SiteRow>({
          table: 'sites',
          columns: SITE_COLUMNS,
          filters: projectScope(projectId, { column: 'id', value: siteId }),
          limit: 1,
        })
      );
    },

    async findActiveByUrl(projectId, url) {
      return firstOrNull(
        await client.read<SiteRow>({
          table: 'sites',
          columns: SITE_COLUMNS,
          filters: projectScope(projectId, { column: 'url', value: url }, { column: 'status', value: 'active' }),
          limit: 1,
        })
      );
    },

    updateStatus(projectId, siteId, status) {
      return client.patch<SiteRow>({
        table: 'sites',
        columns: SITE_COLUMNS,
        patch: { status, updated_at: now() },
        filters: projectScope(projectId, { column: 'id', value: siteId }),
      });
    },

    touchHeartbeat(projectId, siteId, heartbeat) {
      const { last_seen_at, ...rest } = heartbeat;
      return client.patch<SiteRow>({
        table: 'sites',
        columns: SITE_COLUMNS,
        patch: { last_seen_at, ...rest, updated_at: now() },
        filters: projectScope(projectId, { column: 'id', value: siteId }),
      });
    },
  };
}

export * from './types.js';
export * from './helpers.js';
export * from './client.js';
export * from './redact.js';
export * from './sites.js';
export * from './plans.js';
export * from './jobs.js';
export * from './snapshots.js';
export * from './audit.js';
export * from './usage.js';

import { createAuditRepository, type AuditRepository } from './audit.js';
import { createJobsRepository, type JobsRepository } from './jobs.js';
import { createPlansRepository, type PlansRepository } from './plans.js';
import { createSitesRepository, type SitesRepository } from './sites.js';
import { createSnapshotsRepository, type SnapshotsRepository } from './snapshots.js';
import type { RepositoryClient, RepositoryOptions } from './types.js';
import { createUsageRepository, type UsageRepository } from './usage.js';

export interface Repositories {
  sites: SitesRepository;
  plans: PlansRepository;
  jobs: JobsRepository;
  snapshots: SnapshotsRepository;
  audit: AuditRepository;
  usage: UsageRepository;
}

/** One injectable client → all six typed repositories, sharing one clock. */
export function createRepositories(
  client: RepositoryClient,
  options: RepositoryOptions = {}
): Repositories {
  return {
    sites: createSitesRepository(client, options),
    plans: createPlansRepository(client, options),
    jobs: createJobsRepository(client, options),
    snapshots: createSnapshotsRepository(client, options),
    audit: createAuditRepository(client, options),
    usage: createUsageRepository(client, options),
  };
}

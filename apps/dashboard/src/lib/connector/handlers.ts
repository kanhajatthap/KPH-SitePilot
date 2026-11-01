import type { ConnectorAuthStore, AuthenticatedSite } from './auth';
import { authenticateConnectorRequest } from './auth';
import {
  CONNECTOR_TOOL_ALLOWLIST,
  JOB_LEASE_SECONDS,
  toClaimPayload,
  type ConnectorJobStore,
  type JobStatus,
} from './jobs';
import { advancePlan, type PlanStore } from './plans';

/**
 * Transport-independent connector endpoint logic.
 *
 * Routes only parse the request, call one of these handlers and serialise the
 * result, so every rule below is unit-testable with in-memory stores.
 */

export interface SiteWriter {
  applyHeartbeat(
    siteId: string,
    input: {
      pluginVersion?: string;
      wpVersion?: string;
      phpVersion?: string;
      capabilities?: Record<string, unknown>;
    }
  ): Promise<void>;
  applySiteInfo(siteId: string, info: Record<string, unknown>): Promise<void>;
  /**
   * Marks the connection revoked. Heartbeats and claims stop working for it
   * immediately, because `authenticateConnectorRequest` refuses revoked sites.
   */
  revokeSite(siteId: string): Promise<void>;
}

export interface SnapshotWriter {
  record(input: {
    projectId: string;
    siteId: string;
    jobId: string;
    resource: string;
    before: unknown;
    after?: unknown;
  }): Promise<string | null>;
}

export interface ConnectorHandlerDeps {
  authStore: ConnectorAuthStore;
  jobStore: ConnectorJobStore;
  siteWriter: SiteWriter;
  encryptionKey: Buffer;
  nowSeconds?: () => number;
  isRateLimited?: (siteId: string) => boolean;
  snapshots?: SnapshotWriter;
  plans?: { store: PlanStore };
}

export interface HandlerOutput {
  status: number;
  body: Record<string, unknown>;
}

const NEXT_POLL_SECONDS = 60;

function unauthorized(auth: { status: number; code: string; message: string }): HandlerOutput {
  return { status: auth.status, body: { error: auth.code, message: auth.message } };
}

function parseJson(rawBody: string): Record<string, unknown> | null {
  if (!rawBody.trim()) return {};
  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

async function authOrFail(
  deps: ConnectorHandlerDeps,
  headers: Headers,
  rawBody: string
): Promise<{ ok: true; site: AuthenticatedSite } | { ok: false; output: HandlerOutput }> {
  const auth = await authenticateConnectorRequest({
    headers,
    rawBody,
    store: deps.authStore,
    encryptionKey: deps.encryptionKey,
    nowSeconds: deps.nowSeconds?.(),
    isRateLimited: deps.isRateLimited,
  });

  if (!auth.ok) {
    return { ok: false, output: unauthorized(auth) };
  }
  return { ok: true, site: auth.site };
}

/** POST /api/connector/heartbeat */
export async function handleHeartbeat(
  headers: Headers,
  rawBody: string,
  deps: ConnectorHandlerDeps
): Promise<HandlerOutput> {
  const auth = await authOrFail(deps, headers, rawBody);
  if (!auth.ok) return auth.output;

  const body = parseJson(rawBody);
  if (!body) {
    return { status: 400, body: { error: 'VALIDATION_FAILED', message: 'Body must be a JSON object.' } };
  }

  const capabilities =
    body.capabilities && typeof body.capabilities === 'object'
      ? (body.capabilities as Record<string, unknown>)
      : undefined;

  await deps.siteWriter.applyHeartbeat(auth.site.id, {
    pluginVersion: asString(body.pluginVersion),
    wpVersion: asString(body.wpVersion),
    phpVersion: asString(body.phpVersion),
    capabilities,
  });

  return {
    status: 200,
    body: {
      status: 'ok',
      siteId: auth.site.id,
      scopes: auth.site.scopes,
      nextPollSeconds: NEXT_POLL_SECONDS,
      serverTime: new Date((deps.nowSeconds?.() ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    },
  };
}

/** POST /api/connector/jobs/claim */
/**
 * POST /api/connector/unpair — the site asks to be disconnected.
 *
 * The request must be signed, so only the holder of the site secret can
 * revoke it. Revoking is idempotent at the storage layer; a second call from a
 * site that is already revoked fails authentication with `SITE_REVOKED`, which
 * the plugin treats as "already disconnected".
 */
export async function handleUnpair(
  headers: Headers,
  rawBody: string,
  deps: ConnectorHandlerDeps
): Promise<HandlerOutput> {
  const auth = await authOrFail(deps, headers, rawBody);
  if (!auth.ok) return auth.output;

  await deps.siteWriter.revokeSite(auth.site.id);

  return {
    status: 200,
    body: {
      status: 'revoked',
      siteId: auth.site.id,
      message: 'This site has been disconnected from SitePilot. Polling stops immediately.',
    },
  };
}

export async function handleClaim(
  headers: Headers,
  rawBody: string,
  deps: ConnectorHandlerDeps
): Promise<HandlerOutput> {
  const auth = await authOrFail(deps, headers, rawBody);
  if (!auth.ok) return auth.output;

  const job = await deps.jobStore.claimNextJob(auth.site.id, JOB_LEASE_SECONDS);
  if (!job) {
    return { status: 200, body: { job: null, nextPollSeconds: NEXT_POLL_SECONDS } };
  }

  if (!CONNECTOR_TOOL_ALLOWLIST.has(job.tool)) {
    // A job the connector must never receive is a platform bug; fail it loudly
    // instead of shipping it to a WordPress site.
    await deps.jobStore.finishJob({
      jobId: job.id,
      siteId: auth.site.id,
      ok: false,
      error: { code: 'TOOL_NOT_ALLOWED', message: `Tool "${job.tool}" is not connector-executable.` },
      retryable: false,
    });
    return { status: 200, body: { job: null, nextPollSeconds: NEXT_POLL_SECONDS } };
  }

  return { status: 200, body: { job: toClaimPayload(job), nextPollSeconds: NEXT_POLL_SECONDS } };
}

/** POST /api/connector/jobs/{id}/result */
export async function handleJobResult(
  jobId: string,
  headers: Headers,
  rawBody: string,
  deps: ConnectorHandlerDeps
): Promise<HandlerOutput> {
  const auth = await authOrFail(deps, headers, rawBody);
  if (!auth.ok) return auth.output;

  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return { status: 400, body: { error: 'VALIDATION_FAILED', message: 'Job id must be a UUID.' } };
  }

  const body = parseJson(rawBody);
  if (!body) {
    return { status: 400, body: { error: 'VALIDATION_FAILED', message: 'Body must be a JSON object.' } };
  }

  const bodyJobId = asString(body.jobId);
  if (bodyJobId && bodyJobId !== jobId) {
    return {
      status: 400,
      body: { error: 'VALIDATION_FAILED', message: 'jobId in the body does not match the path.' },
    };
  }

  const job = await deps.jobStore.getJob(jobId, auth.site.id);
  if (!job) {
    return { status: 404, body: { error: 'JOB_NOT_FOUND', message: 'No such job for this site.' } };
  }

  // Idempotent: a retried report after a network blip must not double-apply.
  if (job.status === 'succeeded' || job.status === 'failed') {
    return {
      status: 200,
      body: { status: job.status, attempts: job.attempts, idempotent: true },
    };
  }

  const ok = body.ok === true;
  const errorCode = asString((body.error as Record<string, unknown> | undefined)?.code) ?? 'TOOL_FAILED';
  const errorMessage =
    asString((body.error as Record<string, unknown> | undefined)?.message) ?? 'The connector reported a failure.';
  const retryable = body.retryable !== false;
  const durationMs = typeof body.durationMs === 'number' ? body.durationMs : undefined;

  if (ok) {
    const result = (body.result as Record<string, unknown> | undefined) ?? {};
    if (job.tool === 'site.info') {
      await deps.siteWriter.applySiteInfo(auth.site.id, result);
    }
  }

  const snapshot = ok ? (body.snapshot as Record<string, unknown> | undefined) : undefined;

  const finished = await deps.jobStore.finishJob({
    jobId,
    siteId: auth.site.id,
    ok,
    result: ok ? body.result : undefined,
    error: ok ? null : { code: errorCode, message: errorMessage },
    durationMs,
    retryable,
  });

  // A pre-write snapshot must be durable even if the user closes the tab: it is
  // what makes one-click undo possible.
  let snapshotId: string | null = null;
  if (
    finished.status === 'succeeded' &&
    snapshot &&
    typeof snapshot.resource === 'string' &&
    snapshot.before &&
    deps.snapshots
  ) {
    try {
      snapshotId = await deps.snapshots.record({
        projectId: auth.site.projectId,
        siteId: auth.site.id,
        jobId,
        resource: snapshot.resource,
        before: snapshot.before,
        after: snapshot.after,
      });
    } catch {
      // The write already happened; a missing snapshot is reported, not hidden.
      snapshotId = null;
    }
  }

  // Plans run one verified step at a time. A retryable failure leaves the job
  // queued, so the plan stays open instead of being marked failed.
  let planStatus: string | null = null;
  if (job.plan_id && deps.plans && finished.status !== 'queued') {
    const stepIndex = Number((job.args as { stepIndex?: number } | null)?.stepIndex ?? 0);
    try {
      const advanced = await advancePlan(
        { planId: job.plan_id, stepIndex, succeeded: finished.status === 'succeeded' },
        deps.plans
      );
      planStatus = advanced.planStatus;
    } catch {
      planStatus = null;
    }
  }

  return {
    status: 200,
    body: {
      status: finished.status as JobStatus,
      attempts: finished.attempts,
      snapshotId,
      planStatus,
    },
  };
}

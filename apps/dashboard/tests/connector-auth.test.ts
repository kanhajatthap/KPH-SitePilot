import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildSignedHeaders,
  generateNonce,
} from '@wp-agent/connector-protocol';
import { encryptSecret, hashToken } from '../src/lib/connector/crypto';
import {
  authenticateConnectorRequest,
  type ConnectorAuthStore,
  type ConnectorSiteRecord,
} from '../src/lib/connector/auth';
import {
  handleClaim,
  handleHeartbeat,
  handleJobResult,
  handleUnpair,
  type ConnectorHandlerDeps,
  type SiteWriter,
} from '../src/lib/connector/handlers';
import type { ConnectorJobStore, JobRow, JobResultInput } from '../src/lib/connector/jobs';

const KEY = Buffer.alloc(32, 3);
const SECRET = 'b'.repeat(64);
const SITE_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';

class FakeSiteStore implements ConnectorAuthStore {
  sites: ConnectorSiteRecord[] = [];
  nonces = new Set<string>();

  async findSiteById(siteId: string) {
    return this.sites.find((site) => site.id === siteId) ?? null;
  }

  async recordNonce(siteId: string, nonce: string) {
    const key = `${siteId}:${nonce}`;
    if (this.nonces.has(key)) return false;
    this.nonces.add(key);
    return true;
  }
}

class FakeJobStore implements ConnectorJobStore {
  jobs: JobRow[] = [];
  finished: JobResultInput[] = [];
  claimed: string[] = [];

  async claimNextJob(siteId: string) {
    const now = Date.now();
    const job = this.jobs.find((candidate) => {
      if (candidate.site_id !== siteId) return false;
      if (candidate.status === 'queued') return true;
      // Mirrors claim_next_job: a claimed job is only re-claimable once its
      // lease has expired.
      if (candidate.status !== 'claimed' || !candidate.lease_expires_at) return false;
      return new Date(candidate.lease_expires_at).getTime() < now;
    });
    if (!job) return null;
    job.status = 'claimed';
    job.attempts += 1;
    job.lease_expires_at = new Date(now + 120_000).toISOString();
    this.claimed.push(job.id);
    return job;
  }

  async getJob(jobId: string, siteId: string) {
    return this.jobs.find((job) => job.id === jobId && job.site_id === siteId) ?? null;
  }

  async finishJob(input: JobResultInput) {
    const job = this.jobs.find((candidate) => candidate.id === input.jobId);
    if (!job) throw new Error('missing job');
    this.finished.push(input);
    job.status = input.ok ? 'succeeded' : 'failed';
    return { status: job.status, attempts: job.attempts };
  }
}

class FakeSiteWriter implements SiteWriter {
  heartbeats: Array<Record<string, unknown>> = [];
  siteInfo: Array<Record<string, unknown>> = [];
  revoked: string[] = [];

  async applyHeartbeat(siteId: string, input: Record<string, unknown>) {
    this.heartbeats.push({ siteId, ...input });
  }

  async applySiteInfo(siteId: string, info: Record<string, unknown>) {
    this.siteInfo.push({ siteId, ...info });
  }

  async revokeSite(siteId: string) {
    this.revoked.push(siteId);
    const site = sites.sites.find((candidate) => candidate.id === siteId);
    if (site) site.status = 'revoked';
  }
}

function makeSite(overrides: Partial<ConnectorSiteRecord> = {}): ConnectorSiteRecord {
  return {
    id: SITE_ID,
    project_id: PROJECT_ID,
    url: 'https://shop.example.com',
    name: 'Shop',
    status: 'active',
    scopes: ['read', 'content', 'files', 'code'],
    secret_encrypted: encryptSecret(SECRET, KEY),
    ...overrides,
  };
}

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: JOB_ID,
    project_id: PROJECT_ID,
    site_id: SITE_ID,
    plan_id: null,
    tool: 'site.info',
    args: {},
    risk: 'R0',
    status: 'queued',
    attempts: 0,
    max_attempts: 3,
    lease_expires_at: null,
    created_at: new Date('2026-11-01T09:00:00Z').toISOString(),
    ...overrides,
  };
}

let sites: FakeSiteStore;
let jobs: FakeJobStore;
let writer: FakeSiteWriter;
let deps: ConnectorHandlerDeps;

beforeEach(() => {
  sites = new FakeSiteStore();
  sites.sites.push(makeSite());
  jobs = new FakeJobStore();
  jobs.jobs.push(makeJob());
  writer = new FakeSiteWriter();
  deps = {
    authStore: sites,
    jobStore: jobs,
    siteWriter: writer,
    encryptionKey: KEY,
    nowSeconds: () => 1_800_000_000,
  };
});

function signed(body: string, overrides: { secret?: string; nowSeconds?: number; nonce?: string } = {}) {
  const headers = buildSignedHeaders({
    siteId: SITE_ID,
    secret: overrides.secret ?? SECRET,
    body,
    nonce: overrides.nonce ?? generateNonce(),
    nowSeconds: overrides.nowSeconds ?? 1_800_000_000,
  });
  return new Headers(headers);
}

describe('authenticateConnectorRequest', () => {
  it('accepts a correctly signed request', async () => {
    const body = JSON.stringify({ hello: 'world' });
    const result = await authenticateConnectorRequest({
      headers: signed(body),
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.site.id).toBe(SITE_ID);
    expect(result.site.projectId).toBe(PROJECT_ID);
    expect(result.site.scopes).toContain('files');
  });

  it('rejects a request signed with the wrong secret', async () => {
    const body = '{"a":1}';
    const result = await authenticateConnectorRequest({
      headers: signed(body, { secret: 'c'.repeat(64) }),
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SIGNATURE');
    expect(result.status).toBe(401);
  });

  it('rejects a body changed after signing', async () => {
    const body = '{"amount":10}';
    const headers = signed(body);

    const result = await authenticateConnectorRequest({
      headers,
      rawBody: '{"amount":1000000}',
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SIGNATURE');
  });

  it('rejects stale timestamps', async () => {
    const body = '{}';
    const result = await authenticateConnectorRequest({
      headers: signed(body, { nowSeconds: 1_800_000_000 - 900 }),
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('TIMESTAMP_OUT_OF_WINDOW');
  });

  it('rejects a replayed nonce', async () => {
    const body = '{}';
    const nonce = generateNonce();
    const headers = signed(body, { nonce });

    const first = await authenticateConnectorRequest({
      headers,
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
    });
    const second = await authenticateConnectorRequest({
      headers: signed(body, { nonce }),
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('REPLAY_DETECTED');
  });

  it('refuses unknown, revoked and paused sites before any crypto', async () => {
    const body = '{}';

    const unknown = await authenticateConnectorRequest({
      headers: new Headers({ 'x-sitepilot-site': PROJECT_ID }),
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
    });
    expect(unknown.ok).toBe(false);

    sites.sites[0].status = 'revoked';
    const revoked = await authenticateConnectorRequest({
      headers: signed(body),
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
    });
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.code).toBe('SITE_REVOKED');

    sites.sites[0].status = 'paused';
    const paused = await authenticateConnectorRequest({
      headers: signed(body),
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
    });
    expect(paused.ok).toBe(false);
    if (!paused.ok) expect(paused.code).toBe('SITE_PAUSED');
  });

  it('fails closed when the stored secret cannot be decrypted', async () => {
    sites.sites[0].secret_encrypted = 'v1.bad.bad.bad';
    const body = '{}';

    const result = await authenticateConnectorRequest({
      headers: signed(body),
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SECRET_UNAVAILABLE');
  });

  it.each(['wrong-secret', 'tampered-body', 'stale', 'missing-signature'])(
    'does not consume site budget for %s requests', async (kind) => {
      const headers = signed('{}', kind === 'wrong-secret'
        ? { secret: 'c'.repeat(64) }
        : kind === 'stale' ? { nowSeconds: 1_799_999_000 } : {});
      if (kind === 'missing-signature') headers.delete('x-sitepilot-signature');
      const isRateLimited = vi.fn(() => true);
      const result = await authenticateConnectorRequest({
        headers, rawBody: kind === 'tampered-body' ? '{"changed":true}' : '{}',
        store: sites, encryptionKey: KEY, nowSeconds: 1_800_000_000, isRateLimited,
      });
      expect(result).toMatchObject({ ok: false, status: 401 });
      expect(isRateLimited).not.toHaveBeenCalled();
      expect(sites.nonces.size).toBe(0);
    }
  );

  it('charges fresh authenticated requests once, not replayed requests', async () => {
    const headers = signed('{}');
    const isRateLimited = vi.fn(() => false);
    const input = { headers, rawBody: '{}', store: sites, encryptionKey: KEY,
      nowSeconds: 1_800_000_000, isRateLimited };
    expect((await authenticateConnectorRequest(input)).ok).toBe(true);
    expect(await authenticateConnectorRequest(input)).toMatchObject({ code: 'REPLAY_DETECTED' });
    expect(isRateLimited).toHaveBeenCalledExactlyOnceWith(SITE_ID);
  });

  it('consumes a denied authenticated nonce; retries require a fresh signature', async () => {
    const headers = signed('{}');
    const isRateLimited = vi.fn(() => true);
    const input = { headers, rawBody: '{}', store: sites, encryptionKey: KEY,
      nowSeconds: 1_800_000_000, isRateLimited };
    expect(await authenticateConnectorRequest(input)).toMatchObject({ status: 429 });
    expect(await authenticateConnectorRequest(input)).toMatchObject({ code: 'REPLAY_DETECTED' });
    isRateLimited.mockReturnValue(false);
    expect((await authenticateConnectorRequest({ ...input, headers: signed('{}') })).ok).toBe(true);
    expect(isRateLimited).toHaveBeenCalledTimes(2);
  });

  it('does not charge when nonce storage fails closed', async () => {
    const isRateLimited = vi.fn(() => false);
    sites.recordNonce = async () => { throw new Error('storage unavailable'); };
    expect(await authenticateConnectorRequest({
      headers: signed('{}'), rawBody: '{}', store: sites, encryptionKey: KEY,
      nowSeconds: 1_800_000_000, isRateLimited,
    })).toMatchObject({ code: 'REPLAY_DETECTED' });
    expect(isRateLimited).not.toHaveBeenCalled();
  });

  it('enforces the per-site budget', async () => {
    const body = '{}';
    const result = await authenticateConnectorRequest({
      headers: signed(body),
      rawBody: body,
      store: sites,
      encryptionKey: KEY,
      nowSeconds: 1_800_000_000,
      isRateLimited: () => true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(result.status).toBe(429);
  });
});

describe('connector handlers', () => {
  it('records a heartbeat with the capability manifest', async () => {
    const body = JSON.stringify({
      pluginVersion: '0.3.0',
      wpVersion: '6.7',
      phpVersion: '8.2',
      capabilities: { theme: { type: 'block' }, builders: ['gutenberg'] },
    });

    const output = await handleHeartbeat(signed(body), body, deps);

    expect(output.status).toBe(200);
    expect(writer.heartbeats).toHaveLength(1);
    expect(writer.heartbeats[0].pluginVersion).toBe('0.3.0');
    expect((writer.heartbeats[0].capabilities as { builders: string[] }).builders).toEqual(['gutenberg']);
    expect((output.body as { nextPollSeconds: number }).nextPollSeconds).toBe(60);
  });

  it('rejects an unsigned heartbeat before writing anything', async () => {
    const output = await handleHeartbeat(new Headers(), '{}', deps);

    expect(output.status).toBe(401);
    expect(writer.heartbeats).toHaveLength(0);
  });

  it('claims exactly one job per call and returns null when idle', async () => {
    const first = await handleClaim(signed('{}'), '{}', deps);
    const second = await handleClaim(signed('{}'), '{}', deps);

    expect(first.status).toBe(200);
    const claimedJob = (first.body as { job: { id: string; tool: string; risk: string } }).job;
    expect(claimedJob.id).toBe(JOB_ID);
    expect(claimedJob.tool).toBe('site.info');
    expect(claimedJob.risk).toBe('R0');

    expect((second.body as { job: unknown }).job).toBeNull();
    expect(jobs.claimed).toEqual([JOB_ID]);
  });

  it('refuses to hand a non-allowlisted tool to a WordPress site', async () => {
    jobs.jobs[0].tool = 'code.php.snippet';

    const output = await handleClaim(signed('{}'), '{}', deps);

    expect((output.body as { job: unknown }).job).toBeNull();
    expect(jobs.finished[0].error?.code).toBe('TOOL_NOT_ALLOWED');
  });

  it('applies site.info results to the site row', async () => {
    jobs.jobs[0].status = 'claimed';
    const body = JSON.stringify({
      jobId: JOB_ID,
      ok: true,
      result: { capabilities: { postTypes: ['post', 'page'] }, wpVersion: '6.7' },
      durationMs: 42,
    });

    const output = await handleJobResult(JOB_ID, signed(body), body, deps);

    expect(output.status).toBe(200);
    expect((output.body as { status: string }).status).toBe('succeeded');
    expect(writer.siteInfo).toHaveLength(1);
    expect((writer.siteInfo[0].capabilities as { postTypes: string[] }).postTypes).toEqual(['post', 'page']);
  });

  it('records a failure without leaking it as success', async () => {
    jobs.jobs[0].status = 'claimed';
    const body = JSON.stringify({
      jobId: JOB_ID,
      ok: false,
      error: { code: 'WP_FILESYSTEM', message: 'Filesystem not writable' },
      retryable: false,
    });

    const output = await handleJobResult(JOB_ID, signed(body), body, deps);

    expect((output.body as { status: string }).status).toBe('failed');
    expect(jobs.finished[0].ok).toBe(false);
    expect(jobs.finished[0].error?.code).toBe('WP_FILESYSTEM');
    expect(writer.siteInfo).toHaveLength(0);
  });

  it('is idempotent when a result is reported twice', async () => {
    jobs.jobs[0].status = 'succeeded';
    const body = JSON.stringify({ jobId: JOB_ID, ok: true, result: {} });

    const output = await handleJobResult(JOB_ID, signed(body), body, deps);

    expect((output.body as { idempotent?: boolean }).idempotent).toBe(true);
    expect(jobs.finished).toHaveLength(0);
  });

  it('rejects a path id that disagrees with the signed body', async () => {
    const body = JSON.stringify({ jobId: PROJECT_ID, ok: true });

    const output = await handleJobResult(JOB_ID, signed(body), body, deps);

    expect(output.status).toBe(400);
    expect((output.body as { error: string }).error).toBe('VALIDATION_FAILED');
  });

  it('returns 404 for a job that belongs to another site', async () => {
    const otherJobId = '44444444-4444-4444-8444-444444444444';
    jobs.jobs.push(makeJob({ id: otherJobId, site_id: PROJECT_ID, status: 'claimed' }));

    const body = JSON.stringify({ jobId: otherJobId, ok: true });
    const output = await handleJobResult(otherJobId, signed(body), body, deps);

    expect(output.status).toBe(404);
    expect((output.body as { error: string }).error).toBe('JOB_NOT_FOUND');
  });
});

describe('handleUnpair', () => {
  it('revokes the site when the request is signed', async () => {
    const body = JSON.stringify({ siteId: SITE_ID });
    const result = await handleUnpair(signed(body), body, deps);

    expect(result.status).toBe(200);
    expect((result.body as { status: string }).status).toBe('revoked');
    expect(writer.revoked).toEqual([SITE_ID]);
  });

  it('refuses an unsigned unpair, so nobody can revoke a site by guessing its id', async () => {
    const body = JSON.stringify({ siteId: SITE_ID });
    const result = await handleUnpair(signed(body, { secret: 'c'.repeat(64) }), body, deps);

    expect(result.status).toBe(401);
    expect(writer.revoked).toEqual([]);
  });

  it('reports SITE_REVOKED for a second call instead of revoking twice', async () => {
    const body = JSON.stringify({ siteId: SITE_ID });
    await handleUnpair(signed(body), body, deps);

    const second = await handleUnpair(signed(body), body, deps);
    expect(second.status).toBe(403);
    expect((second.body as { error: string }).error).toBe('SITE_REVOKED');
    expect(writer.revoked).toEqual([SITE_ID]);
  });
});

describe('pairing artefacts stay hash-only', () => {
  it('never stores the plaintext token', () => {
    const token = 'a'.repeat(64);
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toBe(token);
  });
});

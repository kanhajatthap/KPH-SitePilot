import { describe, expect, it } from 'vitest';
import {
  SITE_COLUMNS,
  TABLE_NAMES,
  createAuditRepository,
  createInMemoryRepositoryClient,
  createRepositories,
  createSupabaseRepositoryClient,
  firstOrNull,
  isSensitiveKey,
  isTableName,
  projectScope,
  redactPayload,
  type RepoRow,
  type SiteRow,
  type SupabaseLike,
  type SupabaseQuery,
  type SupabaseResponse,
  type SupabaseTable,
} from '../src/repos/index.js';

const CLOCK = () => '2026-11-03T10:00:00.000Z';

function siteRow(overrides: Partial<RepoRow> = {}): RepoRow {
  return {
    id: 'site-1',
    project_id: 'project-1',
    url: 'https://example.com',
    name: 'Example',
    environment: 'production',
    status: 'active',
    plugin_version: '1.0.0',
    wp_version: '6.8',
    php_version: '8.2',
    capabilities: {},
    scopes: ['read', 'content'],
    last_seen_at: null,
    created_by: 'user-1',
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    // Credentials must never survive a repository read.
    token_hash: 'hash-should-not-leak',
    secret_encrypted: 'secret-should-not-leak',
    ...overrides,
  };
}

function seed() {
  return {
    sites: [
      siteRow(),
      siteRow({ id: 'site-2', status: 'paused', created_at: '2026-11-02T00:00:00.000Z' }),
      siteRow({ id: 'site-3', project_id: 'project-2', created_at: '2026-11-03T00:00:00.000Z' }),
    ],
  };
}

// ── Fake Supabase-like client for the production adapter ──────────────────────

class FakeQuery implements SupabaseQuery {
  constructor(
    private readonly log: string[],
    private readonly response: SupabaseResponse
  ) {}

  select(columns?: string): SupabaseQuery {
    this.log.push(`select:${columns ?? '*'}`);
    return this;
  }
  eq(column: string, value: unknown): SupabaseQuery {
    this.log.push(`eq:${column}=${String(value)}`);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }): SupabaseQuery {
    this.log.push(`order:${column}:${options?.ascending ?? false}`);
    return this;
  }
  limit(count: number): SupabaseQuery {
    this.log.push(`limit:${count}`);
    return this;
  }
  single(): SupabaseQuery {
    this.log.push('single');
    return this;
  }
  // Explicit `any` keeps this structurally PromiseLike without pulling in DOM lib types.
  then(onfulfilled?: any, onrejected?: any): PromiseLike<any> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

class FakeSupabase implements SupabaseLike {
  readonly log: string[] = [];
  constructor(private readonly response: SupabaseResponse = { data: [], error: null }) {}

  from(table: string): SupabaseTable {
    this.log.push(`from:${table}`);
    return {
      select: (columns?: string) => new FakeQuery(this.log, this.response).select(columns),
      insert: (row: Record<string, unknown>) => {
        this.log.push(`insert:${JSON.stringify(row)}`);
        return new FakeQuery(this.log, this.response);
      },
      update: (patch: Record<string, unknown>) => {
        this.log.push(`update:${JSON.stringify(patch)}`);
        return new FakeQuery(this.log, this.response);
      },
    };
  }
}

class ThrowingSupabase implements SupabaseLike {
  from(): SupabaseTable {
    throw new Error('connection refused');
  }
}

describe('E1-05 in-memory repository client', () => {
  it('knows the six shipped tables', () => {
    expect(TABLE_NAMES).toEqual(['sites', 'plans', 'jobs', 'snapshots', 'audit_events', 'usage_events']);
    expect(isTableName('sites')).toBe(true);
    expect(isTableName('projects')).toBe(false);
  });

  it('applies filters, ordering and limits for real', async () => {
    const client = createInMemoryRepositoryClient({ seed: seed() });
    const result = await client.read<SiteRow>({
      table: 'sites',
      filters: [{ column: 'project_id', value: 'project-1' }],
      order: { column: 'created_at', ascending: false },
    });
    expect(result.error).toBeNull();
    expect(result.data?.map((row) => row.id)).toEqual(['site-2', 'site-1']);
  });

  it('projects only the requested columns', async () => {
    const client = createInMemoryRepositoryClient({ seed: seed() });
    const result = await client.read<RepoRow>({ table: 'sites', columns: ['id', 'url'] });
    expect(result.data?.[0]).toEqual({ id: 'site-1', url: 'https://example.com' });
  });

  it('creates deterministic rows and records every call', async () => {
    const client = createInMemoryRepositoryClient({ now: CLOCK });
    const first = await client.create<RepoRow>({ table: 'plans', row: { prompt: 'hello' } });
    expect(first.data).toMatchObject({ id: 'row-plans-1', created_at: CLOCK(), prompt: 'hello' });
    expect(client.snapshot('plans')).toHaveLength(1);
    expect(client.calls).toEqual([{ op: 'create', spec: { table: 'plans', row: { prompt: 'hello' } } }]);
  });

  it('patches only matching rows', async () => {
    const client = createInMemoryRepositoryClient({ seed: seed() });
    const result = await client.patch<RepoRow>({
      table: 'sites',
      patch: { status: 'revoked' },
      filters: [{ column: 'id', value: 'site-2' }],
      columns: ['id', 'status'],
    });
    expect(result.data).toEqual([{ id: 'site-2', status: 'revoked' }]);
    expect(client.snapshot('sites').find((row) => row.id === 'site-1')?.status).toBe('active');
  });

  it('returns a typed error when injected to fail', async () => {
    const client = createInMemoryRepositoryClient({ failWith: 'storage offline' });
    const result = await client.read({ table: 'jobs' });
    expect(result.data).toBeNull();
    expect(result.error).toEqual({ code: 'INJECTED_FAILURE', message: 'storage offline' });
  });

  it('rejects an unknown table instead of silently reading', async () => {
    const client = createInMemoryRepositoryClient();
    const result = await client.read({ table: 'bogus' as never });
    expect(result.error?.code).toBe('INJECTED_FAILURE');
    expect(result.error?.message).toContain('Unknown table');
  });
});

describe('E1-05 typed repositories', () => {
  it('builds all six repositories from one client', () => {
    const repos = createRepositories(createInMemoryRepositoryClient(), { now: CLOCK });
    expect(Object.keys(repos).sort()).toEqual(['audit', 'jobs', 'plans', 'sites', 'snapshots', 'usage']);
    for (const repo of Object.values(repos)) {
      expect(typeof repo).toBe('object');
    }
  });

  it('never exposes site credentials in any sites read', async () => {
    const client = createInMemoryRepositoryClient({ seed: seed() });
    const repos = createRepositories(client, { now: CLOCK });
    const list = await repos.sites.listActive('project-1');
    expect(list.data).toHaveLength(1);
    const row = list.data?.[0] as unknown as RepoRow;
    expect(row.token_hash).toBeUndefined();
    expect(row.secret_encrypted).toBeUndefined();
    expect(SITE_COLUMNS).not.toContain('token_hash');
    expect(SITE_COLUMNS).not.toContain('secret_encrypted');
  });

  it('scopes every sites call to the project and status', async () => {
    const client = createInMemoryRepositoryClient({ seed: seed() });
    const repos = createRepositories(client, { now: CLOCK });
    await repos.sites.listActive('project-1');
    const spec = client.calls[0].spec as { filters: Array<{ column: string; value: unknown }> };
    expect(spec.filters).toEqual([
      { column: 'project_id', value: 'project-1' },
      { column: 'status', value: 'active' },
    ]);
  });

  it('finds sites by id and active url, and returns null when missing', async () => {
    const client = createInMemoryRepositoryClient({ seed: seed() });
    const repos = createRepositories(client, { now: CLOCK });
    expect((await repos.sites.findById('project-1', 'site-1')).data?.id).toBe('site-1');
    expect((await repos.sites.findById('project-2', 'site-1')).data).toBeNull();
    expect((await repos.sites.findActiveByUrl('project-1', 'https://example.com')).data?.id).toBe('site-1');
  });

  it('updates status and heartbeat with an injectable clock', async () => {
    const client = createInMemoryRepositoryClient({ seed: seed() });
    const repos = createRepositories(client, { now: CLOCK });
    const update = await repos.sites.updateStatus('project-1', 'site-1', 'paused');
    expect(update.data?.[0]).toMatchObject({ status: 'paused', updated_at: CLOCK() });

    const beat = await repos.sites.touchHeartbeat('project-1', 'site-1', {
      last_seen_at: CLOCK(),
      plugin_version: '1.0.1',
      capabilities: { blocks: true },
    });
    expect(beat.data?.[0]).toMatchObject({ plugin_version: '1.0.1', last_seen_at: CLOCK() });
    expect(client.snapshot('sites').find((row) => row.id === 'site-1')?.status).toBe('paused');
  });

  it('creates plans with safe defaults and an immutable hash', async () => {
    const client = createInMemoryRepositoryClient();
    const repos = createRepositories(client, { now: CLOCK });
    const created = await repos.plans.create({
      project_id: 'project-1',
      site_id: 'site-1',
      prompt: 'Update the hero headline',
      steps: [{ tool: 'blocks.replace' }],
      risk: 'R2',
      hash: 'sha256-abc',
      created_by: 'user-1',
    });
    expect(created.data).toMatchObject({
      status: 'proposed',
      risk: 'R2',
      hash: 'sha256-abc',
      summary: '',
      tokens_in: 0,
      tokens_out: 0,
      created_at: CLOCK(),
    });
  });

  it('reads plans back scoped to project and site', async () => {
    const client = createInMemoryRepositoryClient({
      seed: {
        plans: [
          { id: 'plan-1', project_id: 'project-1', site_id: 'site-1', created_at: '2026-11-01T00:00:00.000Z' },
          { id: 'plan-2', project_id: 'project-1', site_id: 'site-1', created_at: '2026-11-02T00:00:00.000Z' },
          { id: 'plan-3', project_id: 'project-2', site_id: 'site-1', created_at: '2026-11-03T00:00:00.000Z' },
        ],
      },
    });
    const repos = createRepositories(client, { now: CLOCK });
    const list = await repos.plans.listForSite('project-1', 'site-1', 10);
    expect(list.data?.map((row) => row.id)).toEqual(['plan-2', 'plan-1']);
    expect((await repos.plans.findById('project-1', 'plan-2')).data?.id).toBe('plan-2');
    expect((await repos.plans.findById('project-2', 'plan-2')).data).toBeNull();
    await repos.plans.updateStatus('project-1', 'plan-2', 'applied');
    expect(client.snapshot('plans').find((row) => row.id === 'plan-2')?.status).toBe('applied');
  });

  it('enqueues jobs with safe defaults and records outcomes', async () => {
    const client = createInMemoryRepositoryClient();
    const repos = createRepositories(client, { now: CLOCK });
    const job = await repos.jobs.enqueue({
      project_id: 'project-1',
      site_id: 'site-1',
      tool: 'blocks.replace',
      args: { id: 7 },
      risk: 'R1',
      idempotency_key: 'plan:1:step:0',
    });
    expect(job.data).toMatchObject({
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      result: null,
      error: null,
      created_at: CLOCK(),
    });
    const id = (job.data as unknown as RepoRow).id as string;
    const outcome = await repos.jobs.recordOutcome('project-1', id, {
      status: 'succeeded',
      attempts: 1,
      result: { verified: true },
    });
    expect(outcome.data?.[0]).toMatchObject({ status: 'succeeded', attempts: 1, result: { verified: true } });
  });

  it('lists jobs for a plan in creation order', async () => {
    const client = createInMemoryRepositoryClient({
      seed: {
        jobs: [
          { id: 'job-2', project_id: 'project-1', plan_id: 'plan-1', created_at: '2026-11-02T00:00:00.000Z' },
          { id: 'job-1', project_id: 'project-1', plan_id: 'plan-1', created_at: '2026-11-01T00:00:00.000Z' },
          { id: 'job-3', project_id: 'project-1', plan_id: 'plan-2', created_at: '2026-11-03T00:00:00.000Z' },
        ],
      },
    });
    const repos = createRepositories(client);
    const list = await repos.jobs.listForPlan('project-1', 'plan-1');
    expect(list.data?.map((row) => row.id)).toEqual(['job-1', 'job-2']);
  });

  it('records snapshots, lists recent ones and marks restores', async () => {
    const client = createInMemoryRepositoryClient();
    const repos = createRepositories(client, { now: CLOCK });
    const snapshot = await repos.snapshots.record({
      project_id: 'project-1',
      site_id: 'site-1',
      resource: 'post:7',
      before: { title: 'Old' },
      after: { title: 'New' },
      checksum: 'sha256-snap',
      size_bytes: 128,
      expires_at: '2026-11-17T00:00:00.000Z',
    });
    expect(snapshot.data).toMatchObject({ restored_at: null, restore_job_id: null, created_at: CLOCK() });
    const id = (snapshot.data as unknown as RepoRow).id as string;
    const recent = await repos.snapshots.listRecent('project-1', 'site-1', 5);
    expect(recent.data).toHaveLength(1);
    const marked = await repos.snapshots.markRestored('project-1', id, 'job-restore');
    expect(marked.data?.[0]).toMatchObject({ restored_at: CLOCK(), restore_job_id: 'job-restore' });
  });

  it('redacts secrets, bearer tokens and nested keys in audit payloads', async () => {
    const client = createInMemoryRepositoryClient();
    const repos = createRepositories(client, { now: CLOCK });
    const created = await repos.audit.record({
      project_id: 'project-1',
      event_type: 'plan.approved',
      correlation_id: 'corr-1',
      payload: {
        apiKey: 'sk-live-secret',
        authorization: 'Bearer abc.def.ghi',
        nested: { token: 'abc', safe: 'kept', deeper: { password: 'hunter2' } },
        list: ['ok', 'Bearer leak-me'],
        note: 'x'.repeat(400),
      },
    });
    const payload = (created.data as unknown as RepoRow).payload as Record<string, unknown>;
    expect(payload.apiKey).toBe('[redacted]');
    expect(payload.authorization).toBe('[redacted]');
    expect((payload.nested as Record<string, unknown>).token).toBe('[redacted]');
    expect((payload.nested as Record<string, unknown>).safe).toBe('kept');
    expect(((payload.nested as Record<string, unknown>).deeper as Record<string, unknown>).password).toBe('[redacted]');
    expect((payload.list as unknown[])[1]).toBe('[redacted]');
    expect(String(payload.note)).toHaveLength(257);
    expect(JSON.stringify(created.data)).not.toContain('hunter2');
    expect(JSON.stringify(created.data)).not.toContain('sk-live-secret');
  });

  it('scopes audit reads to the project and finds by correlation id', async () => {
    const client = createInMemoryRepositoryClient();
    const repos = createRepositories(client, { now: CLOCK });
    await repos.audit.record({ project_id: 'project-1', event_type: 'site.paired', correlation_id: 'corr-9' });
    await repos.audit.record({ project_id: 'project-2', event_type: 'site.paired', correlation_id: 'corr-10' });
    expect((await repos.audit.listForProject('project-1')).data).toHaveLength(1);
    expect((await repos.audit.findByCorrelation('project-1', 'corr-9')).data?.event_type).toBe('site.paired');
    expect((await repos.audit.findByCorrelation('project-1', 'corr-10')).data).toBeNull();
  });

  it('sums usage tokens per owner without leaking another owner', async () => {
    const client = createInMemoryRepositoryClient();
    const repos = createRepositories(client, { now: CLOCK });
    await repos.usage.record({ owner_id: 'user-1', kind: 'model.call', tokens_in: 100, tokens_out: 40 });
    await repos.usage.record({ owner_id: 'user-1', kind: 'model.call', tokens_in: 60, tokens_out: 20 });
    await repos.usage.record({ owner_id: 'user-2', kind: 'model.call', tokens_in: 999, tokens_out: 999 });
    const totals = await repos.usage.totalsForOwner('user-1');
    expect(totals.data).toEqual({ events: 2, tokensIn: 160, tokensOut: 60 });
    expect((await repos.usage.listForOwner('user-2')).data).toHaveLength(1);
  });

  it('propagates storage errors through every repository', async () => {
    const client = createInMemoryRepositoryClient({ failWith: 'db down' });
    const repos = createRepositories(client);
    const results = await Promise.all([
      repos.sites.listActive('project-1'),
      repos.plans.listForSite('project-1', 'site-1'),
      repos.jobs.listForPlan('project-1', 'plan-1'),
      repos.snapshots.listRecent('project-1', 'site-1'),
      repos.audit.listForProject('project-1'),
      repos.usage.listForOwner('user-1'),
    ]);
    for (const result of results) {
      expect(result.error).toEqual({ code: 'INJECTED_FAILURE', message: 'db down' });
      expect(result.data).toBeNull();
    }
  });

  it('keeps project scoping on every read and patch', async () => {
    const client = createInMemoryRepositoryClient({ seed: seed() });
    const repos = createRepositories(client, { now: CLOCK });
    await repos.sites.listActive('project-1');
    await repos.plans.listForSite('project-1', 'site-1');
    await repos.jobs.listForPlan('project-1', 'plan-1');
    await repos.snapshots.listRecent('project-1', 'site-1');
    await repos.audit.listForProject('project-1');
    await repos.plans.updateStatus('project-1', 'plan-1', 'approved');
    const scoped = client.calls.filter((call) => call.op === 'read' || call.op === 'patch');
    for (const call of scoped) {
      const filters = (call.spec as { filters?: Array<{ column: string; value: unknown }> }).filters ?? [];
      expect(filters.some((f) => f.column === 'project_id' && f.value === 'project-1'), JSON.stringify(call.spec)).toBe(true);
    }
    // usage is owner-scoped, not project-scoped.
    const usageCall = client.calls.find((call) => (call.spec as { table?: string }).table === 'usage_events');
    expect(usageCall).toBeUndefined();
  });
});

describe('E1-05 redaction helpers', () => {
  it('detects sensitive key names case-insensitively', () => {
    for (const key of ['token', 'api_key', 'API-KEY', 'secret_encrypted', 'password', 'Authorization', 'cookie', 'privateKey']) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
    for (const key of ['title', 'url', 'status', 'blocks']) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });

  it('redacts JWT-shaped and sk- values even under a safe key', () => {
    const payload = redactPayload({
      note: 'Bearer abc123xyz',
      other: 'sk-abcdefghijklmnopqrstuvwxyz',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc',
    });
    expect(payload.note).toBe('[redacted]');
    expect(payload.other).toBe('[redacted]');
    expect(payload.jwt).toBe('[redacted]');
  });

  it('bounds recursion depth and array length', () => {
    let nested: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < 20; i += 1) nested = { child: nested };
    const result = redactPayload(nested);
    expect(JSON.stringify(result)).toContain('[redacted]');
    expect(redactPayload({ items: Array.from({ length: 500 }, () => 'ok') }).items).toHaveLength(100);
  });
});

describe('E1-05 Supabase adapter', () => {
  it('pushes projection, filters, order and limit into the query', async () => {
    const fake = new FakeSupabase({ data: [{ id: 'site-1' }], error: null });
    const client = createSupabaseRepositoryClient(fake);
    const result = await client.read<SiteRow>({
      table: 'sites',
      columns: ['id', 'url'],
      filters: [{ column: 'project_id', value: 'project-1' }],
      order: { column: 'created_at', ascending: false },
      limit: 5,
    });
    expect(result.data).toEqual([{ id: 'site-1' }]);
    expect(fake.log).toEqual([
      'from:sites',
      'select:id,url',
      'eq:project_id=project-1',
      'order:created_at:false',
      'limit:5',
    ]);
  });

  it('maps Supabase errors to typed repository errors', async () => {
    const fake = new FakeSupabase({ data: null, error: { message: 'permission denied', code: '42501' } });
    const client = createSupabaseRepositoryClient(fake);
    const result = await client.read({ table: 'jobs' });
    expect(result.data).toBeNull();
    expect(result.error).toEqual({ code: '42501', message: 'permission denied' });
  });

  it('uses insert → select → single for creates', async () => {
    const fake = new FakeSupabase({ data: { id: 'plan-1' }, error: null });
    const client = createSupabaseRepositoryClient(fake);
    const result = await client.create({ table: 'plans', row: { prompt: 'hello' } });
    expect(result.data).toEqual({ id: 'plan-1' });
    expect(fake.log).toContain('from:plans');
    expect(fake.log).toContain('insert:{"prompt":"hello"}');
    expect(fake.log).toContain('select:*');
    expect(fake.log).toContain('single');
  });

  it('uses update → eq → select for patches', async () => {
    const fake = new FakeSupabase({ data: [{ id: 'site-1' }], error: null });
    const client = createSupabaseRepositoryClient(fake);
    const result = await client.patch({
      table: 'sites',
      patch: { status: 'paused' },
      filters: [{ column: 'id', value: 'site-1' }, { column: 'project_id', value: 'project-1' }],
    });
    expect(result.data).toEqual([{ id: 'site-1' }]);
    expect(fake.log).toEqual([
      'from:sites',
      'update:{"status":"paused"}',
      'eq:id=site-1',
      'eq:project_id=project-1',
      'select:*',
    ]);
  });

  it('turns a thrown transport error into a typed error', async () => {
    const client = createSupabaseRepositoryClient(new ThrowingSupabase());
    const result = await client.read({ table: 'plans' });
    expect(result.data).toBeNull();
    expect(result.error).toEqual({ code: 'REPOSITORY_ERROR', message: 'connection refused' });
  });

  it('keeps repositories working through the adapter', async () => {
    const fake = new FakeSupabase({ data: [], error: null });
    const repos = createRepositories(createSupabaseRepositoryClient(fake), { now: CLOCK });
    const result = await repos.sites.listActive('project-1');
    expect(result.error).toBeNull();
    expect(fake.log[0]).toBe('from:sites');
    expect(fake.log).toContain('select:' + SITE_COLUMNS.join(','));
  });
});

describe('E1-05 small helpers', () => {
  it('firstOrNull keeps errors and returns null for an empty list', () => {
    expect(firstOrNull({ data: ['a'], error: null })).toEqual({ data: 'a', error: null });
    expect(firstOrNull({ data: [], error: null })).toEqual({ data: null, error: null });
    expect(firstOrNull({ data: null, error: { code: 'X', message: 'no' } })).toEqual({
      data: null,
      error: { code: 'X', message: 'no' },
    });
  });

  it('projectScope always leads with the project filter', () => {
    expect(projectScope('project-1', { column: 'id', value: 'x' })).toEqual([
      { column: 'project_id', value: 'project-1' },
      { column: 'id', value: 'x' },
    ]);
  });
});

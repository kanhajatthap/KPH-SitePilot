import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(), createSupabaseAdminClient: vi.fn(),
  createSupabaseUserKeyStore: vi.fn(), listOwnedProjects: vi.fn(), createOwnedProject: vi.fn(),
  projectBelongsToUser: vi.fn(), ensureOwnedProjectId: vi.fn(), insertPairingCode: vi.fn(),
  rotateSiteCredentials: vi.fn(), listOwnerActivity: vi.fn(), siteBelongsToUser: vi.fn(),
  enqueueConnectorJob: vi.fn(), createSupabasePairingStore: vi.fn(), pairSite: vi.fn(),
  listUserKeys: vi.fn(), saveUserKey: vi.fn(), testUserKey: vi.fn(), deleteKey: vi.fn(),
}));
vi.mock('../src/lib/auth/api', () => ({ authenticateApiRequest: m.authenticateApiRequest }));
vi.mock('../src/lib/supabase/admin', () => ({ createSupabaseAdminClient: m.createSupabaseAdminClient }));
vi.mock('../src/lib/connector/store', async (original) => ({
  ...await original<typeof import('../src/lib/connector/store')>(), ...m,
}));
vi.mock('../src/lib/connector/keys', async (original) => ({
  ...await original<typeof import('../src/lib/connector/keys')>(),
  listUserKeys: m.listUserKeys, saveUserKey: m.saveUserKey, testUserKey: m.testUserKey,
}));
vi.mock('../src/lib/connector/pairing', async (original) => ({
  ...await original<typeof import('../src/lib/connector/pairing')>(), pairSite: m.pairSite,
}));
vi.mock('../src/lib/connector/crypto', async (original) => ({
  ...await original<typeof import('../src/lib/connector/crypto')>(), getEncryptionKey: () => Buffer.alloc(32, 7),
}));
vi.mock('../src/lib/abuse', () => ({ clientIpFrom: () => 'test-ip', enforceAbuseLimit: async () => ({ ok: true }) }));
import * as keys from '../src/app/api/connector/keys/route';
import * as projects from '../src/app/api/connector/projects/route';
import { POST as code } from '../src/app/api/connector/pairing-codes/route';
import { POST as pair } from '../src/app/api/connector/pair/route';
import { POST as rotate } from '../src/app/api/connector/sites/[id]/rotate-secret/route';
import { GET as activity } from '../src/app/api/connector/activity/route';
import { GET as plans } from '../src/app/api/connector/plans/route';
import { POST as enqueue } from '../src/app/api/connector/jobs/route';
import { ConnectorConfigError } from '../src/lib/connector/crypto';

const id = '11111111-2222-4333-8444-555555555555';
const detail = 'PRIVATE_BACKEND_DETAIL /srv/internal/db.ts account-row';
const req = (body: unknown = {}) => new Request(`https://app.example/api?siteId=${id}&provider=gemini`, {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
});
const rotateRequest = () => rotate(req(), { params: Promise.resolve({ id }) });
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.resetAllMocks();
  m.authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: { id: 'owner', email: 'owner@example.test' } } });
  m.createSupabaseUserKeyStore.mockReturnValue({ deleteKey: m.deleteKey });
  m.siteBelongsToUser.mockResolvedValue(true);
  m.projectBelongsToUser.mockResolvedValue(true);
  m.ensureOwnedProjectId.mockResolvedValue(id);
  m.createSupabasePairingStore.mockReturnValue({});
  query = Object.fromEntries(['from', 'select', 'eq', 'order', 'limit', 'maybeSingle'].map((key) => [key, vi.fn()]));
  for (const fn of Object.values(query)) fn.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: [], error: null });
  query.maybeSingle.mockResolvedValue({ data: { id, project_id: id, status: 'active', projects: { owner_id: 'owner' } }, error: null });
  m.createSupabaseAdminClient.mockReturnValue(query);
});
const cases = [
  ['key list', 'listUserKeys', () => keys.GET(), 'STORAGE_UNAVAILABLE'],
  ['key save', 'saveUserKey', () => keys.POST(req({ provider: 'gemini', apiKey: 'test-input' })), 'STORAGE_UNAVAILABLE'],
  ['key test', 'testUserKey', () => keys.POST(req({ provider: 'gemini', action: 'test' })), 'STORAGE_UNAVAILABLE'],
  ['key delete', 'deleteKey', () => keys.DELETE(req()), 'STORAGE_UNAVAILABLE'],
  ['project list', 'listOwnedProjects', () => projects.GET(), 'STORAGE_UNAVAILABLE'],
  ['project create', 'createOwnedProject', () => projects.POST(req({ name: 'Test' })), 'STORAGE_UNAVAILABLE'],
  ['code owner check', 'projectBelongsToUser', () => code(req({ projectId: id })), 'CONNECTOR_STORAGE_UNAVAILABLE'],
  ['code insert', 'insertPairingCode', () => code(req()), 'CONNECTOR_STORAGE_UNAVAILABLE'],
  ['pair', 'pairSite', () => pair(req({ code: 'TEST-CODE', siteUrl: 'https://shop.example' })), 'STORAGE_UNAVAILABLE'],
  ['rotation', 'rotateSiteCredentials', rotateRequest, 'CONNECTOR_STORAGE_UNAVAILABLE'],
  ['activity', 'listOwnerActivity', () => activity(req()), 'ACTIVITY_LOAD_FAILED'],
  ['plan ownership', 'siteBelongsToUser', () => plans(req()), 'PLAN_LIST_FAILED'],
  ['job enqueue', 'enqueueConnectorJob', () => enqueue(req({ siteId: id, tool: 'site.info' })), 'ENQUEUE_FAILED'],
] as const;
async function safe(response: Response, error: string) {
  expect(response.status).toBe(503);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = await response.json();
  expect(body.error).toBe(error);
  expect(typeof body.message).toBe('string');
  expect(JSON.stringify(body)).not.toContain(detail);
  expect(body.credentials).toBeUndefined();
}
describe('six-task connector error batch', () => {
  for (const [label, dep, run, error] of cases) {
    it.each([new Error(detail), { message: detail }, null])(`${label} masks arbitrary thrown values (%#)`, async (failure) => {
      m[dep].mockRejectedValue(failure);
      await safe(await run(), error);
    });
  }
  it.each([keys.GET, () => keys.POST(req({ provider: 'gemini' })), () => keys.DELETE(req())])('catches key-store construction failure (%#)', async (run) => {
    m.createSupabaseUserKeyStore.mockImplementation(() => { throw new Error(detail); });
    await safe(await run(), 'STORAGE_UNAVAILABLE');
  });
  it.each([projects.GET, () => projects.POST(req({ name: 'Test' }))])('catches project client construction failure (%#)', async (run) => {
    m.createSupabaseAdminClient.mockImplementation(() => { throw new Error(detail); });
    await safe(await run(), 'STORAGE_UNAVAILABLE');
  });
  it.each(['returned', 'thrown'])('masks %s plan query errors', async (kind) => {
    if (kind === 'returned') query.limit.mockResolvedValue({ data: null, error: { message: detail } });
    else query.limit.mockRejectedValue(new Error(detail));
    await safe(await plans(req()), 'PLAN_LIST_FAILED');
  });
  it('keeps typed rotation configuration errors safe', async () => {
    m.rotateSiteCredentials.mockRejectedValue(new ConnectorConfigError(detail));
    await safe(await rotateRequest(), 'CONFIG_MISSING');
  });
  it('does not classify an arbitrary backend message as configuration', async () => {
    m.rotateSiteCredentials.mockRejectedValue(new Error('SITEPILOT_ENCRYPTION_KEY ' + detail));
    await safe(await rotateRequest(), 'CONNECTOR_STORAGE_UNAVAILABLE');
  });
  it('does not create a pairing code after a body read failure', async () => {
    const request = req();
    vi.spyOn(request, 'text').mockRejectedValue(new Error(detail));
    expect((await code(request)).status).toBe(400);
    expect(m.ensureOwnedProjectId).not.toHaveBeenCalled();
    expect(m.insertPairingCode).not.toHaveBeenCalled();
  });
  it('does not enqueue on failed plan ownership', async () => {
    m.siteBelongsToUser.mockResolvedValue(false);
    expect((await plans(req())).status).toBe(404);
    expect(m.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
  it('catches pairing-store construction errors', async () => {
    m.createSupabasePairingStore.mockImplementation(() => { throw new Error(detail); });
    await safe(await pair(req({ code: 'TEST-CODE', siteUrl: 'https://shop.example' })), 'STORAGE_UNAVAILABLE');
    expect(m.pairSite).not.toHaveBeenCalled();
  });
  it('does not submit jobs if the ownership query throws', async () => {
    query.maybeSingle.mockRejectedValue(new Error(detail));
    await safe(await enqueue(req({ siteId: id })), 'ENQUEUE_FAILED');
    expect(m.enqueueConnectorJob).not.toHaveBeenCalled();
  });
  it('does not enqueue a job for another owner', async () => {
    query.maybeSingle.mockResolvedValue({ data: { id, status: 'active', projects: { owner_id: 'other' } }, error: null });
    expect((await enqueue(req({ siteId: id }))).status).toBe(404);
    expect(m.enqueueConnectorJob).not.toHaveBeenCalled();
  });
  it('preserves pair success when only the bootstrap job fails', async () => {
    m.pairSite.mockResolvedValue({ ok: true, credentials: { siteId: id, projectId: id, siteUrl: 'https://shop.example', environment: 'staging', scopes: ['read'], token: 'test-token', secret: 'test-secret' } });
    m.enqueueConnectorJob.mockRejectedValue(new Error(detail));
    const response = await pair(req({ code: 'TEST-CODE', siteUrl: 'https://shop.example' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.status).toBe('paired');
    expect(body.firstJobId).toBeNull();
    expect(JSON.stringify(body)).not.toContain(detail);
  });
  for (const [label, dep, run] of cases.filter(([label]) => label !== 'pair')) {
    it(`${label} retains the session gate`, async () => {
      m.authenticateApiRequest.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
      expect((await run()).status).toBe(401);
      expect(m[dep]).not.toHaveBeenCalled();
    });
  }
  it('keeps successful plan history unchanged', async () => {
    const response = await plans(req());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plans: [] });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), factory: vi.fn(), owner: vi.fn(), admin: vi.fn(), getPlan: vi.fn() }));
vi.mock('../src/lib/auth/api', () => ({ authenticateApiRequest: m.auth }));
vi.mock('../src/lib/supabase/admin', () => ({ createSupabaseAdminClient: m.admin }));
vi.mock('../src/lib/connector/store', async original => ({
  ...await original<typeof import('../src/lib/connector/store')>(),
  createSupabasePlanStore: m.factory, siteBelongsToUser: m.owner,
}));
import { POST as approve } from '../src/app/api/connector/plans/[id]/approve/route';
import { POST as execute } from '../src/app/api/connector/plans/[id]/execute/route';
import { POST as create } from '../src/app/api/connector/plans/route';
import { GET as job } from '../src/app/api/connector/jobs/route';
const id = '11111111-2222-4333-8444-555555555555';
const req = () => new Request(`https://app.example/api?jobId=${id}`, { method: 'POST', body: JSON.stringify({ siteId: id, prompt: 'Read site information' }) });
const ctx = () => ({ params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ ok: true, context: { mode: 'saas', user: { id: 'owner' } } });
  m.factory.mockReturnValue({ getPlan: m.getPlan });
  m.getPlan.mockResolvedValue({ site_id: id });
});
describe('remaining API storage error boundaries', () => {
  it.each([
    ['approval', () => approve(req(), ctx()), 'APPROVAL_UNAVAILABLE'],
    ['execution', () => execute(req(), ctx()), 'EXECUTION_UNAVAILABLE'],
    ['creation', () => create(req()), 'PLAN_CREATE_FAILED'],
    ['job read', () => job(req()), 'JOB_LOAD_FAILED'],
  ] as const)('%s masks thrown storage failures', async (_name, run, code) => {
    const error = new Error('PRIVATE_INTERNAL_DETAIL');
    m.owner.mockRejectedValue(error);
    m.admin.mockImplementation(() => { throw error; });
    const res = await run();
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body.error).toBe(code);
    expect(JSON.stringify(body)).not.toContain('PRIVATE_INTERNAL_DETAIL');
  });
  it('does not approve unreadable payloads', async () => {
    const request = req(); vi.spyOn(request, 'json').mockRejectedValue(new Error('bad stream'));
    expect((await approve(request, ctx())).status).toBe(400);
    expect(m.factory).not.toHaveBeenCalled();
  });
  it.each([approve, execute])('preserves owner denial before mutations', async run => {
    m.owner.mockResolvedValue(false);
    expect((await run(req(), ctx())).status).toBe(404);
  });
});

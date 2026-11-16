import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.create }));
import { POST } from '../src/app/api/connector/restricted-files/review/route';
const body = { siteId: '11111111-1111-4111-8111-111111111111', proposalId: 'a'.repeat(32), confirmation: 'a'.repeat(32), beforeHash: 'b'.repeat(64), afterHash: 'c'.repeat(64) };
function request(payload: unknown = body, headers: Record<string, string> = {}) {
  return new Request('https://dashboard.example.test/api/connector/restricted-files/review', { method: 'POST', headers: { origin: 'https://dashboard.example.test', 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
describe('restricted metadata review endpoint', () => {
  it('records review without claiming executable approval', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'review_recorded', reviewOnly: true, executionAllowed: false, executionCode: 'FILE_EDITOR_NOT_RELEASED' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.rpc).toHaveBeenCalledWith('consume_restricted_file_review', { p_site_id: body.siteId, p_proposal_id: body.proposalId, p_confirmation: body.confirmation, p_before_hash: body.beforeHash, p_after_hash: body.afterHash });
  });
  it.each<Record<string, string>>([{ origin: 'https://evil.example.test' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }])('rejects CSRF %j', async (headers) => {
    expect((await POST(request(body, headers))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires JSON', async () => { expect((await POST(request(body, { 'content-type': 'text/plain' }))).status).toBe(400); });
  it('does not fall back to local approval', async () => { mocks.create.mockResolvedValue(null); expect((await POST(request())).status).toBe(503); });
  it('requires authenticated session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ ...body, source: 'secret source' }, { ...body, ownerId: 'attacker' }, {}])('rejects injected input %j', async (payload) => {
    expect((await POST(request(payload))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('bounds actual request body bytes', async () => { expect((await POST(request('x'.repeat(3000)))).status).toBe(413); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it('does not claim success for replay or ownership refusal', async () => { mocks.rpc.mockResolvedValue({ data: false, error: null }); expect((await POST(request())).status).toBe(409); });
  it('fails closed when migration is unavailable and hides database details', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'internal database details' } });
    const response = await POST(request()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'REVIEW_UNAVAILABLE' });
  });
  it('does not treat truthy strings as successful consumption', async () => { mocks.rpc.mockResolvedValue({ data: 'true', error: null }); expect((await POST(request())).status).toBe(409); });
});

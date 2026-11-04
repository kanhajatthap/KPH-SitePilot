import { beforeEach, describe, expect, it, vi } from 'vitest';
const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('../src/lib/supabase/admin', () => ({ createSupabaseAdminClient: admin }));
import { revokeSiteForUser, createSupabaseSiteWriter } from '../src/lib/connector/store';
let rpc: ReturnType<typeof vi.fn>;
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  rpc = vi.fn().mockResolvedValue({ error: null });
  query = Object.fromEntries(['select', 'eq', 'maybeSingle'].map(k => [k, vi.fn()]));
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id: 'site', projects: { owner_id: 'owner' } }, error: null });
  admin.mockReturnValue({ from: () => query, rpc });
});
describe('transactional revocation adapter', () => {
  it('uses one RPC after owner verification', async () => {
    expect(await revokeSiteForUser('site', 'owner')).toBe('revoked');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('revoke_connector_site', { p_site_id: 'site' });
  });
  it('does not call RPC for unowned targets', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await revokeSiteForUser('site', 'other')).toBe('not_found');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('does not report successful revocation after RPC failure', async () => {
    rpc.mockResolvedValue({ error: { message: 'private failure' } });
    expect(await revokeSiteForUser('site', 'owner')).toBe('unavailable');
    await expect(createSupabaseSiteWriter()!.revokeSite('site')).rejects.toThrow('Site revocation could not be confirmed.');
  });
});

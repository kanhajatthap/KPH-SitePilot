import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret, hashToken } from '../src/lib/connector/crypto';
const m = vi.hoisted(() => ({ session: vi.fn(), admin: vi.fn(), user: vi.fn(), row: vi.fn(), site: vi.fn(), evidence: vi.fn(), adminFrom: vi.fn() }));
vi.mock('../src/lib/supabase/server', () => ({ createSupabaseServerClient: m.session }));
vi.mock('../src/lib/supabase/admin', () => ({ createSupabaseAdminClient: m.admin }));
import { GET } from '../src/app/api/connector/restricted-files/proposal/route';
const siteId = '11111111-1111-4111-8111-111111111111'; const proposalId = 'a'.repeat(32); const key = Buffer.alloc(32, 8);
const p = { purpose: 'restricted-file-review-v1', protocol: 'restricted-files-v1', engineVersion: 1, proposalId, path: 'themes/test/style.css', before: 'body {}', after: 'body {color:blue}', beforeHash: hashToken('body {}'), afterHash: hashToken('body {color:blue}'), currentHash: hashToken('body {}'), observedAt: Date.now(), expiresAt: Date.now()+600000, environment: 'staging', operatorOptIn: true, canEdit: true, allowedPaths: ['themes/test/style.css'] };
function chain(end: ReturnType<typeof vi.fn>) { const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: end }; q.select.mockReturnValue(q); q.eq.mockReturnValue(q); return q; }
const request = () => new Request(`https://example.test/api/connector/restricted-files/proposal?siteId=${siteId}&proposalId=${proposalId}`);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('SITEPILOT_ENCRYPTION_KEY', key.toString('hex'));
  m.user.mockResolvedValue({ data: { user: { id: siteId } }, error: null });
  m.row.mockResolvedValue({ data: { path: p.path, before_hash: p.beforeHash, after_hash: p.afterHash, status: 'pending', expires_at: new Date(Date.now()+600000).toISOString() }, error: null });
  m.site.mockResolvedValue({ data: { status: 'active', environment: 'staging', scopes: ['files','code'] } });
  m.evidence.mockResolvedValue({ data: { valid_until: new Date(Date.now()+60000).toISOString(), source_encrypted: encryptSecret(JSON.stringify({ siteId, ...p }), key) }, error: null });
  m.session.mockResolvedValue({ auth: { getUser: m.user }, from: (table: string) => chain(table === 'restricted_file_reviews' ? m.row : m.site) });
  m.adminFrom.mockImplementation(() => chain(m.evidence)); m.admin.mockReturnValue({ from: m.adminFrom });
});
describe('owner-only source disclosure', () => {
  it('returns escaped-by-consumer source only for authorised fresh review', async () => { const r = await GET(request()); expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toBe('no-store'); expect(await r.json()).toMatchObject({ before: p.before, after: p.after, executionAllowed: false }); });
  it('does not access ciphertext for cross-owner or missing review', async () => { m.row.mockResolvedValue({ data: null, error: null }); expect((await GET(request())).status).toBe(404); expect(m.adminFrom).not.toHaveBeenCalled(); });
  it('requires sign in', async () => { m.user.mockResolvedValue({ data: { user: null }, error: null }); expect((await GET(request())).status).toBe(401); expect(m.adminFrom).not.toHaveBeenCalled(); });
  it('blocks stale evidence', async () => { m.evidence.mockResolvedValue({ data: { valid_until: new Date(0).toISOString() }, error: null }); expect((await GET(request())).status).toBe(409); });
  it('blocks revoked site', async () => { m.site.mockResolvedValue({ data: { status: 'revoked' } }); expect((await GET(request())).status).toBe(409); expect(m.adminFrom).not.toHaveBeenCalled(); });
  it('rejects ciphertext substitution', async () => { m.evidence.mockResolvedValue({ data: { valid_until: new Date(Date.now()+60000).toISOString(), source_encrypted: encryptSecret(JSON.stringify({ siteId: 'other-site', ...p }), key) }, error: null }); expect((await GET(request())).status).toBe(503); });
  it('does not leak decryption errors', async () => { m.evidence.mockResolvedValue({ data: { valid_until: new Date(Date.now()+60000).toISOString(), source_encrypted: 'broken' }, error: null }); const r = await GET(request()); expect(await r.json()).toEqual({ error: 'REVIEW_UNAVAILABLE' }); });
});

it('rejects malformed freshness before decrypting source', async () => { m.evidence.mockResolvedValue({ data: { valid_until: 'invalid' }, error: null }); expect((await GET(request())).status).toBe(409); });

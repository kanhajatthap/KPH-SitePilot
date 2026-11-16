import { describe, it, expect, vi } from 'vitest';
import { buildSignedHeaders, generateNonce } from '@wp-agent/connector-protocol';
import { ingestRestrictedReview } from '../src/lib/connector/restricted-ingestion';
import { encryptSecret, decryptSecret, hashToken } from '../src/lib/connector/crypto';
const siteId = '11111111-1111-4111-8111-111111111111'; const key = Buffer.alloc(32, 7); const secret = 's'.repeat(64); const now = 1800000000000;
const payload = { purpose: 'restricted-file-review-v1', protocol: 'restricted-files-v1', engineVersion: 1, proposalId: 'a'.repeat(32), path: 'themes/test/style.css', before: 'body {}', after: 'body {color:blue}', beforeHash: hashToken('body {}'), afterHash: hashToken('body {color:blue}'), currentHash: hashToken('body {}'), observedAt: now, expiresAt: now + 600000, environment: 'staging', operatorOptIn: true, canEdit: true, allowedPaths: ['themes/test/style.css'] };
function setup(p: unknown = payload, scopes = ['files', 'code'], signatureSecret = secret) {
  const rawBody = JSON.stringify(p); const nonce = generateNonce(); const used = new Set<string>();
  const input = { rawBody, headers: new Headers(buildSignedHeaders({ siteId, secret: signatureSecret, body: rawBody, nonce, nowSeconds: now / 1000 })), encryptionKey: key, nowSeconds: now / 1000, store: {
    findSiteById: async () => ({ id: siteId, project_id: siteId, url: 'https://example.test', name: 'fixture', status: 'active' as const, scopes, secret_encrypted: encryptSecret(secret, key) }),
    recordNonce: async (_id: string, n: string) => { if (used.has(n)) return false; used.add(n); return true; },
  } };
  return { input, save: vi.fn().mockResolvedValue(true) };
}
describe('signed review ingestion', () => {
  it('binds signed site and encrypts sources before persistence', async () => {
    const { input, save } = setup(); expect((await ingestRestrictedReview(input, save, now)).status).toBe(201);
    const stored = save.mock.calls[0][0]; expect(stored.p_site_id).toBe(siteId); expect(stored.p_source).not.toContain(payload.after);
    expect(JSON.parse(decryptSecret(stored.p_source, key))).toMatchObject({ siteId, ...payload });
  });
  it('rejects forgery before storage', async () => { const { input, save } = setup(payload, ['files','code'], 'wrong'.repeat(16)); expect((await ingestRestrictedReview(input, save, now)).status).toBe(401); expect(save).not.toHaveBeenCalled(); });
  it('rejects replay', async () => { const { input, save } = setup(); await ingestRestrictedReview(input, save, now); expect((await ingestRestrictedReview(input, save, now)).status).toBe(401); expect(save).toHaveBeenCalledTimes(1); });
  it('refuses missing scopes', async () => { const { input, save } = setup(payload, ['read']); expect((await ingestRestrictedReview(input, save, now)).status).toBe(403); expect(save).not.toHaveBeenCalled(); });
  it.each([{ purpose: 'heartbeat' }, { environment: 'production' }, { operatorOptIn: false }, { canEdit: false }, { engineVersion: 2 }, { protocol: 'old' }, { ownerId: siteId }, { path: '../wp-config.php' }, { observedAt: now - 60001 }, { observedAt: now + 1 }, { expiresAt: now }, { currentHash: 'd'.repeat(64) }, { allowedPaths: [] }, { after: 'altered' }])('fails closed for %j', async change => {
    const { input, save } = setup({ ...payload, ...change }); expect((await ingestRestrictedReview(input, save, now)).status).toBeGreaterThanOrEqual(400); expect(save).not.toHaveBeenCalled();
  });
  it('handles immutable proposal conflict', async () => { const { input, save } = setup(); save.mockResolvedValue(false); expect((await ingestRestrictedReview(input, save, now)).status).toBe(409); });
});

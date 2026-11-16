import { RestrictedFileIngestSchema } from '@wp-agent/contracts/experimental/restricted-editor';
import { authenticateConnectorRequest, type AuthenticateConnectorInput } from './auth';
import { encryptSecret, hashToken } from './crypto';

export async function ingestRestrictedReview(input: AuthenticateConnectorInput, save: (record: Record<string, unknown>) => Promise<boolean>, now = Date.now()) {
  const auth = await authenticateConnectorRequest(input);
  if (!auth.ok) return { status: auth.status, body: { error: auth.code } };
  if (!auth.site.scopes.includes('files') || !auth.site.scopes.includes('code')) return { status: 403, body: { error: 'SCOPE_DENIED' } };
  let payload: unknown;
  try { payload = JSON.parse(input.rawBody); } catch { return { status: 400, body: { error: 'INVALID_PROPOSAL' } }; }
  const parsed = RestrictedFileIngestSchema.safeParse(payload);
  if (!parsed.success) return { status: 400, body: { error: 'INVALID_PROPOSAL' } };
  const p = parsed.data;
  if (p.observedAt > now || now - p.observedAt > 60_000 || p.expiresAt <= now || p.expiresAt - p.observedAt > 600_000) return { status: 409, body: { error: 'STALE_PROPOSAL' } };
  if (!p.allowedPaths.includes(p.path) || p.currentHash !== p.beforeHash || hashToken(p.before) !== p.beforeHash || hashToken(p.after) !== p.afterHash) return { status: 409, body: { error: 'FILE_CHANGED' } };
  for (const source of [p.before, p.after]) {
    if (Buffer.byteLength(source, 'utf8') > 65536 || source.includes('\0') || /(?:password|api[_-]?key|client[_-]?secret|DB_(?:USER|PASSWORD|HOST)|BEGIN .*PRIVATE KEY)/i.test(source)) return { status: 400, body: { error: 'SOURCE_REFUSED' } };
  }
  // IDs/path/hashes inside ciphertext prevent encrypted source substitution.
  const encrypted = encryptSecret(JSON.stringify({ siteId: auth.site.id, ...p }), input.encryptionKey);
  const saved = await save({ p_site_id: auth.site.id, p_proposal_id: p.proposalId, p_path: p.path,
    p_before_hash: p.beforeHash, p_after_hash: p.afterHash, p_source: encrypted,
    p_observed_at: new Date(p.observedAt).toISOString(), p_expires_at: new Date(p.expiresAt).toISOString() });
  return saved ? { status: 201, body: { proposalId: p.proposalId, reviewPath: `/restricted-review?siteId=${auth.site.id}&proposalId=${p.proposalId}`, reviewOnly: true, executionAllowed: false } }
    : { status: 409, body: { error: 'PROPOSAL_UNAVAILABLE' } };
}

export async function boundedBody(req: Request, max: number): Promise<string> {
  const reader = req.body?.getReader(); if (!reader) throw new Error('INVALID_BODY');
  const decoder = new TextDecoder('utf-8', { fatal: true }); let size = 0; let text = '';
  try { while (true) { const c = await reader.read(); if (c.done) break;
    size += c.value.byteLength; if (size > max) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
    text += decoder.decode(c.value, { stream: true });
  } return text + decoder.decode(); } finally { reader.releaseLock(); }
}

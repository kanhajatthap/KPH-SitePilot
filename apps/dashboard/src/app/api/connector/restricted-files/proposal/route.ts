import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RestrictedFileIngestSchema } from '@wp-agent/contracts/experimental/restricted-editor';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';
import { createSupabaseAdminClient } from '../../../../../lib/supabase/admin';
import { decryptSecret, getEncryptionKey, hashToken } from '../../../../../lib/connector/crypto';
export const dynamic = 'force-dynamic';
const query = z.object({ siteId: z.string().uuid(), proposalId: z.string().length(32).regex(/^[a-f0-9]+$/) });
const json = (data: unknown, status: number) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(req: Request) {
  try {
    const q = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!q.success) return json({ error: 'INVALID_REQUEST' }, 400);
    const client = await createSupabaseServerClient(); if (!client) return json({ error: 'STORAGE_UNAVAILABLE' }, 503);
    const { data: auth, error } = await client.auth.getUser();
    if (error || !auth.user) return json({ error: 'UNAUTHORIZED' }, 401);
    const { siteId, proposalId } = q.data;
    const { data: row, error: rowError } = await client.from('restricted_file_reviews').select('*').eq('site_id', siteId).eq('proposal_id', proposalId).eq('owner_id', auth.user.id).maybeSingle();
    if (rowError) return json({ error: 'REVIEW_UNAVAILABLE' }, 503);
    if (!row) return json({ error: 'NOT_FOUND' }, 404);
    const { data: site } = await client.from('site_metadata').select('status,environment,scopes').eq('id', siteId).maybeSingle();
    if (!site || site.status !== 'active' || site.environment !== 'staging' || !['files','code'].every(s => site.scopes?.includes(s))) return json({ error: 'REVIEW_UNAVAILABLE' }, 409);
    const admin = createSupabaseAdminClient(); if (!admin) return json({ error: 'STORAGE_UNAVAILABLE' }, 503);
    const { data: evidence, error: evidenceError } = await admin.from('restricted_file_evidence').select('*').eq('site_id', siteId).eq('proposal_id', proposalId).maybeSingle();
    if (evidenceError) return json({ error: 'REVIEW_UNAVAILABLE' }, 503);
    if (!evidence || Date.parse(evidence.valid_until) <= Date.now() || row.status !== 'pending' || Date.parse(row.expires_at) <= Date.now()) return json({ error: 'STALE_OR_USED_PROPOSAL' }, 409);
    const raw = JSON.parse(decryptSecret(evidence.source_encrypted, getEncryptionKey()));
    const { siteId: boundSite, ...rest } = raw;
    const p = RestrictedFileIngestSchema.parse(rest);
    if (boundSite !== siteId || p.proposalId !== proposalId || p.path !== row.path || p.beforeHash !== row.before_hash || p.afterHash !== row.after_hash || hashToken(p.before) !== p.beforeHash || hashToken(p.after) !== p.afterHash) return json({ error: 'REVIEW_UNAVAILABLE' }, 503);
    return json({ siteId, proposalId, path: p.path, before: p.before, after: p.after,
      beforeHash: p.beforeHash, afterHash: p.afterHash, validUntil: evidence.valid_until,
      expiresAt: row.expires_at, risk: 'R3', executionAllowed: false }, 200);
  } catch { return json({ error: 'REVIEW_UNAVAILABLE' }, 503); }
}

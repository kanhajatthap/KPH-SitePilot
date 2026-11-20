import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';
export const dynamic = 'force-dynamic';
const Query = z.object({ siteId: z.string().uuid(), proposalId: z.string().length(32).regex(/^[a-f0-9]+$/) }).strict();
const json = (data: unknown, status: number) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
/** Source-free reconciliation, via session client and RLS. Never repeats a mutation. */
export async function GET(req: Request) {
  try {
    const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!q.success) return json({ error: 'INVALID_REQUEST' }, 400);
    const client = await createSupabaseServerClient(); if (!client) return json({ error: 'STORAGE_UNAVAILABLE' }, 503);
    const { data: auth, error } = await client.auth.getUser();
    if (error || !auth.user) return json({ error: 'UNAUTHORIZED' }, 401);
    const { data: row, error: readError } = await client.from('restricted_file_reviews')
      .select('status,expires_at').eq('site_id',q.data.siteId).eq('proposal_id',q.data.proposalId).eq('owner_id',auth.user.id).maybeSingle();
    if (readError) return json({ error: 'REVIEW_UNAVAILABLE' }, 503);
    if (!row) return json({ error: 'NOT_FOUND' }, 404);
    if (!['pending','consumed','revoked'].includes(row.status) || !Number.isFinite(Date.parse(row.expires_at))) return json({ error: 'REVIEW_UNAVAILABLE' },503);
    return json({ ...q.data, status:row.status, expired:Date.parse(row.expires_at) <= Date.now(), reviewOnly:true, executionAllowed:false },200);
  } catch { return json({ error:'REVIEW_UNAVAILABLE' },503); }
}

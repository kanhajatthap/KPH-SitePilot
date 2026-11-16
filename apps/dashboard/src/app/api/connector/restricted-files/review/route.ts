import { NextResponse } from 'next/server';
import { RestrictedFileApprovalSchema } from '@wp-agent/contracts/experimental/restricted-editor';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Metadata-only review receipt. Never calls the job queue or file engine. */
export async function POST(req: Request) {
  // Cookie-authenticated mutations require an explicit same-origin browser request.
  if (req.headers.get('origin') !== new URL(req.url).origin ||
      (req.headers.get('sec-fetch-site') && req.headers.get('sec-fetch-site') !== 'same-origin')) {
    return json({ error: 'FORBIDDEN' }, 403);
  }
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return json({ error: 'VALIDATION_FAILED' }, 400);
  }
  try {
    const client = await createSupabaseServerClient();
    if (!client) return json({ error: 'STORAGE_UNAVAILABLE' }, 503);
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return json({ error: 'UNAUTHORIZED' }, 401);

    // Bounded stream read rather than trusting Content-Length.
    const reader = req.body?.getReader();
    if (!reader) return json({ error: 'VALIDATION_FAILED' }, 400);
    let text = ''; let bytes = 0;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 2048) { await reader.cancel(); return json({ error: 'PAYLOAD_TOO_LARGE' }, 413); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { return json({ error: 'VALIDATION_FAILED' }, 400); }
    const parsed = RestrictedFileApprovalSchema.safeParse(payload);
    if (!parsed.success) return json({ error: 'VALIDATION_FAILED' }, 400);
    const p = parsed.data;
    // Session client, not service role: RPC uses auth.uid() and locks/checks live ownership.
    const { data, error } = await client.rpc('consume_restricted_file_review', {
      p_site_id: p.siteId, p_proposal_id: p.proposalId, p_confirmation: p.confirmation,
      p_before_hash: p.beforeHash, p_after_hash: p.afterHash,
    });
    if (error) return json({ error: 'REVIEW_UNAVAILABLE' }, 503);
    if (data !== true) return json({ error: 'REVIEW_NOT_CONSUMED' }, 409);
    return json({ status: 'review_recorded', reviewOnly: true, executionAllowed: false,
      executionCode: 'FILE_EDITOR_NOT_RELEASED' }, 200);
  } catch {
    return json({ error: 'REVIEW_UNAVAILABLE' }, 503);
  }
}

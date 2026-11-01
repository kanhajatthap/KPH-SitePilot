import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';
import { enqueueConnectorJob } from '../../../../lib/connector/store';
import { CONNECTOR_TOOL_ALLOWLIST } from '../../../../lib/connector/jobs';

export const dynamic = 'force-dynamic';

const EnqueueSchema = z.object({
  siteId: z.string().uuid(),
  tool: z.string().min(1).max(60).default('site.info'),
});

/**
 * POST /api/connector/jobs — enqueue a read-only job for one of *your* sites.
 *
 * This is the seed of the prompt-driven pipeline: today it can refresh the
 * capability manifest or run a health probe. Mutation tools arrive with the
 * plan/approval engine and will never be enqueued from this endpoint.
 */
export async function POST(req: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      {
        error: 'CONNECTOR_REQUIRES_ACCOUNT',
        message: 'Sign in to run jobs against a connected site.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', message: 'Request body must be JSON.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const parsed = EnqueueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', message: 'A valid siteId is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!CONNECTOR_TOOL_ALLOWLIST.has(parsed.data.tool)) {
    return NextResponse.json(
      { error: 'TOOL_NOT_ALLOWED', message: `Tool "${parsed.data.tool}" cannot be queued from the dashboard.` },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error: 'STORAGE_UNAVAILABLE',
        message: 'Connector storage is not configured for this deployment.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Ownership is enforced in SQL, not by trusting the request body.
  const { data: site, error } = await supabase
    .from('sites')
    .select('id, project_id, status, projects!inner(owner_id)')
    .eq('id', parsed.data.siteId)
    .maybeSingle();

  if (error || !site) {
    return NextResponse.json(
      { error: 'SITE_NOT_FOUND', message: 'No such site for your account.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const owner = (site as { projects?: { owner_id?: string } }).projects?.owner_id;
  if (owner !== auth.context.user.id) {
    return NextResponse.json(
      { error: 'SITE_NOT_FOUND', message: 'No such site for your account.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if ((site as { status?: string }).status !== 'active') {
    return NextResponse.json(
      { error: 'SITE_NOT_ACTIVE', message: 'This site is paused or revoked. Resume it first.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const jobId = await enqueueConnectorJob({
      projectId: (site as { project_id: string }).project_id,
      siteId: parsed.data.siteId,
      tool: parsed.data.tool,
      args: {},
      risk: 'R0',
    });

    return NextResponse.json(
      { status: 'queued', jobId, tool: parsed.data.tool },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (enqueueError) {
    return NextResponse.json(
      { error: 'ENQUEUE_FAILED', message: (enqueueError as Error).message },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

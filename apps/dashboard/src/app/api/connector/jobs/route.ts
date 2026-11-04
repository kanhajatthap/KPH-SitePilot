import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';
import { enqueueConnectorJob, siteBelongsToUser } from '../../../../lib/connector/store';
import { CONNECTOR_TOOL_ALLOWLIST, TOOL_RISK } from '../../../../lib/connector/jobs';

export const dynamic = 'force-dynamic';

const EnqueueSchema = z.object({
  siteId: z.string().uuid(),
  tool: z.string().min(1).max(60).default('site.info'),
});

/**
 * GET /api/connector/jobs?jobId=<uuid> — read status and result of a single
 * job owned by the signed-in caller.
 */
export async function GET(req: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to inspect jobs.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  if (!z.string().uuid().safeParse(jobId).success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', message: 'Provide a valid jobId query parameter.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'STORAGE_UNAVAILABLE', message: 'Connector storage is not configured.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, site_id, tool, status, risk, attempts, result, error, created_at, updated_at')
      .eq('id', jobId)
      .maybeSingle();

    if (error || !job) {
      return NextResponse.json(
        { error: 'JOB_NOT_FOUND', message: 'No such job for your account.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const owned = await siteBelongsToUser((job as { site_id: string }).site_id, auth.context.user.id);
    if (!owned) {
      return NextResponse.json(
        { error: 'JOB_NOT_FOUND', message: 'No such job for your account.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'JOB_LOAD_FAILED', message: 'The operation could not be confirmed. Check Activity before trying again.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

/**
 * POST /api/connector/jobs — enqueue a read-only (`R0`) job for one of *your* sites.
 *
 * Any mutation tool (`R1`/`R2`/`R3`) is rejected here with `403 WRITE_REQUIRES_PLAN`:
 * writes must always pass through `POST /api/connector/plans` and explicit approval.
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

  if (TOOL_RISK[parsed.data.tool] !== 'R0') {
    return NextResponse.json(
      {
        error: 'WRITE_REQUIRES_PLAN',
        message: `Tool "${parsed.data.tool}" modifies WordPress state and requires an approved plan.`,
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
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
  } catch {
    return NextResponse.json(
      { error: 'ENQUEUE_FAILED', message: 'Job submission could not be confirmed. Check Activity before submitting another job.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

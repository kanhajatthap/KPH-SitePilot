import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../../../lib/auth/api';
import { createSupabaseAdminClient } from '../../../../../../lib/supabase/admin';
import {
  enqueueConnectorJob,
  getSnapshot,
  markSnapshotRestored,
  siteBelongsToUser,
} from '../../../../../../lib/connector/store';
import { resolveUndoJob } from '../../../../../../lib/connector/undo';

export const dynamic = 'force-dynamic';

/**
 * POST /api/connector/snapshots/{id}/undo
 *
 * One click, one job: restores the exact pre-write fields captured before the
 * change (`content.restore` for posts/pages/blocks, `settings.restore` for
 * allowlisted options). Undo is itself recorded as a job, so it shows up in
 * history and can be inspected like any other write.
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to undo a change.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { id } = await context.params;

  const snapshot = await getSnapshot(id);
  if (!snapshot || !(await siteBelongsToUser(snapshot.site_id, auth.context.user.id))) {
    return NextResponse.json(
      { error: 'SNAPSHOT_NOT_FOUND', message: 'No such snapshot.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (snapshot.restored_at) {
    return NextResponse.json(
      { error: 'ALREADY_RESTORED', message: 'This change was already undone.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const resolved = resolveUndoJob({
    resource: snapshot.resource,
    before: snapshot.before,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.code, message: resolved.message },
      { status: 422, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Storage unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const jobId = await enqueueConnectorJob({
      projectId: snapshot.project_id,
      siteId: snapshot.site_id,
      tool: resolved.tool,
      args: resolved.args,
      risk: resolved.risk,
      idempotencyKey: `undo:${snapshot.id}`,
    });

    await markSnapshotRestored(snapshot.id, jobId);

    return NextResponse.json(
      { status: 'queued', jobId, tool: resolved.tool, resource: snapshot.resource },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'UNDO_FAILED', message: (error as Error).message },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../../../lib/auth/api';
import { createSupabaseAdminClient } from '../../../../../../lib/supabase/admin';
import {
  enqueueConnectorJob,
  getSnapshot,
  markSnapshotRestored,
  siteBelongsToUser,
} from '../../../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

/**
 * POST /api/connector/snapshots/{id}/undo
 *
 * One click, one job: restores the exact pre-write fields captured before the
 * change. Undo is itself recorded as a job, so it shows up in history and can be
 * inspected like any other write.
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

  const before = snapshot.before ?? null;
  if (!before || typeof before !== 'object' || !('id' in before)) {
    return NextResponse.json(
      { error: 'SNAPSHOT_UNUSABLE', message: 'This snapshot does not carry restorable fields.' },
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
      tool: 'content.restore',
      args: { before },
      risk: 'R1',
      idempotencyKey: `undo:${snapshot.id}`,
    });

    await markSnapshotRestored(snapshot.id, jobId);

    return NextResponse.json(
      { status: 'queued', jobId, resource: snapshot.resource },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'UNDO_FAILED', message: (error as Error).message },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

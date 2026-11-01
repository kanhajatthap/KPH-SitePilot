import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../../../lib/auth/api';
import { startPlan } from '../../../../../../lib/connector/plans';
import { createSupabasePlanStore, siteBelongsToUser } from '../../../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

/**
 * POST /api/connector/plans/{id}/execute
 *
 * Requires a matching approval. Queues step 0 only: the next step is queued by
 * the result handler once the previous one is verified on the site, which keeps
 * a multi-step change from half-applying out of order.
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to run a plan.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { id } = await context.params;

  const store = createSupabasePlanStore();
  if (!store) {
    return NextResponse.json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Storage unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const plan = await store.getPlan(id);
  if (!plan || !(await siteBelongsToUser(plan.site_id, auth.context.user.id))) {
    return NextResponse.json(
      { error: 'PLAN_NOT_FOUND', message: 'No such plan.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const started = await startPlan({ planId: id }, { store });
  if (!started.ok) {
    return NextResponse.json(
      { error: started.code, message: started.message },
      { status: started.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { status: 'queued', planId: id, jobId: started.jobId, steps: plan.steps.length },
    { status: 202, headers: { 'Cache-Control': 'no-store' } }
  );
}

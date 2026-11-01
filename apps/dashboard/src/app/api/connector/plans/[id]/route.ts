import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../../lib/auth/api';
import { createSupabaseAdminClient } from '../../../../../lib/supabase/admin';
import { createSupabasePlanStore, siteBelongsToUser } from '../../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

/** GET /api/connector/plans/{id} — plan, its approval and per-step job progress. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to see this plan.' },
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

  const supabase = createSupabaseAdminClient();
  const jobs = supabase
    ? (
        await supabase
          .from('jobs')
          .select('id, tool, status, attempts, risk, result, error, created_at, updated_at')
          .eq('plan_id', plan.id)
          .order('created_at', { ascending: true })
      ).data ?? []
    : [];

  const snapshots = supabase
    ? (
        await supabase
          .from('snapshots')
          .select('id, resource, before, created_at, restored_at')
          .eq('site_id', plan.site_id)
          .order('created_at', { ascending: false })
          .limit(10)
      ).data ?? []
    : [];

  return NextResponse.json(
    {
      plan: {
        id: plan.id,
        summary: plan.summary,
        risk: plan.risk,
        status: plan.status,
        hash: plan.hash,
        steps: plan.steps,
        createdAt: plan.created_at,
      },
      jobs,
      snapshots,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

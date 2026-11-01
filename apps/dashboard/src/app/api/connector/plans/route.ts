import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { planFromPrompt } from '../../../../lib/connector/planner';
import { createPlan } from '../../../../lib/connector/plans';
import {
  createSupabasePlanStore,
  getSiteContext,
  siteBelongsToUser,
} from '../../../../lib/connector/store';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

const CreatePlanSchema = z.object({
  siteId: z.string().uuid(),
  prompt: z.string().min(4).max(4000),
});

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/connector/plans — turn a prompt into a reviewable plan.
 *
 * Nothing is written to WordPress here: a plan is a proposal with a hash the
 * user approves. Execution is a separate, explicit call.
 */
export async function POST(req: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json({ error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to create a plan.' }, 400);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'VALIDATION_FAILED', message: 'Request body must be JSON.' }, 400);
  }

  const parsed = CreatePlanSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'VALIDATION_FAILED', message: 'A siteId and prompt are required.' }, 400);
  }

  if (!(await siteBelongsToUser(parsed.data.siteId, auth.context.user.id))) {
    return json({ error: 'SITE_NOT_FOUND', message: 'No such site for your account.' }, 404);
  }

  const site = await getSiteContext(parsed.data.siteId);
  if (!site || site.status !== 'active') {
    return json({ error: 'SITE_NOT_ACTIVE', message: 'This site is paused or revoked.' }, 409);
  }

  const planned = planFromPrompt(parsed.data.prompt);
  if (!planned.ok) {
    return json({ error: 'PLAN_NOT_UNDERSTOOD', message: planned.reason }, 422);
  }

  const store = createSupabasePlanStore();
  if (!store) {
    return json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Connector storage is not configured.' },
      503
    );
  }

  const created = await createPlan(
    {
      projectId: site.projectId,
      siteId: site.id,
      createdBy: auth.context.user.id,
      prompt: parsed.data.prompt,
      summary: planned.summary,
      steps: planned.steps,
      risk: planned.risk,
    },
    { store }
  );

  if (!created.ok) return json({ error: created.code, message: created.message }, created.status);

  return json(
    {
      plan: {
        id: created.plan.id,
        summary: created.plan.summary,
        risk: created.plan.risk,
        status: created.plan.status,
        hash: created.plan.hash,
        steps: created.plan.steps,
      },
      next: 'Review the steps, then approve the plan. Nothing has been written yet.',
    },
    201
  );
}

/** GET /api/connector/plans?siteId=… — plan history for one site. */
export async function GET(req: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json({ error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to see plans.' }, 400);
  }

  const siteId = new URL(req.url).searchParams.get('siteId');
  if (!siteId) return json({ error: 'VALIDATION_FAILED', message: 'siteId is required.' }, 400);
  if (!(await siteBelongsToUser(siteId, auth.context.user.id))) {
    return json({ error: 'SITE_NOT_FOUND', message: 'No such site for your account.' }, 404);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return json({ error: 'STORAGE_UNAVAILABLE', message: 'Storage unavailable.' }, 503);

  const { data, error } = await supabase
    .from('plans')
    .select('id, summary, risk, status, steps, created_at')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return json({ error: 'PLAN_LIST_FAILED', message: error.message }, 503);
  return json({ plans: data ?? [] }, 200);
}

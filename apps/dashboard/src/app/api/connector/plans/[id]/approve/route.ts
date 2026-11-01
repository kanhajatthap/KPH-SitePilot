import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '../../../../../../lib/auth/api';
import { approvePlan } from '../../../../../../lib/connector/plans';
import { createSupabasePlanStore, siteBelongsToUser } from '../../../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

const ApproveSchema = z.object({ confirmation: z.string().max(40).optional() });

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/connector/plans/{id}/approve
 *
 * Records the human decision. The stored hash must still match the plan, so an
 * approval can never be recycled for different steps. R3 plans require the user
 * to type the first eight characters of the plan id.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json({ error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to approve a plan.' }, 400);
  }

  const { id } = await context.params;

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const parsed = ApproveSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'VALIDATION_FAILED', message: 'Invalid approval payload.' }, 400);
  }

  const store = createSupabasePlanStore();
  if (!store) return json({ error: 'STORAGE_UNAVAILABLE', message: 'Storage unavailable.' }, 503);

  const plan = await store.getPlan(id);
  if (!plan) return json({ error: 'PLAN_NOT_FOUND', message: 'No such plan.' }, 404);
  if (!(await siteBelongsToUser(plan.site_id, auth.context.user.id))) {
    return json({ error: 'PLAN_NOT_FOUND', message: 'No such plan.' }, 404);
  }

  const approved = await approvePlan(
    { planId: id, approvedBy: auth.context.user.id, confirmation: parsed.data.confirmation },
    { store }
  );

  if (!approved.ok) return json({ error: approved.code, message: approved.message }, approved.status);

  return json(
    {
      status: 'approved',
      planId: id,
      planHash: approved.approval.plan_hash,
      risk: plan.risk,
      next: 'Run the plan when you are ready. Each step is a separate signed job.',
    },
    200
  );
}

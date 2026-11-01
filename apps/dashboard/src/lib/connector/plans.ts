import { createHash } from 'node:crypto';
import type { PlanStep, Risk } from './planner';

/**
 * Plan → approval → execution.
 *
 * Rules encoded here:
 *   - a plan is immutable once created: approval stores the hash it approved;
 *   - executing requires an approval whose hash still matches the plan;
 *   - R3 needs a typed confirmation containing the plan id prefix;
 *   - steps run **one at a time**, each with its own job, so progress and
 *     failures are attributable and the next step only starts after the last
 *     one is verified.
 */

export type PlanStatus = 'proposed' | 'approved' | 'rejected' | 'applied' | 'failed' | 'rolled_back';

export interface PlanRow {
  id: string;
  project_id: string;
  site_id: string;
  prompt: string;
  summary: string;
  steps: PlanStep[];
  risk: Risk;
  status: PlanStatus;
  hash: string;
  created_by: string;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  plan_id: string;
  approved_by: string;
  plan_hash: string;
  created_at: string;
}

export interface PlanStore {
  insertPlan(row: Omit<PlanRow, 'id' | 'created_at'>): Promise<PlanRow>;
  getPlan(planId: string): Promise<PlanRow | null>;
  insertApproval(input: { planId: string; approvedBy: string; planHash: string }): Promise<ApprovalRow>;
  getApproval(planId: string): Promise<ApprovalRow | null>;
  setPlanStatus(planId: string, status: PlanStatus): Promise<void>;
  enqueueJob(input: {
    projectId: string;
    siteId: string;
    planId: string;
    approvalId: string | null;
    tool: string;
    args: Record<string, unknown>;
    risk: Risk;
    idempotencyKey: string;
  }): Promise<string | null>;
  markJobSuperseded?(jobId: string): Promise<void>;
}

export function hashPlan(input: { siteId: string; steps: PlanStep[] }): string {
  return createHash('sha256')
    .update(JSON.stringify({ siteId: input.siteId, steps: input.steps }), 'utf8')
    .digest('hex');
}

export type PlanFailure = { ok: false; status: number; code: string; message: string };

export interface CreatePlanInput {
  projectId: string;
  siteId: string;
  createdBy: string;
  prompt: string;
  summary: string;
  steps: PlanStep[];
  risk: Risk;
}

export async function createPlan(
  input: CreatePlanInput,
  deps: { store: PlanStore }
): Promise<{ ok: true; plan: PlanRow } | PlanFailure> {
  const hash = hashPlan({ siteId: input.siteId, steps: input.steps });

  try {
    const plan = await deps.store.insertPlan({
      project_id: input.projectId,
      site_id: input.siteId,
      prompt: input.prompt,
      summary: input.summary,
      steps: input.steps,
      risk: input.risk,
      status: 'proposed',
      hash,
      created_by: input.createdBy,
    });

    return { ok: true, plan };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: 'PLAN_STORAGE_UNAVAILABLE',
      message: (error as Error).message,
    };
  }
}

export interface ApprovePlanInput {
  planId: string;
  approvedBy: string;
  /** Required for R3 plans: must contain the first 8 characters of the plan id. */
  confirmation?: string;
}

export async function approvePlan(
  input: ApprovePlanInput,
  deps: { store: PlanStore }
): Promise<{ ok: true; approval: ApprovalRow; plan: PlanRow } | PlanFailure> {
  const plan = await deps.store.getPlan(input.planId).catch(() => null);
  if (!plan) {
    return { ok: false, status: 404, code: 'PLAN_NOT_FOUND', message: 'No such plan.' };
  }

  if (plan.status !== 'proposed') {
    return {
      ok: false,
      status: 409,
      code: 'PLAN_NOT_PROPOSED',
      message: `This plan is already ${plan.status}.`,
    };
  }

  // The hash is recomputed from the stored steps: if anything changed between
  // proposal and approval, the user is not approving what they saw.
  const expectedHash = hashPlan({ siteId: plan.site_id, steps: plan.steps });
  if (expectedHash !== plan.hash) {
    return {
      ok: false,
      status: 409,
      code: 'PLAN_CHANGED',
      message: 'The plan changed after it was shown. Re-create it and review again.',
    };
  }

  if (plan.risk === 'R3') {
    const token = input.confirmation?.trim().toUpperCase() ?? '';
    const required = plan.id.slice(0, 8).toUpperCase();
    if (token !== required) {
      return {
        ok: false,
        status: 400,
        code: 'CONFIRMATION_REQUIRED',
        message: `Type ${required} to approve this high-risk plan.`,
      };
    }
  }

  try {
    const approval = await deps.store.insertApproval({
      planId: plan.id,
      approvedBy: input.approvedBy,
      planHash: plan.hash,
    });
    await deps.store.setPlanStatus(plan.id, 'approved');

    return { ok: true, approval, plan: { ...plan, status: 'approved' } };
  } catch (error) {
    return { ok: false, status: 503, code: 'APPROVAL_FAILED', message: (error as Error).message };
  }
}

export async function startPlan(
  input: { planId: string },
  deps: { store: PlanStore }
): Promise<{ ok: true; jobId: string | null; plan: PlanRow } | PlanFailure> {
  const plan = await deps.store.getPlan(input.planId).catch(() => null);
  if (!plan) {
    return { ok: false, status: 404, code: 'PLAN_NOT_FOUND', message: 'No such plan.' };
  }

  const approval = await deps.store.getApproval(plan.id).catch(() => null);
  if (!approval || approval.plan_hash !== plan.hash) {
    return {
      ok: false,
      status: 409,
      code: 'APPROVAL_REQUIRED',
      message: 'This plan has no matching approval. Approve it before running it.',
    };
  }

  if (plan.status !== 'approved') {
    return { ok: false, status: 409, code: 'PLAN_NOT_APPROVED', message: `This plan is ${plan.status}.` };
  }

  const first = plan.steps[0];
  if (!first) {
    return { ok: false, status: 400, code: 'PLAN_EMPTY', message: 'This plan has no steps.' };
  }

  const jobId = await deps.store.enqueueJob({
    projectId: plan.project_id,
    siteId: plan.site_id,
    planId: plan.id,
    approvalId: approval.id,
    tool: first.tool,
    args: { ...first.args, stepIndex: 0 },
    risk: first.risk,
    idempotencyKey: `plan:${plan.id}:step:0`,
  });

  return { ok: true, jobId, plan };
}

/**
 * Called after a plan job finishes: queues the next verified step, or closes
 * the plan out.
 */
export async function advancePlan(
  input: { planId: string; stepIndex: number; succeeded: boolean },
  deps: { store: PlanStore }
): Promise<{ nextJobId: string | null; planStatus: PlanStatus | null }> {
  const plan = await deps.store.getPlan(input.planId).catch(() => null);
  if (!plan) return { nextJobId: null, planStatus: null };

  if (!input.succeeded) {
    await deps.store.setPlanStatus(plan.id, 'failed');
    return { nextJobId: null, planStatus: 'failed' };
  }

  const nextIndex = input.stepIndex + 1;
  const next = plan.steps[nextIndex];

  if (!next) {
    await deps.store.setPlanStatus(plan.id, 'applied');
    return { nextJobId: null, planStatus: 'applied' };
  }

  const approval = await deps.store.getApproval(plan.id).catch(() => null);

  const nextJobId = await deps.store.enqueueJob({
    projectId: plan.project_id,
    siteId: plan.site_id,
    planId: plan.id,
    approvalId: approval?.id ?? null,
    tool: next.tool,
    args: { ...next.args, stepIndex: nextIndex },
    risk: next.risk,
    idempotencyKey: `plan:${plan.id}:step:${nextIndex}`,
  });

  return { nextJobId, planStatus: 'approved' };
}

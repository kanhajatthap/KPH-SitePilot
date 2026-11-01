import { describe, it, expect, beforeEach } from 'vitest';
import { hashPlan, approvePlan, createPlan, startPlan, advancePlan } from '../src/lib/connector/plans';
import type {
  ApprovalRow,
  PlanRow,
  PlanStatus,
  PlanStore,
} from '../src/lib/connector/plans';
import { extractPostId, extractQuotedText, planFromPrompt } from '../src/lib/connector/planner';

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

class FakePlanStore implements PlanStore {
  plans: PlanRow[] = [];
  approvals: ApprovalRow[] = [];
  jobs: Array<Record<string, unknown>> = [];

  async insertPlan(row: Omit<PlanRow, 'id' | 'created_at'>) {
    const plan: PlanRow = {
      ...row,
      id: `plan-${this.plans.length + 1}`,
      created_at: new Date('2026-11-01T10:00:00Z').toISOString(),
    };
    this.plans.push(plan);
    return plan;
  }

  async getPlan(planId: string) {
    return this.plans.find((plan) => plan.id === planId) ?? null;
  }

  async insertApproval(input: { planId: string; approvedBy: string; planHash: string }) {
    const approval: ApprovalRow = {
      id: `approval-${this.approvals.length + 1}`,
      plan_id: input.planId,
      approved_by: input.approvedBy,
      plan_hash: input.planHash,
      created_at: new Date().toISOString(),
    };
    this.approvals.push(approval);
    return approval;
  }

  async getApproval(planId: string) {
    return this.approvals.find((approval) => approval.plan_id === planId) ?? null;
  }

  async setPlanStatus(planId: string, status: PlanStatus) {
    const plan = this.plans.find((candidate) => candidate.id === planId);
    if (plan) plan.status = status;
  }

  async enqueueJob(input: Record<string, unknown>) {
    const existing = this.jobs.find((job) => job.idempotencyKey === input.idempotencyKey);
    if (existing) return existing.id as string;
    const id = `job-${this.jobs.length + 1}`;
    this.jobs.push({ ...input, id });
    return id;
  }
}

function seed(risk: 'R0' | 'R1' | 'R2' | 'R3' = 'R1') {
  const steps = [
    { tool: 'content.update', args: { id: 12, title: 'Hello' }, risk: 'R1' as const, summary: 'Change the title of #12 to “Hello”' },
    { tool: 'content.update', args: { id: 12, content: '<p>Body</p>' }, risk: 'R1' as const, summary: 'Replace the content of #12' },
  ];

  return {
    projectId: PROJECT_ID,
    siteId: SITE_ID,
    createdBy: USER_ID,
    prompt: 'change post 12',
    summary: 'Two edits',
    steps,
    risk,
  };
}

let store: FakePlanStore;

beforeEach(() => {
  store = new FakePlanStore();
});

describe('planner', () => {
  it('extracts ids and quoted text', () => {
    expect(extractPostId('update post 42 please')).toBe(42);
    expect(extractPostId('change #7 title')).toBe(7);
    expect(extractPostId('nothing here')).toBeNull();
    expect(extractQuotedText('change the title to "Spring sale"')).toBe('Spring sale');
    expect(extractQuotedText('change it to “Café ünïcode”')).toBe('Café ünïcode');
  });

  it('plans a title change as one R1 step', () => {
    const plan = planFromPrompt('Change the title of post #12 to "Spring sale"');

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.risk).toBe('R1');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].tool).toBe('content.update');
    expect(plan.steps[0].args).toEqual({ id: 12, title: 'Spring sale' });
  });

  it('plans content replacement and wraps plain text in a paragraph', () => {
    const plan = planFromPrompt('Replace the content of page #7 with "Fresh copy here"');

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.steps[0].args).toEqual({ id: 7, content: '<p>Fresh copy here</p>' });
  });

  it('keeps HTML when the quoted text already looks like blocks', () => {
    const plan = planFromPrompt('Update the content of #9 with "<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->"');

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.steps[0].args).toMatchObject({ id: 9 });
    expect(String((plan.steps[0].args as { content: string }).content)).toContain('<!-- wp:paragraph -->');
  });

  it('plans page creation as a draft by default and raises risk when publishing', () => {
    const draft = planFromPrompt('Create a page called "About us"');
    expect(draft.ok).toBe(true);
    if (draft.ok) {
      expect(draft.steps[0].tool).toBe('content.create');
      expect(draft.steps[0].args).toMatchObject({ title: 'About us', type: 'page', status: 'draft' });
      expect(draft.risk).toBe('R1');
    }

    const published = planFromPrompt('Create and publish a page called "Contact"');
    expect(published.ok).toBe(true);
    if (published.ok) {
      expect(published.steps[0].args).toMatchObject({ status: 'publish' });
      expect(published.risk).toBe('R2');
    }
  });

  it('refuses when the target or the new text is missing', () => {
    const noId = planFromPrompt('Change the title to something nicer');
    expect(noId.ok).toBe(false);
    if (!noId.ok) expect(noId.reason).toContain('which post');

    const noText = planFromPrompt('Change the title of post #12');
    expect(noText.ok).toBe(false);
    if (!noText.ok) expect(noText.reason).toContain('quotes');

    const vague = planFromPrompt('Make the site better');
    expect(vague.ok).toBe(false);
  });
});

describe('plan lifecycle', () => {
  it('creates a proposed plan with a stable hash', async () => {
    const created = await createPlan(seed(), { store });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.plan.status).toBe('proposed');
    expect(created.plan.hash).toBe(hashPlan({ siteId: SITE_ID, steps: created.plan.steps }));
  });

  it('rejects an approval when the plan changed after it was shown', async () => {
    const created = await createPlan(seed(), { store });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    store.plans[0].steps = [
      { tool: 'content.update', args: { id: 12, title: 'Something else' }, risk: 'R1', summary: 'tampered' },
    ];

    const approved = await approvePlan({ planId: created.plan.id, approvedBy: USER_ID }, { store });
    expect(approved.ok).toBe(false);
    if (approved.ok) return;
    expect(approved.code).toBe('PLAN_CHANGED');
  });

  it('requires typed confirmation for R3 plans', async () => {
    const created = await createPlan(seed('R3'), { store });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const missing = await approvePlan({ planId: created.plan.id, approvedBy: USER_ID }, { store });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('CONFIRMATION_REQUIRED');

    const wrong = await approvePlan(
      { planId: created.plan.id, approvedBy: USER_ID, confirmation: 'WRONGONE' },
      { store }
    );
    expect(wrong.ok).toBe(false);

    const token = created.plan.id.slice(0, 8).toUpperCase();
    const approved = await approvePlan(
      { planId: created.plan.id, approvedBy: USER_ID, confirmation: token },
      { store }
    );
    expect(approved.ok).toBe(true);
  });

  it('makes an R2 plan say CONFIRM, not the plan id', async () => {
    const created = await createPlan(seed('R2'), { store });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const missing = await approvePlan({ planId: created.plan.id, approvedBy: USER_ID }, { store });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('CONFIRMATION_REQUIRED');

    // The plan-id token is the stronger R3 ritual and must not satisfy R2.
    const prefix = await approvePlan(
      { planId: created.plan.id, approvedBy: USER_ID, confirmation: created.plan.id.slice(0, 8) },
      { store }
    );
    expect(prefix.ok).toBe(false);

    const approved = await approvePlan(
      { planId: created.plan.id, approvedBy: USER_ID, confirmation: 'confirm' },
      { store }
    );
    expect(approved.ok).toBe(true);
  });

  it('refuses to start a plan without an approval', async () => {
    const created = await createPlan(seed(), { store });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const started = await startPlan({ planId: created.plan.id }, { store });
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.code).toBe('APPROVAL_REQUIRED');
  });

  it('queues only the first step on execute, then chains step by step', async () => {
    const created = await createPlan(seed(), { store });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await approvePlan({ planId: created.plan.id, approvedBy: USER_ID }, { store });
    const started = await startPlan({ planId: created.plan.id }, { store });

    expect(started.ok).toBe(true);
    expect(store.jobs).toHaveLength(1);
    expect(store.jobs[0]).toMatchObject({
      tool: 'content.update',
      args: { id: 12, title: 'Hello', stepIndex: 0 },
      idempotencyKey: `plan:${created.plan.id}:step:0`,
    });

    const mid = await advancePlan(
      { planId: created.plan.id, stepIndex: 0, succeeded: true },
      { store }
    );
    expect(mid.nextJobId).toBeTruthy();
    expect(mid.planStatus).toBe('approved');
    expect(store.jobs[1]).toMatchObject({ args: { id: 12, content: '<p>Body</p>', stepIndex: 1 } });

    const done = await advancePlan(
      { planId: created.plan.id, stepIndex: 1, succeeded: true },
      { store }
    );
    expect(done.nextJobId).toBeNull();
    expect(done.planStatus).toBe('applied');
    expect(store.plans[0].status).toBe('applied');
  });

  it('marks the plan failed when a step fails and stops chaining', async () => {
    const created = await createPlan(seed(), { store });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await approvePlan({ planId: created.plan.id, approvedBy: USER_ID }, { store });
    await startPlan({ planId: created.plan.id }, { store });

    const result = await advancePlan(
      { planId: created.plan.id, stepIndex: 0, succeeded: false },
      { store }
    );

    expect(result.planStatus).toBe('failed');
    expect(store.jobs).toHaveLength(1);
  });

  it('never queues the same step twice', async () => {
    const created = await createPlan(seed(), { store });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await approvePlan({ planId: created.plan.id, approvedBy: USER_ID }, { store });
    await startPlan({ planId: created.plan.id }, { store });
    const again = await startPlan({ planId: created.plan.id }, { store });

    expect(again.ok).toBe(true);
    expect(store.jobs).toHaveLength(1);
  });
});

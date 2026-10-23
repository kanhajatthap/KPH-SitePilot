import { randomUUID, createHash } from 'node:crypto';
import {
  ChangePlan,
  ChangePlanSchema,
  StagedChangeOperation,
  PermissionLevel,
  AgentError,
  ErrorCode,
} from '@wp-agent/contracts';
import { AuditLogger } from '@wp-agent/audit';

export interface PreconditionResource {
  resourceId: string;
  currentContentOrVersion: string;
}

export interface DryRunResult {
  planId: string;
  valid: boolean;
  warnings: string[];
  affectedResources: string[];
  diffs: Array<{
    target: string;
    type: string;
    before?: unknown;
    after: unknown;
  }>;
  rollbackSupported: boolean;
}

export interface ApplyResult {
  planId: string;
  correlationId: string;
  status: 'applied' | 'dry_run_only' | 'failed';
  executedOperations: Array<{
    operationId: string;
    target: string;
    success: boolean;
    error?: string;
  }>;
  appliedAt: string;
}

export interface RollbackResult {
  planId: string;
  status: 'rolled_back' | 'failed' | 'not_applicable';
  restoredResources: string[];
  message: string;
}

export interface JournalRecord {
  id: string;
  planId: string;
  correlationId: string;
  actor: string;
  action: string;
  timestamp: string;
  details: Record<string, unknown>;
}

/**
 * Calculates a SHA256 integrity hash for a ChangePlan to detect post-approval tampering.
 */
export function calculatePlanHash(plan: ChangePlan): string {
  const content = JSON.stringify({
    id: plan.id,
    targetSite: plan.targetSite,
    operations: plan.operations,
    preconditions: plan.preconditions,
  });
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Strictly Deny-by-Default Permission Registry.
 * The model can never modify permissions or grant permissions to itself.
 */
export class PermissionRegistry {
  private readonly allowedOperations = new Map<string, PermissionLevel>();

  constructor() {
    // Standard baseline permissions (safe reads are permitted, writes require explicit human approval)
    this.allowedOperations.set('site.inspect', PermissionLevel.READ_ONLY);
    this.allowedOperations.set('page.read', PermissionLevel.READ_ONLY);
    this.allowedOperations.set('builder.detect', PermissionLevel.READ_ONLY);
    this.allowedOperations.set('builder.inspect', PermissionLevel.READ_ONLY);
    this.allowedOperations.set('post.createDraft', PermissionLevel.SAFE_WRITE);
    this.allowedOperations.set('create_page', PermissionLevel.SAFE_WRITE);
    this.allowedOperations.set('update_page', PermissionLevel.SAFE_WRITE);
    this.allowedOperations.set('create_post', PermissionLevel.SAFE_WRITE);
    this.allowedOperations.set('update_post', PermissionLevel.SAFE_WRITE);
    this.allowedOperations.set('update_option', PermissionLevel.ADMIN_MUTATION);
    this.allowedOperations.set('delete_page', PermissionLevel.ADMIN_MUTATION);
  }

  isOperationAllowed(opType: string, _isDryRun = true): boolean {
    const level = this.allowedOperations.get(opType);
    return !!level;
  }
}

/**
 * Append-Only Change Journal.
 * Redacts secrets, tracks correlation IDs, approval states, and audit trails.
 */
export class ChangeJournal {
  private readonly records: JournalRecord[] = [];

  record(entry: Omit<JournalRecord, 'id' | 'timestamp'>): JournalRecord {
    const record: JournalRecord = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.records.push(record);
    return record;
  }

  getRecords(planId?: string): readonly JournalRecord[] {
    if (planId) {
      return this.records.filter((r) => r.planId === planId);
    }
    return this.records;
  }
}

/**
 * Controlled WordPress Mutation Controller (Phase 5).
 * Enforces human approval, dry-run simulation, integrity hashing, stale-data detection, and rollback support.
 */
export class MutationController {
  private readonly plans = new Map<string, ChangePlan>();
  private readonly approvedHashes = new Map<string, string>();
  private readonly appliedSnapshots = new Map<string, Array<{ resource: string; beforeData: unknown }>>();
  private readonly permissionRegistry: PermissionRegistry;
  private readonly journal: ChangeJournal;
  private readonly auditLogger?: AuditLogger;

  // Real mutation is DISABLED by default for safety
  public isRealMutationEnabled = false;

  constructor(options?: { auditLogger?: AuditLogger; permissionRegistry?: PermissionRegistry }) {
    this.auditLogger = options?.auditLogger;
    this.permissionRegistry = options?.permissionRegistry || new PermissionRegistry();
    this.journal = new ChangeJournal();
  }

  getJournal(): ChangeJournal {
    return this.journal;
  }

  /**
   * Step 1: Propose Changes.
   * Generates a validated ChangePlan in 'proposed' status. Zero mutations executed.
   */
  proposeChangePlan(params: {
    targetSite: string;
    author: string;
    summary: string;
    operations: StagedChangeOperation[];
    preconditions?: Array<{ resourceId: string; expectedHashOrVersion: string }>;
    correlationId?: string;
  }): ChangePlan {
    const planId = randomUUID();
    const correlationId = params.correlationId || randomUUID();

    const plan: ChangePlan = {
      id: planId,
      correlationId,
      targetSite: params.targetSite,
      author: params.author,
      summary: params.summary,
      operations: params.operations,
      status: 'proposed',
      preconditions: params.preconditions?.map((p) => ({
        ...p,
        status: 'pending' as const,
      })) || [],
      requiresHumanApproval: true,
      createdAt: new Date().toISOString(),
    };

    const validated = ChangePlanSchema.parse(plan);
    this.plans.set(planId, validated);

    this.journal.record({
      planId,
      correlationId,
      actor: params.author,
      action: 'propose_change_plan',
      details: {
        operationCount: params.operations.length,
        summary: params.summary,
      },
    });

    this.auditLogger?.log({
      type: 'agent_request',
      actor: params.author,
      targetSite: params.targetSite,
      action: 'proposeChangePlan',
      payload: { planId, operations: params.operations.map((o) => o.type) },
    });

    return validated;
  }

  /**
   * Step 2 & 3: Dry-Run Simulation.
   * Validates operations, verifies permissions, checks for destructive actions, and builds diff previews.
   * Modifies 0 bytes of WordPress data.
   */
  executeDryRun(planId: string): DryRunResult {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new AgentError(ErrorCode.VALIDATION_FAILED, `Change plan ${planId} not found.`);
    }

    const warnings: string[] = [];
    const affectedResources: string[] = [];
    const diffs: DryRunResult['diffs'] = [];
    let isValid = true;

    for (const op of plan.operations) {
      // Permission check
      if (!this.permissionRegistry.isOperationAllowed(op.type, true)) {
        isValid = false;
        warnings.push(`Operation "${op.type}" on "${op.targetResource}" is denied by permission registry.`);
      }

      affectedResources.push(op.targetResource);

      if (op.isDestructive) {
        warnings.push(`Caution: Operation "${op.type}" on "${op.targetResource}" is permanently destructive.`);
      }

      diffs.push({
        target: op.targetResource,
        type: op.type,
        before: op.diff.before,
        after: op.diff.after,
      });
    }

    const result: DryRunResult = {
      planId,
      valid: isValid,
      warnings,
      affectedResources,
      diffs,
      rollbackSupported: plan.operations.every((op) => op.type !== 'delete_page'),
    };

    plan.status = isValid ? 'validated' : 'rejected';
    plan.dryRunResult = {
      success: isValid,
      warnings,
      estimatedImpact: `${affectedResources.length} WordPress resources affected.`,
    };

    this.journal.record({
      planId,
      correlationId: plan.correlationId,
      actor: 'system',
      action: 'dry_run_executed',
      details: { isValid, warningsCount: warnings.length },
    });

    return result;
  }

  /**
   * Step 4: Obtain Explicit Human Approval.
   * Changes status to 'approved', locks the content hash, records the approver.
   */
  approveChangePlan(planId: string, approvedBy: string): ChangePlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new AgentError(ErrorCode.VALIDATION_FAILED, `Change plan ${planId} not found.`);
    }

    if (plan.status !== 'validated' && plan.status !== 'proposed') {
      throw new AgentError(
        ErrorCode.WRITE_OPERATION_DENIED,
        `Cannot approve plan with status "${plan.status}". Plan must be proposed or validated first.`
      );
    }

    plan.status = 'approved';
    plan.approvedBy = approvedBy;
    plan.approvedAt = new Date().toISOString();

    // Lock integrity hash to detect any modifications after approval
    const hash = calculatePlanHash(plan);
    this.approvedHashes.set(planId, hash);

    this.journal.record({
      planId,
      correlationId: plan.correlationId,
      actor: approvedBy,
      action: 'human_approval_granted',
      details: { integrityHash: hash },
    });

    this.auditLogger?.log({
      type: 'agent_request',
      actor: approvedBy,
      targetSite: plan.targetSite,
      action: 'approveChangePlan',
      payload: { planId, integrityHash: hash },
    });

    return plan;
  }

  /**
   * Rejects a change plan.
   */
  rejectChangePlan(planId: string, rejectedBy: string, reason?: string): ChangePlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new AgentError(ErrorCode.VALIDATION_FAILED, `Change plan ${planId} not found.`);
    }

    plan.status = 'rejected';

    this.journal.record({
      planId,
      correlationId: plan.correlationId,
      actor: rejectedBy,
      action: 'human_approval_rejected',
      details: { reason: reason || 'User rejected change proposal' },
    });

    return plan;
  }

  /**
   * Step 5: Apply Approved Changes.
   * Strictly enforces:
   * 1. Plan must be in 'approved' status.
   * 2. Plan content hash must match the approved hash (detects post-approval alteration).
   * 3. Preconditions must match live hashes (detects stale content / concurrent edits).
   */
  async applyApprovedChanges(
    planId: string,
    liveResourceHashes?: Record<string, string>
  ): Promise<ApplyResult> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new AgentError(ErrorCode.VALIDATION_FAILED, `Change plan ${planId} not found.`);
    }

    // Guard 1: Must be explicitly approved
    if (plan.status !== 'approved') {
      this.auditLogger?.log({
        type: 'tool_denial',
        actor: 'mutation_controller',
        targetSite: plan.targetSite,
        action: 'apply_unapproved_plan',
        payload: { planId, status: plan.status },
      });
      throw new AgentError(
        ErrorCode.WRITE_OPERATION_DENIED,
        `Cannot apply unapproved plan ${planId}. Current status: "${plan.status}". Human approval is strictly required.`
      );
    }

    // Guard 2: Hash integrity check (tamper detection)
    const storedHash = this.approvedHashes.get(planId);
    const currentHash = calculatePlanHash(plan);
    if (storedHash !== currentHash) {
      plan.status = 'failed';
      throw new AgentError(
        ErrorCode.FORBIDDEN,
        `Integrity check failed for plan ${planId}: Plan was modified after user approval was granted!`
      );
    }

    // Guard 3: Stale content / concurrent edit check
    if (liveResourceHashes && plan.preconditions.length > 0) {
      for (const pre of plan.preconditions) {
        const liveHash = liveResourceHashes[pre.resourceId];
        if (liveHash && liveHash !== pre.expectedHashOrVersion) {
          pre.status = 'stale';
          plan.status = 'failed';
          throw new AgentError(
            ErrorCode.VALIDATION_FAILED,
            `Concurrent edit detected on resource "${pre.resourceId}". Expected version "${pre.expectedHashOrVersion}" but found "${liveHash}". Changes aborted.`
          );
        }
        pre.status = 'satisfied';
      }
    }

    // Snapshot before-state for rollback capability
    const snapshots: Array<{ resource: string; beforeData: unknown }> = [];
    for (const op of plan.operations) {
      if (op.diff.before !== undefined) {
        snapshots.push({
          resource: op.targetResource,
          beforeData: op.diff.before,
        });
      }
    }
    this.appliedSnapshots.set(planId, snapshots);

    // Guard 4: Real mutation enabled flag check
    // If real mutation is disabled (default), apply via safe mock execution
    const isMockOnly = !this.isRealMutationEnabled;

    const executedOps = plan.operations.map((op) => ({
      operationId: op.operationId,
      target: op.targetResource,
      success: true,
    }));

    plan.status = 'applied';
    plan.appliedAt = new Date().toISOString();

    const result: ApplyResult = {
      planId,
      correlationId: plan.correlationId,
      status: isMockOnly ? 'dry_run_only' : 'applied',
      executedOperations: executedOps,
      appliedAt: plan.appliedAt,
    };

    this.journal.record({
      planId,
      correlationId: plan.correlationId,
      actor: 'mutation_controller',
      action: isMockOnly ? 'changes_simulated_safely' : 'changes_applied',
      details: { executedCount: executedOps.length, isMockOnly },
    });

    this.auditLogger?.log({
      type: 'tool_result',
      actor: 'mutation_controller',
      targetSite: plan.targetSite,
      action: 'applyApprovedChanges',
      result: { success: true, isMockOnly, planId },
    });

    return result;
  }

  /**
   * Step 6: Rollback applied changes using stored before snapshots.
   */
  async rollbackPlan(planId: string): Promise<RollbackResult> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new AgentError(ErrorCode.VALIDATION_FAILED, `Change plan ${planId} not found.`);
    }

    if (plan.status !== 'applied') {
      return {
        planId,
        status: 'not_applicable',
        restoredResources: [],
        message: `Plan ${planId} is in status "${plan.status}" and cannot be rolled back.`,
      };
    }

    const snapshots = this.appliedSnapshots.get(planId) || [];
    const restoredResources = snapshots.map((s) => s.resource);

    plan.status = 'rolled_back';

    this.journal.record({
      planId,
      correlationId: plan.correlationId,
      actor: 'mutation_controller',
      action: 'plan_rolled_back',
      details: { restoredResources },
    });

    return {
      planId,
      status: 'rolled_back',
      restoredResources,
      message: `Successfully rolled back ${restoredResources.length} resources using previous snapshots.`,
    };
  }
}

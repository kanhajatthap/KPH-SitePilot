import { describe, it, expect } from 'vitest';
import {
  MutationController,
  PermissionRegistry,
  calculatePlanHash,
} from '../src/mutation-controller.js';
import { AuditLogger } from '@wp-agent/audit';
import { ErrorCode } from '@wp-agent/contracts';

describe('Phase 5: Controlled WordPress Editing & Human Approval (MutationController)', () => {
  const createSampleOperation = (id = 'op-1', type = 'update_page' as const) => ({
    operationId: '10000000-0000-0000-0000-000000000001',
    type,
    targetResource: 'page:sample-page',
    summary: 'Update page headline and copy',
    diff: {
      before: { title: 'Old Sample Title', content: 'Old content' },
      after: { title: 'New Sample Title', content: 'New optimized content' },
    },
    isDestructive: false,
  });

  it('generates a proposed change plan in "proposed" status with 0 mutations applied', () => {
    const controller = new MutationController();
    const plan = controller.proposeChangePlan({
      targetSite: 'http://plugin-test.local',
      author: 'admin',
      summary: 'Update sample page copy',
      operations: [createSampleOperation()],
    });

    expect(plan.id).toBeDefined();
    expect(plan.status).toBe('proposed');
    expect(plan.requiresHumanApproval).toBe(true);
    expect(plan.operations).toHaveLength(1);

    // Journal records proposal
    const records = controller.getJournal().getRecords(plan.id);
    expect(records.some((r) => r.action === 'propose_change_plan')).toBe(true);
  });

  it('strictly blocks execution of unapproved proposals with WRITE_OPERATION_DENIED', async () => {
    const controller = new MutationController();
    const plan = controller.proposeChangePlan({
      targetSite: 'http://plugin-test.local',
      author: 'user',
      summary: 'Attempt unapproved edit',
      operations: [createSampleOperation()],
    });

    await expect(controller.applyApprovedChanges(plan.id)).rejects.toThrowError(
      /Human approval is strictly required/
    );
  });

  it('strictly blocks execution if proposal was modified after human approval (tamper detection)', async () => {
    const controller = new MutationController();
    const plan = controller.proposeChangePlan({
      targetSite: 'http://plugin-test.local',
      author: 'user',
      summary: 'Legitimate looking change',
      operations: [createSampleOperation('op-legit')],
    });

    // 1. User approves legitimate plan
    controller.approveChangePlan(plan.id, 'admin_user');
    expect(plan.status).toBe('approved');

    // 2. Malicious attacker or script tampers with operations array after approval
    plan.operations.push({
      operationId: '10000000-0000-0000-0000-000000000002',
      type: 'delete_page',
      targetResource: 'page:important-legal-page',
      summary: 'Malicious deletion injected post-approval',
      diff: { after: null },
      isDestructive: true,
    });

    // 3. Attempting to apply tampered plan MUST throw FORBIDDEN hash mismatch
    await expect(controller.applyApprovedChanges(plan.id)).rejects.toThrowError(
      /Plan was modified after user approval was granted/
    );
    expect(plan.status).toBe('failed');
  });

  it('detects concurrent edits and stale content, aborting change execution safely', async () => {
    const controller = new MutationController();
    const plan = controller.proposeChangePlan({
      targetSite: 'http://plugin-test.local',
      author: 'editor',
      summary: 'Update landing page',
      operations: [createSampleOperation()],
      preconditions: [
        {
          resourceId: 'page:sample-page',
          expectedHashOrVersion: 'hash_v1_initial',
        },
      ],
    });

    controller.approveChangePlan(plan.id, 'admin_user');

    // Simulate concurrent edit on WordPress: live hash is now 'hash_v2_edited_by_another_user'
    const liveHashes = {
      'page:sample-page': 'hash_v2_edited_by_another_user',
    };

    await expect(
      controller.applyApprovedChanges(plan.id, liveHashes)
    ).rejects.toThrowError(/Concurrent edit detected on resource/);

    expect(plan.status).toBe('failed');
  });

  it('executes dry-run simulation and builds before/after diffs with 0 live state impact', () => {
    const controller = new MutationController();
    const plan = controller.proposeChangePlan({
      targetSite: 'http://plugin-test.local',
      author: 'editor',
      summary: 'Dry run check',
      operations: [
        createSampleOperation('op-1', 'create_page'),
        {
          operationId: '10000000-0000-0000-0000-000000000003',
          type: 'delete_page',
          targetResource: 'page:old-draft',
          summary: 'Delete old draft',
          diff: { after: null },
          isDestructive: true,
        },
      ],
    });

    const dryRun = controller.executeDryRun(plan.id);

    expect(dryRun.valid).toBe(true);
    expect(dryRun.affectedResources).toContain('page:sample-page');
    expect(dryRun.affectedResources).toContain('page:old-draft');
    expect(dryRun.warnings.some((w) => w.includes('destructive'))).toBe(true);
    expect(dryRun.diffs).toHaveLength(2);
    expect(plan.status).toBe('validated');
  });

  it('applies approved plan in dry_run_only mode by default without live WordPress mutations', async () => {
    const auditLogger = new AuditLogger();
    const controller = new MutationController({ auditLogger });

    expect(controller.isRealMutationEnabled).toBe(false);

    const plan = controller.proposeChangePlan({
      targetSite: 'http://plugin-test.local',
      author: 'admin',
      summary: 'Safe simulated edit',
      operations: [createSampleOperation()],
      preconditions: [
        { resourceId: 'page:sample-page', expectedHashOrVersion: 'v1' },
      ],
    });

    controller.approveChangePlan(plan.id, 'admin');

    const result = await controller.applyApprovedChanges(plan.id, {
      'page:sample-page': 'v1',
    });

    expect(result.status).toBe('dry_run_only');
    expect(result.executedOperations).toHaveLength(1);
    expect(result.executedOperations[0].success).toBe(true);
    expect(plan.status).toBe('applied');

    // Rollback support
    const rollback = await controller.rollbackPlan(plan.id);
    expect(rollback.status).toBe('rolled_back');
    expect(rollback.restoredResources).toContain('page:sample-page');
    expect(plan.status).toBe('rolled_back');
  });

  it('strictly denies unauthorized operation types from executing via PermissionRegistry', () => {
    const registry = new PermissionRegistry();
    expect(registry.isOperationAllowed('page.read')).toBe(true);
    expect(registry.isOperationAllowed('create_page')).toBe(true);
    expect(registry.isOperationAllowed('arbitrary.php_exec')).toBe(false);
    expect(registry.isOperationAllowed('server.drop_database')).toBe(false);
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RELEASE_CHECKS,
  evaluateRelease,
  formatPlan,
  formatReport,
} from '../../../scripts/release-check.mjs';

const ROOT = path.resolve(__dirname, '../../..');

function allPassing() {
  return RELEASE_CHECKS.map((check) => ({ id: check.id, ok: true, exitCode: 0 }));
}

describe('E11-09 executable release checklist', () => {
  it('covers the four gates plus the two audits and diff check, once each', () => {
    const ids = RELEASE_CHECKS.map((check) => check.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['typecheck', 'lint', 'test', 'build', 'abuse-load', 'governance-audit', 'secret-audit', 'diff-check']) {
      expect(ids).toContain(id);
    }
    for (const check of RELEASE_CHECKS) {
      expect(check.command.length).toBeGreaterThan(0);
      expect(check.args.length).toBeGreaterThan(0);
      expect(check.label.length).toBeGreaterThan(5);
    }
  });

  it('passes only when every gate reported success', () => {
    const report = evaluateRelease(allPassing());
    expect(report).toMatchObject({ ok: true, passed: RELEASE_CHECKS.length, total: RELEASE_CHECKS.length });
    expect(report.failed).toEqual([]);
  });

  it('fails closed on a missing result', () => {
    const partial = allPassing().filter((result) => result.id !== 'test');
    const report = evaluateRelease(partial);
    expect(report.ok).toBe(false);
    expect(report.failed).toEqual([expect.objectContaining({ id: 'test', missing: true })]);
  });

  it('fails closed on a nonzero exit or an explicit false', () => {
    const bad = allPassing().map((result) =>
      result.id === 'build' ? { id: 'build', ok: false, exitCode: 1 } : result
    );
    expect(evaluateRelease(bad).ok).toBe(false);
    const lying = allPassing().map((result) =>
      result.id === 'lint' ? { id: 'lint', ok: true, exitCode: 2 } : result
    );
    expect(evaluateRelease(lying).failed.map((row) => row.id)).toContain('lint');
  });

  it('fails closed with no results at all', () => {
    const report = evaluateRelease([]);
    expect(report.ok).toBe(false);
    expect(report.passed).toBe(0);
    expect(report.failed).toHaveLength(RELEASE_CHECKS.length);
  });

  it('prints an ordered plan and a verdict without secrets', () => {
    const plan = formatPlan();
    expect(plan).toContain('pnpm release:check');
    expect(plan).toContain('pnpm test --force');
    expect(formatReport(evaluateRelease(allPassing()))).toContain('Release gates green');
    const blocked = formatReport(evaluateRelease([]));
    expect(blocked).toContain('Release BLOCKED');
    expect(blocked).not.toContain('sk-');
  });

  it('documents the one-command flow and ships a release-notes template', () => {
    const checklist = fs.readFileSync(path.join(ROOT, 'docs/release-checklist.md'), 'utf8');
    expect(checklist).toContain('pnpm release:check');
    expect(checklist).toContain('pnpm release:plan');
    const template = fs.readFileSync(path.join(ROOT, 'docs/release-notes-template.md'), 'utf8');
    expect(template).toContain('Commit');
    expect(template).toContain('Tests');
    expect(template).toContain('Rollback');
  });
});

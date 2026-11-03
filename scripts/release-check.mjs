#!/usr/bin/env node
/**
 * E11-09 — executable, fail-closed release checklist.
 *
 * `pnpm release:plan` lists exactly what a human would have to run.
 * `pnpm release:check` runs every gate in order and exits 1 on the first
 * failing result (all results are still collected and reported). Pure helpers
 * are exported so the checklist is unit-tested without running the gates.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RELEASE_CHECKS = [
  { id: 'typecheck', label: 'Strict TypeScript (monorepo + Edge)', command: 'pnpm', args: ['typecheck'] },
  { id: 'lint', label: 'Lint + PHP + governance + secret audits', command: 'pnpm', args: ['lint'] },
  { id: 'test', label: 'Unit & security tests (mock, zero quota)', command: 'pnpm', args: ['test', '--force'] },
  { id: 'build', label: 'Production build (Turborepo)', command: 'pnpm', args: ['build'] },
  { id: 'governance-audit', label: 'Product-phase governance audit', command: 'node', args: ['scripts/governance-audit.mjs'] },
  { id: 'secret-audit', label: 'Credential-shaped literal audit', command: 'node', args: ['scripts/secret-audit.mjs'] },
  { id: 'diff-check', label: 'Whitespace / conflict-marker diff check', command: 'git', args: ['diff', '--check'] },
];

/**
 * Fail closed: a missing result counts as a failure, and any nonzero exit or
 * `ok: false` blocks the release.
 */
export function evaluateRelease(results = [], checks = RELEASE_CHECKS) {
  const byId = new Map();
  for (const result of results) {
    if (result && typeof result.id === 'string') byId.set(result.id, result);
  }
  const rows = checks.map((check) => {
    const result = byId.get(check.id);
    const ok = Boolean(result && result.ok === true && (result.exitCode === undefined || result.exitCode === 0));
    return {
      id: check.id,
      label: check.label,
      ok,
      missing: !result,
      exitCode: result?.exitCode ?? null,
    };
  });
  const passed = rows.filter((row) => row.ok).length;
  const failed = rows.filter((row) => !row.ok);
  return { ok: failed.length === 0, passed, total: rows.length, failed, checks: rows };
}

export function formatPlan(checks = RELEASE_CHECKS) {
  return [
    `KPH SitePilot release checklist — ${checks.length} gates, in order:`,
    ...checks.map(
      (check, index) =>
        `  ${index + 1}. ${check.label} → ${check.command} ${check.args.join(' ')}`.trim()
    ),
    'Run all of them with: pnpm release:check',
  ].join('\n');
}

export function formatReport(report) {
  const lines = [`Release check: ${report.passed}/${report.total} gates passed.`];
  for (const row of report.checks) {
    lines.push(`  ${row.ok ? 'PASS' : 'FAIL'} ${row.id}${row.missing ? ' (missing result)' : ''}`);
  }
  if (!report.ok) lines.push('Release BLOCKED: fix the failing gates and run again.');
  else lines.push('Release gates green. Vercel auto-deploys the merge to main.');
  return lines.join('\n');
}

function runAll() {
  const results = [];
  for (const check of RELEASE_CHECKS) {
    console.log(`\n=== ${check.label} ===`);
    const spawned = spawnSync(check.command, check.args, { cwd: root, stdio: 'inherit' });
    const exitCode = spawned.status ?? 1;
    results.push({ id: check.id, ok: exitCode === 0 && !spawned.error, exitCode });
  }
  return evaluateRelease(results);
}

function main() {
  if (process.argv.includes('--plan')) {
    console.log(formatPlan());
    return;
  }
  const report = runAll();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(`\n${formatReport(report)}`);
  if (!report.ok) process.exit(1);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();

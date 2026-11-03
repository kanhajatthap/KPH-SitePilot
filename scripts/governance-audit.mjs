#!/usr/bin/env node
/**
 * E0-07 — executable governance audit.
 *
 * The old workspace rules banned production writes, restricted everything to
 * LocalWP and forbade scaffolding. The shipped product is a hosted, gated
 * WordPress agent, so those statements are now contradictions. This script
 * reads `scripts/governance-rules.json` and proves:
 *   - no retired, contradictory sentence survives in AGENTS.md / .agents/rules,
 *   - every product-phase invariant is present where it belongs,
 *   - all always-on rule files declare `phase: product-phase`.
 *
 * Wired into `pnpm lint`, so a stale rule fails CI locally and on every PR.
 * Run directly: `node scripts/governance-audit.mjs`
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rulesPath = path.join(root, 'scripts', 'governance-rules.json');
const failures = [];
const checks = [];

function readWorkspaceFile(relative) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) {
    failures.push(`missing audited file: ${relative}`);
    return null;
  }
  return readFileSync(absolute, 'utf8');
}

function compile(pattern, id) {
  try {
    return new RegExp(pattern, 'i');
  } catch (error) {
    failures.push(`invalid regex for ${id}: ${String(error)}`);
    return null;
  }
}

let rules;
try {
  rules = JSON.parse(readFileSync(rulesPath, 'utf8'));
} catch (error) {
  console.error(`Governance audit FAILED: cannot read rules file: ${String(error)}`);
  process.exit(1);
}

if (rules.phase !== 'product-phase') {
  failures.push(`rules phase must be product-phase, got ${String(rules.phase)}`);
}

const contents = new Map();
for (const relative of rules.auditedFiles ?? []) {
  const text = readWorkspaceFile(relative);
  if (text !== null) contents.set(relative, text);
}

// 1. No retired sentence survives anywhere in the audited corpus.
for (const item of rules.forbidden ?? []) {
  const regex = compile(item.pattern, item.id);
  if (!regex) continue;
  let found = false;
  for (const [relative, text] of contents) {
    if (regex.test(text)) {
      failures.push(`${item.id}: retired statement still present in ${relative}`);
      found = true;
    }
  }
  checks.push({ label: `forbidden/${item.id}`, ok: !found });
}

// 2. Every product-phase invariant is present in its declared files.
for (const item of rules.required ?? []) {
  const regex = compile(item.pattern, item.id);
  if (!regex) continue;
  const files = item.files ?? [];
  if (files.length === 0) failures.push(`${item.id}: no files declared`);
  let ok = files.length > 0;
  for (const relative of files) {
    const text = contents.get(relative);
    if (text === undefined) {
      failures.push(`${item.id}: ${relative} is not in auditedFiles`);
      ok = false;
      continue;
    }
    if (!regex.test(text)) {
      failures.push(`${item.id}: missing "${item.pattern}" in ${relative}`);
      ok = false;
    }
  }
  checks.push({ label: `required/${item.id}`, ok });
}

// 3. Every always-on rule file opts into the product phase explicitly.
for (const relative of rules.frontmatterFiles ?? []) {
  const text = contents.get(relative);
  const ok =
    text !== undefined &&
    text.startsWith('---\n') &&
    /^phase: product-phase$/m.test(text.slice(0, text.indexOf('\n---', 4)));
  if (!ok) failures.push(`${relative}: missing "phase: product-phase" frontmatter`);
  checks.push({ label: `frontmatter/${relative}`, ok: Boolean(ok) });
}

for (const check of checks) {
  console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.label}`);
}

const passed = checks.filter((check) => check.ok).length;
console.log(
  `\nGovernance audit v${rules.version} (${rules.phase}): ${passed}/${checks.length} checks passed, ${failures.length} failure(s).`
);
for (const failure of failures) console.error(`  - ${failure}`);

process.exit(failures.length > 0 ? 1 : 0);

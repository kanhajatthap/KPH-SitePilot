import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * E0-07 — the workspace governance rules must describe the shipped hosted
 * product, not the original read-only prototype. `scripts/governance-rules.json`
 * is the single source of truth shared by `scripts/governance-audit.mjs`
 * (wired into `pnpm lint`) and this test suite.
 */
const ROOT = path.resolve(__dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

interface ForbiddenRule {
  id: string;
  pattern: string;
}
interface RequiredRule {
  id: string;
  files: string[];
  pattern: string;
}
interface GovernanceRules {
  version: number;
  phase: string;
  auditedFiles: string[];
  frontmatterFiles: string[];
  forbidden: ForbiddenRule[];
  required: RequiredRule[];
}

const rules: GovernanceRules = JSON.parse(read('scripts/governance-rules.json'));
const docs = new Map(rules.auditedFiles.map((relative) => [relative, read(relative)]));
const doc = (relative: string) => docs.get(relative) ?? '';

describe('E0-07 governance rules file', () => {
  it('declares the product phase and a complete audited file set', () => {
    expect(rules.version).toBe(1);
    expect(rules.phase).toBe('product-phase');
    expect(rules.auditedFiles).toContain('AGENTS.md');
    expect(rules.auditedFiles).toHaveLength(5);
    expect(rules.frontmatterFiles).toHaveLength(4);
    expect(rules.frontmatterFiles.every((file) => rules.auditedFiles.includes(file))).toBe(true);
  });

  it('has unique ids and compilable regexes', () => {
    const forbiddenIds = rules.forbidden.map((rule) => rule.id);
    const requiredIds = rules.required.map((rule) => rule.id);
    expect(new Set(forbiddenIds).size).toBe(forbiddenIds.length);
    expect(new Set(requiredIds).size).toBe(requiredIds.length);
    expect(rules.forbidden.length).toBeGreaterThanOrEqual(10);
    expect(rules.required.length).toBeGreaterThanOrEqual(15);
    for (const rule of [...rules.forbidden, ...rules.required]) {
      expect(() => new RegExp(rule.pattern, 'i'), rule.id).not.toThrow();
    }
  });

  it('declares real files for every required rule', () => {
    for (const rule of rules.required) {
      expect(rule.files.length, rule.id).toBeGreaterThan(0);
      for (const file of rule.files) {
        expect(rules.auditedFiles, `${rule.id} → ${file}`).toContain(file);
      }
    }
  });

  it('can actually detect a retired rule (guard is not vacuous)', () => {
    const ban = rules.forbidden.find((rule) => rule.id === 'old-production-ban');
    const readOnly = rules.forbidden.find((rule) => rule.id === 'old-read-only-phase');
    expect(ban).toBeDefined();
    expect(readOnly).toBeDefined();
    expect(new RegExp(ban!.pattern, 'i').test('Never target or connect to production WordPress environments.')).toBe(true);
    expect(new RegExp(readOnly!.pattern, 'i').test('Initial phase is strictly read-only and exploratory.')).toBe(true);
  });
});

describe('E0-07 no contradictory statements remain', () => {
  it('all audited files exist and are non-empty', () => {
    for (const [relative, text] of docs) {
      expect(text.trim().length, relative).toBeGreaterThan(100);
    }
  });

  it('no retired/read-only sentence survives in any audited file', () => {
    for (const rule of rules.forbidden) {
      const regex = new RegExp(rule.pattern, 'i');
      for (const [relative, text] of docs) {
        expect(regex.test(text), `${rule.id} in ${relative}`).toBe(false);
      }
    }
  });

  it('every product-phase invariant is present in its declared files', () => {
    for (const rule of rules.required) {
      const regex = new RegExp(rule.pattern, 'i');
      for (const relative of rule.files) {
        expect(regex.test(doc(relative)), `${rule.id} missing in ${relative}`).toBe(true);
      }
    }
  });

  it('always-on rule files declare the product phase in frontmatter', () => {
    for (const relative of rules.frontmatterFiles) {
      const text = doc(relative);
      expect(text.startsWith('---\n'), relative).toBe(true);
      expect(text).toContain('phase: product-phase');
      expect(text).toContain('trigger: always_on');
    }
  });

  it('rule descriptions no longer promise read-only or local-only foundations', () => {
    for (const relative of ['.agents/rules/architecture.md', '.agents/rules/security.md']) {
      const frontmatter = doc(relative).split('---')[1];
      expect(frontmatter).not.toMatch(/read-only foundational|local-only execution|read-only inspection/);
      expect(frontmatter).toMatch(/product-phase|production writes|product phase/i);
    }
  });
});

describe('E0-07 rules match master plan §8.2', () => {
  const plan = read('docs/sitepilot-master-plan.md');

  it('plan §8.2 still states the production write policy', () => {
    expect(plan).toContain('### 8.2 Production write policy (change from today)');
    expect(plan).toContain('Production **allowed** only when the site is explicitly added as `environment: production`.');
    expect(plan).toContain('Default write mode = **draft / private**; publish is an explicit R2 step.');
    expect(plan).toContain('AGENTS.md');
  });

  it('AGENTS.md and security.md implement that policy with the same vocabulary', () => {
    for (const relative of ['AGENTS.md', '.agents/rules/security.md']) {
      const text = doc(relative);
      expect(text, relative).toContain('environment: production');
      expect(text, relative).toContain('plan §8.2');
      expect(text, relative).toMatch(/production sites are allowed/i);
      expect(text, relative).toContain('draft / private');
      expect(text, relative).toContain('CONFIRM');
    }
  });

  it('architecture.md replaces the read-only phase with the gated pipeline', () => {
    const text = doc('.agents/rules/architecture.md');
    expect(text).toContain('Product-Phase Write Gating');
    expect(text).toContain('plan → approve → snapshot → write → read-back verify → one-click undo');
    expect(text).toMatch(/never lowered/i);
    expect(text).toContain('WP_TOOL_SPECS');
  });

  it('security.md keeps deny-by-default, connector-only transport and RLS', () => {
    const text = doc('.agents/rules/security.md');
    expect(text).toContain('HMAC-SHA256');
    expect(text).toContain('RLS');
    expect(text).toContain('SSRF');
    expect(text).toContain('deny-by-default');
    expect(text).toContain('read-back verification');
    expect(text).toContain('unknown tool names are refused');
  });

  it('AGENTS.md records the gates, auto-deploy and owner-side blockers', () => {
    const text = doc('AGENTS.md');
    for (const marker of [
      'pnpm typecheck',
      'pnpm lint',
      'pnpm test --force',
      'pnpm build',
      'auto-deploy',
      '34 allowlisted tools',
      'staging Supabase project',
    ]) {
      expect(text, marker).toContain(marker);
    }
    expect(text).toMatch(/no fabricated capability/i);
  });
});

describe('E0-07 governance audit is executable and enforced', () => {
  const audit = read('scripts/governance-audit.mjs');
  const pkg = JSON.parse(read('package.json'));

  it('audit script reads the shared rules and fails closed', () => {
    expect(audit).toContain('#!/usr/bin/env node');
    expect(audit).toContain("scripts/governance-rules.json");
    expect(audit).toContain('process.exit(failures.length > 0 ? 1 : 0)');
    expect(audit).toContain('forbidden');
    expect(audit).toContain('required');
    expect(audit).toContain('frontmatter');
  });

  it('pnpm lint runs the governance audit before Edge typecheck', () => {
    expect(pkg.scripts.lint).toContain('node scripts/governance-audit.mjs');
    expect(pkg.scripts.lint.indexOf('governance-audit.mjs')).toBeLessThan(
      pkg.scripts.lint.indexOf('typecheck:edge')
    );
    expect(pkg.scripts.lint).toContain('node scripts/php-lint.mjs');
  });

  it('testing.md documents the four gates and the hosted CI jobs', () => {
    const text = doc('.agents/rules/testing.md');
    expect(text).toContain('Hosted Product Gates');
    expect(text).toContain('pnpm test --force');
    expect(text).toContain('PHP 8.2');
    expect(text).toContain('supabase test db --local');
    expect(text).toContain('/api/health?v=<n>');
  });

  it('token-efficiency.md keeps its guidance while opting into the product phase', () => {
    const text = doc('.agents/rules/token-efficiency.md');
    expect(text).toContain('phase: product-phase');
    expect(text).toContain('Minimal Diffs & Focused Edits');
    expect(text).toContain('Execution Evidence Over Narrative');
  });
});

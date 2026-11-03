import { describe, expect, it } from 'vitest';
import {
  SECRET_RULES,
  formatReport,
  isScannable,
  runAudit,
  scanFile,
  scanText,
} from '../../../scripts/secret-audit.mjs';

const SAMPLES = {
  'private-key': '-----BEGIN RSA PRIVATE KEY-----',
  'openai-key': 'const key = "sk-abcdefghijklmnopqrstuvwxyz123456";',
  'github-token': 'const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";',
  'slack-token': 'const token = "xoxb-1234567890-abcdefghijkl";',
  'aws-access-key': 'const key = "AKIAIOSFODNN7EXAMPLE";',
  'google-api-key': 'const key = "AIzaSyD-1234567890abcdefghijklmnopqrstuvw";',
  'jwt-literal': 'const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue";',
  'bearer-literal': 'headers: { Authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456" }',
  'env-secret-assignment': 'SUPABASE_SERVICE_ROLE_KEY = "abcdefghijklmnopqrstuvwxyz123456"',
};

describe('E11-01 executable secrets audit', () => {
  it('has a unique id and a real regex for every rule', () => {
    expect(SECRET_RULES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(SECRET_RULES.map((rule) => rule.id)).size).toBe(SECRET_RULES.length);
    for (const rule of SECRET_RULES) {
      expect(rule.pattern instanceof RegExp, rule.id).toBe(true);
      expect(SAMPLES[rule.id], rule.id).toBeTruthy();
    }
  });

  it('catches a credential-shaped literal for every rule', () => {
    for (const rule of SECRET_RULES) {
      const findings = scanText(`line one\n${SAMPLES[rule.id]}\nline three`);
      expect(findings.map((item) => item.ruleId), rule.id).toContain(rule.id);
      expect(findings[0].line, rule.id).toBe(2);
    }
  });

  it('never includes the matched secret in a finding or report', () => {
    const secrets = Object.values(SAMPLES).join('\n');
    const findings = scanFile('apps/dashboard/src/lib/example.ts', secrets);
    const report = formatReport({ checked: 1, findings, ok: false });
    expect(report).toContain('Secret audit: 1 files scanned');
    expect(report).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(report).not.toContain('hunter2');
    expect(findings.every((finding) => !('match' in finding))).toBe(true);
  });

  it('allows an explicit, reviewable opt-out marker on one line only', () => {
    const text = [
      'const placeholder = "sk-abcdefghijklmnopqrstuvwxyz123456"; // secret-audit-allow',
      'const real = "sk-abcdefghijklmnopqrstuvwxyz123456";',
    ].join('\n');
    const findings = scanText(text);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(2);
  });

  it('scans shipped source but not tests, fixtures, the lockfile or itself', () => {
    expect(isScannable('apps/dashboard/src/lib/api.ts')).toBe(true);
    expect(isScannable('wordpress/kph-sitepilot-connector/plugin.php')).toBe(true);
    expect(isScannable('.github/workflows/ci.yml')).toBe(true);
    for (const excluded of [
      'apps/dashboard/tests/secret-audit.test.mjs',
      'packages/supabase/tests/repos.test.ts',
      'pnpm-lock.yaml',
      'scripts/secret-audit.mjs',
      'scripts/governance-rules.json',
      'apps/dashboard/dist/index.js',
    ]) {
      expect(isScannable(excluded), excluded).toBe(false);
    }
  });

  it('passes on clean injected files and fails closed on an injected secret', () => {
    const read = (file) => (file === 'bad.ts' ? SAMPLES['openai-key'] : 'const answer = 42;');
    const clean = runAudit({ files: ['good.ts'], read });
    expect(clean).toMatchObject({ checked: 1, findings: [], ok: true });

    const dirty = runAudit({ files: ['good.ts', 'bad.ts'], read });
    expect(dirty.ok).toBe(false);
    expect(dirty.findings).toEqual([{ file: 'bad.ts', line: 1, ruleId: 'openai-key' }]);
  });

  it('flags a tracked .env file even when its extension is not scannable', () => {
    const result = runAudit({ files: ['.env.local', 'good.ts'], read: () => 'harmless' });
    expect(result.findings.map((finding) => finding.ruleId)).toContain('tracked-env-file');
    expect(result.ok).toBe(false);
  });

  it('fails closed on an unreadable file', () => {
    const result = runAudit({
      files: ['missing.ts'],
      read: () => {
        throw new Error('ENOENT');
      },
    });
    expect(result.findings[0].ruleId).toBe('unreadable-file');
    expect(result.ok).toBe(false);
  });
});

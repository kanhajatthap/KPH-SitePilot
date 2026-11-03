#!/usr/bin/env node
/**
 * E11-01 — executable secrets audit (bundle, log and env-review guard).
 *
 * Fails closed: a tracked file containing a credential-shaped literal stops
 * `pnpm lint` (and therefore every PR). Findings print only file/line/rule —
 * never the matched text — so the audit itself cannot leak a secret into CI
 * logs. Pure helpers are exported so the rules are unit-tested.
 *
 *   node scripts/secret-audit.mjs            # scan tracked files
 *   node scripts/secret-audit.mjs --json     # machine-readable findings
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SECRET_RULES = [
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/ },
  { id: 'openai-key', pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { id: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { id: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35,}\b/ },
  { id: 'jwt-literal', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/ },
  { id: 'bearer-literal', pattern: /Bearer\s+[A-Za-z0-9._-]{24,}/ },
  {
    id: 'env-secret-assignment',
    pattern:
      /(?:SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|SITEPILOT_ENCRYPTION_KEY|OPENAI_API_KEY|GEMINI_API_KEY|CRON_SECRET)\s*[:=]\s*["']?[A-Za-z0-9_\-/.+]{24,}/,
  },
];

export const TRACKED_ENV_FILES = [/^\.env$/, /^\.env\.local$/, /(^|\/)\.env$/, /(^|\/)\.env\.local$/];

const SCANNABLE = /\.(?:ts|tsx|js|mjs|cjs|json|yml|yaml|php|sql|md|sh|toml|txt|html|css)$/i;

const EXCLUDED_PATHS = [
  /pnpm-lock\.yaml$/,
  /scripts\/secret-audit\.mjs$/,
  /scripts\/governance-rules\.json$/,
  /(^|\/)tests\//,
  /\.test\./,
  /\.spec\./,
  /(^|\/)fixtures\//,
  /(^|\/)dist\//,
  /(^|\/)\.next\//,
  /(^|\/)node_modules\//,
  /(^|\/)coverage\//,
];

export function isScannable(relative) {
  const normalised = relative.replace(/\\/g, '/');
  return SCANNABLE.test(normalised) && !EXCLUDED_PATHS.some((rule) => rule.test(normalised));
}

export function scanText(text, rules = SECRET_RULES) {
  const findings = [];
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    // Explicit, reviewable opt-out for documentation that must show a shape.
    if (line.includes('secret-audit-allow')) continue;
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) {
        findings.push({ ruleId: rule.id, line: index + 1 });
      }
    }
  }
  return findings;
}

export function scanFile(relative, text) {
  return scanText(text).map((finding) => ({ ...finding, file: relative }));
}

export function runAudit({ files, read = (file) => readFileSync(path.join(root, file), 'utf8') } = {}) {
  const tracked = files ?? listTrackedFiles();
  const findings = [];
  let checked = 0;

  for (const relative of tracked) {
    for (const rule of TRACKED_ENV_FILES) {
      if (rule.test(relative.replace(/\\/g, '/'))) {
        findings.push({ file: relative, line: 0, ruleId: 'tracked-env-file' });
      }
    }
    if (!isScannable(relative)) continue;
    let text;
    try {
      text = read(relative);
    } catch {
      findings.push({ file: relative, line: 0, ruleId: 'unreadable-file' });
      continue;
    }
    checked += 1;
    findings.push(...scanFile(relative, text));
  }

  return { checked, findings, ok: findings.length === 0 };
}

function listTrackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

export function formatReport(result) {
  const lines = [`Secret audit: ${result.checked} files scanned, ${result.findings.length} finding(s).`];
  for (const finding of result.findings) {
    lines.push(`  FAIL ${finding.ruleId} ${finding.file}${finding.line ? `:${finding.line}` : ''}`);
  }
  return lines.join('\n');
}

function main() {
  const result = runAudit();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatReport(result));
  }
  if (!result.ok) {
    console.error('Secret audit FAILED: remove the credential and rotate it if it was ever real.');
    process.exit(1);
  }
  if (!existsSync(path.join(root, 'scripts', 'secret-audit.mjs'))) process.exit(1);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();

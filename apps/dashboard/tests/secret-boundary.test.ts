import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_ROOT = path.resolve(__dirname, '../src');

const FORBIDDEN_ENV = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
  'DATABASE_URL',
  'OPENROUTER_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'WP_APPLICATION_PASSWORD',
  'VAULT_MASTER_KEY',
  'GITHUB_MCP_PAT',
  'JWT_SECRET',
]);

const ALLOWED_PUBLIC_ENV = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_CHAT_HISTORY_MODE',
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

function envNames(source: string): string[] {
  const matches = source.matchAll(/(?:process\.env|env)\.([A-Z][A-Z0-9_]+)/g);
  return [...matches].map((match) => match[1]);
}

describe('browser bundle secret boundary', () => {
  const files = sourceFiles(SRC_ROOT);
  const sources = files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

  it('never references privileged server secrets from dashboard source', () => {
    for (const { file, text } of sources) {
      for (const name of envNames(text)) {
        expect(FORBIDDEN_ENV.has(name), `${path.relative(SRC_ROOT, file)} reads ${name}`).toBe(false);
      }
    }
  });

  it('exposes only the public Supabase settings to the browser', () => {
    for (const { file, text } of sources) {
      for (const name of envNames(text)) {
        if (!name.startsWith('NEXT_PUBLIC_')) continue;
        expect(ALLOWED_PUBLIC_ENV.has(name), `${path.relative(SRC_ROOT, file)} exposes ${name}`).toBe(true);
      }
    }
  });

  it('contains no hard-coded provider or Supabase secret literals', () => {
    for (const { file, text } of sources) {
      const label = path.relative(SRC_ROOT, file);
      expect(text, label).not.toMatch(/sk-or-v1-[A-Za-z0-9]{20,}/);
      expect(text, label).not.toMatch(/sb_secret_[A-Za-z0-9_-]{10,}/);
      expect(text, label).not.toMatch(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
    }
  });
});

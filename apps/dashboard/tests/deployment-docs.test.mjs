import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const guide = read('docs/deployment-guide.md');

describe('E11-08 hosted deployment runbook', () => {
  it('documents the actual cron route and schedule from deployment config', () => {
    const config = JSON.parse(read('apps/dashboard/vercel.json'));
    for (const cron of config.crons) {
      expect(guide).toContain(`\`${cron.path}\``);
      expect(guide).toContain(`\`${cron.schedule}\``);
    }
    expect(guide).toContain('Do not invoke this mutating cleanup');
  });

  it('keeps sensitive hosted environment entries explicitly server-only', () => {
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SITEPILOT_ENCRYPTION_KEY', 'CRON_SECRET', 'RESEND_API_KEY']) {
      const row = guide.split('\n').find((line) => line.startsWith(`| \`${name}\` |`));
      expect(row, name).toContain('| Server-only secret |');
    }
    expect(guide).toContain('32-byte encryption key encoded as 64 hex characters or base64');
    expect(guide).toContain('makes previously encrypted data unreadable');
  });

  it('documents repository commands and isolated database CI commands', () => {
    const pkg = JSON.parse(read('package.json'));
    for (const command of ['release:check', 'build', 'connector:zip', 'dev:dashboard', 'start:dashboard']) {
      expect(pkg.scripts[command], command).toBeTruthy();
      expect(guide).toContain(`pnpm ${command}`);
    }
    const workflow = read('.github/workflows/supabase-local.yml');
    for (const line of workflow.split('\n')) {
      const command = line.match(/(?:run:\s*|^\s*)(pnpm dlx supabase@[^\n]+)/)?.[1];
      if (command) expect(guide).toContain(command);
    }
    expect(guide).not.toContain('supabase db push');
    expect(guide).not.toContain('supabase secrets set');
  });

  it('separates configuration health from live acceptance evidence', () => {
    expect(guide).toContain('Storage/encryption readiness does not control overall HTTP status');
    expect(guide).toContain('not a database query');
    expect(guide).toContain('not an inbox delivery test');
    expect(guide).toContain('The connector is the only WordPress transport');
    expect(guide).toContain('deterministic planning works');
    expect(guide).not.toContain('AGENT_API_URL');
    expect(guide).not.toContain('proxy_pass');
    expect(guide).not.toContain('CMD [');
  });

  it('has no broken relative documentation links', () => {
    for (const match of guide.matchAll(/\]\((\.\.?\/[^)#]+)(?:#[^)]*)?\)/g)) {
      expect(fs.existsSync(path.resolve(root, 'docs', match[1])), match[1]).toBe(true);
    }
  });
});

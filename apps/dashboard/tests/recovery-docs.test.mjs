import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const incident = read('docs/incident-response-and-rollback.md');
const backup = read('docs/backup-restore-strategy.md');

describe('E11-08 hosted recovery runbooks', () => {
  it('documents every restore tool emitted by the snapshot resolver', () => {
    const resolver = read('apps/dashboard/src/lib/connector/undo.ts');
    const tools = [...resolver.matchAll(/tool: '([^']+)'/g)].map((match) => match[1]);
    expect(new Set(tools).size).toBe(7);
    for (const tool of tools) expect(backup).toContain(`\`${tool}\``);
    for (const code of ['ROLLBACK_UNAVAILABLE', 'SNAPSHOT_UNUSABLE']) expect(backup).toContain(code);
  });

  it('warns that enqueue metadata is not a completed recovery', () => {
    for (const doc of [incident, backup]) {
      expect(doc).toContain('202 queued is not restored');
      expect(doc).toContain('restored_at');
      expect(doc).toContain('ALREADY_RESTORED');
    }
    const route = read('apps/dashboard/src/app/api/connector/snapshots/[id]/undo/route.ts');
    expect(route).not.toContain('markSnapshotRestored');
    expect(route).toContain("status: 'queued'");
  });

  it('preserves rotation and in-flight containment caveats', () => {
    expect(incident).toContain('Rotation sets the site status to active');
    expect(incident).toContain('already-claimed or running work');
    expect(incident).toContain('not atomic with revocation');
    expect(incident).toContain('SITE_PAUSED');
    expect(incident).toContain('SITE_REVOKED');
    expect(incident).toContain('/settings/keys');
    expect(incident).not.toContain('UPDATE public.');
    expect(incident).not.toContain('systemctl restart');
  });

  it('does not claim housekeeping or database tests are a rehearsed backup', () => {
    expect(backup).toContain('not a database backup job');
    expect(backup).toContain('E11-06 remains open');
    expect(backup).toContain('Never automatically dispatch restored queues');
    expect(backup).toContain('SITEPILOT_ENCRYPTION_KEY');
    expect(backup).not.toContain('wp db import');
    expect(incident).toContain('changing it alone makes existing encrypted');
  });

  it('links only existing relative documents', () => {
    for (const doc of [incident, backup]) {
      for (const match of doc.matchAll(/\]\((\.\.?\/[^)#]+)(?:#[^)]*)?\)/g)) {
        expect(fs.existsSync(path.resolve(root, 'docs', match[1])), match[1]).toBe(true);
      }
    }
  });
});

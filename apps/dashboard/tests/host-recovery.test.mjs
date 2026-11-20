import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
describe('independent host recovery', () => {
  it('passes isolated filesystem failure tests without WordPress', () => {
    const run = spawnSync(process.execPath, ['--test', 'tools/recovery/recovery.test.mjs'], { cwd: path.resolve(__dirname,'../../..'), encoding:'utf8', timeout:30000 });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('# fail 0');
  });
});

describe('pilot evidence gate', () => { it('never activates and refuses missing mandatory evidence', () => { const run=spawnSync(process.execPath,['--test','tools/pilot/readiness.test.mjs'],{cwd:path.resolve(__dirname,'../../..'),encoding:'utf8',timeout:30000}); expect(run.status,run.stdout+run.stderr).toBe(0); }); });

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const root = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const engine = read('wordpress/kph-sitepilot-connector/includes/class-restricted-files.php');
describe('restricted file editor release boundary', () => {
  it('does not bootstrap or advertise the experimental engine', () => {
    expect(read('wordpress/kph-sitepilot-connector/kph-sitepilot-connector.php')).not.toContain('class-restricted-files');
    expect(read('wordpress/kph-sitepilot-connector/includes/class-tools.php')).not.toContain('KPH_SP_Restricted_Files');
    expect(read('docs/restricted-file-editor.md')).toContain('cannot use this editor from chat yet');
  });
  it('retains staging, opt-in, capability and host-disable gates', () => {
    for (const value of ['wp_get_environment_type', 'KPH_SP_RESTRICTED_FILES_ENABLED', 'KPH_SP_RESTRICTED_FILE_PATHS', 'manage_options', 'edit_themes', 'edit_plugins', 'DISALLOW_FILE_MODS', 'DISALLOW_FILE_EDIT']) {
      expect(engine).toContain(value);
    }
  });
  it('contains no execution or transport escape hatch', () => {
    for (const forbidden of [/\beval\s*\(/, /\bexec\s*\(/, /\bshell_exec\s*\(/, /\bproc_open\s*\(/, /\bwp_remote_/, /\$wpdb/]) {
      expect(engine).not.toMatch(forbidden);
    }
    expect(engine).toContain('TOKEN_PARSE');
  });
  it('protects backups, preconditions and private atomic replacement', () => {
    for (const value of ['aes-256-gcm', 'FILE_CHANGED', 'FILE_BACKUP_FAILED', 'FILE_WRITE_UNVERIFIED', 'FILE_PLAN_EXPIRED', 'KPH_SP_FILE_WORKSPACE', 'LOCK_EX | LOCK_NB', 'hash_equals', 'rename(']) expect(engine).toContain(value);
  });
  it('executes isolated PHP tests in CI, including disabled modes', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain('php wordpress/kph-sitepilot-connector/tests/test-restricted-files.php');
    expect(ci).toContain('KPH_TEST_MODE=disabled');
    expect(ci).toContain('KPH_TEST_MODE=mods-disabled');
  });
});

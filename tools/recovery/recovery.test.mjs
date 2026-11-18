import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { prepare, restore } from './recovery.mjs';
const sha = s => createHash('sha256').update(s).digest('hex');
function fixture(fn) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kph-recovery-'));
  const root = path.join(base, 'site'); const vault = path.join(base, 'vault');
  const relative = 'wp-content/themes/test/functions.php';
  fs.mkdirSync(path.join(root, 'wp-content/themes/test'), { recursive: true, mode: 0o700 }); fs.mkdirSync(vault, { mode: 0o700 });
  fs.writeFileSync(path.join(vault, 'key'), randomBytes(32), { mode: 0o600 });
  const policy = path.join(base, 'policy.json');
  const config = { version: 1, enabled: true, environment: 'staging', root, vault, publicRoots: [root], allowedFiles: [relative] };
  fs.writeFileSync(policy, JSON.stringify(config), { mode: 0o600 });
  const file = path.join(root, relative); const before = '<?php echo "healthy fixture";'; const after = '<?php throw new RuntimeException("fixture fatal");';
  fs.writeFileSync(file, before, { mode: 0o600 });
  try { return fn({ base, root, vault, relative, policy, config, file, before, after }); }
  finally { fs.rmSync(base, { recursive: true, force: true }); }
}
test('prepare encrypts and verifies without editing; restore defaults to dry-run', () => fixture(f => {
  const p = prepare(f.policy, f.relative, sha(f.after)); assert.equal(fs.readFileSync(f.file, 'utf8'), f.before);
  assert.equal(fs.readFileSync(path.join(f.vault, `${p.id}.backup`)).includes(Buffer.from(f.before)), false);
  fs.writeFileSync(f.file, f.after);
  assert.equal(restore(f.policy, p.id, p.id).dryRun, true); assert.equal(fs.readFileSync(f.file,'utf8'), f.after);
  assert.equal(restore(f.policy, p.id, p.id, true).verified, true); assert.equal(fs.readFileSync(f.file,'utf8'), f.before);
  assert.throws(() => restore(f.policy,p.id,p.id,true), /FILE_CHANGED/);
}));
test('corrupted backup refuses without touching target', () => fixture(f => {
  const p = prepare(f.policy,f.relative,sha(f.after)); fs.writeFileSync(f.file,f.after);
  const backup = path.join(f.vault,`${p.id}.backup`); const bytes = fs.readFileSync(backup); bytes[40] ^= 1; fs.writeFileSync(backup,bytes);
  assert.throws(() => restore(f.policy,p.id,p.id,true), /BACKUP_UNUSABLE/); assert.equal(fs.readFileSync(f.file,'utf8'),f.after);
}));
test('changed target and wrong confirmation refuse', () => fixture(f => {
  const p = prepare(f.policy,f.relative,sha(f.after)); fs.writeFileSync(f.file,'legitimate newer edit');
  assert.throws(() => restore(f.policy,p.id,'CONFIRM',true), /CONFIRMATION_REQUIRED/);
  assert.throws(() => restore(f.policy,p.id,p.id,true), /FILE_CHANGED/);
}));
test('wrong root binding refuses', () => fixture(f => {
  const p = prepare(f.policy,f.relative,sha(f.after)); const other = path.join(f.base,'other'); fs.mkdirSync(other,{mode:0o700});
  fs.writeFileSync(f.policy,JSON.stringify({...f.config,root:other,publicRoots:[f.root,other]}));
  assert.throws(() => restore(f.policy,p.id,p.id,true), /WRONG_TARGET/);
}));
test('production, unrestricted paths and public vault are rejected', () => fixture(f => {
  assert.throws(() => prepare(f.policy,'wp-config.php',sha(f.after)), /FILE_NOT_ALLOWED/);
  fs.writeFileSync(f.policy,JSON.stringify({...f.config,environment:'production'}));
  assert.throws(() => prepare(f.policy,f.relative,sha(f.after)), /STAGING_POLICY_REQUIRED/);
  fs.writeFileSync(f.policy,JSON.stringify({...f.config,vault:f.root}));
  assert.throws(() => prepare(f.policy,f.relative,sha(f.after)), /PRIVATE_VAULT_REQUIRED/);
}));
test('symlink and hard-linked targets rejected', () => fixture(f => {
  const alternate = path.join(f.base,'other.php'); fs.renameSync(f.file,alternate); fs.symlinkSync(alternate,f.file);
  assert.throws(() => prepare(f.policy,f.relative,sha(f.after)), /UNSAFE_PATH/);
  fs.unlinkSync(f.file); fs.linkSync(alternate,f.file);
  assert.throws(() => prepare(f.policy,f.relative,sha(f.after)), /UNSAFE_FILE/);
}));
test('private policy and key permissions required', () => fixture(f => {
  fs.chmodSync(f.policy,0o644); assert.throws(() => prepare(f.policy,f.relative,sha(f.after)), /UNSAFE_FILE/);
  fs.chmodSync(f.policy,0o600); fs.chmodSync(path.join(f.vault,'key'),0o644);
  assert.throws(() => prepare(f.policy,f.relative,sha(f.after)), /UNSAFE_FILE/);
}));
test('rename failure leaves original and removes temporary file', () => fixture(f => {
  const p = prepare(f.policy,f.relative,sha(f.after)); fs.writeFileSync(f.file,f.after); const rename = fs.renameSync;
  try { fs.renameSync = () => { throw new Error('fixture write failure'); }; assert.throws(() => restore(f.policy,p.id,p.id,true), /fixture write failure/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(f.file,'utf8'),f.after); assert.equal(fs.readdirSync(f.vault).some(x=>x.endsWith('.restore')),false);
}));
test('temporary write failure leaves live target and cleans partial source', () => fixture(f => {
  const p = prepare(f.policy,f.relative,sha(f.after)); fs.writeFileSync(f.file,f.after); const write = fs.writeSync;
  try { fs.writeSync = () => { throw new Error('fixture disk full'); }; assert.throws(() => restore(f.policy,p.id,p.id,true), /fixture disk full/); }
  finally { fs.writeSync = write; }
  assert.equal(fs.readFileSync(f.file,'utf8'),f.after); assert.equal(fs.readdirSync(f.vault).some(x=>x.endsWith('.restore')),false);
}));
test('read-back mismatch never reports verified success', () => fixture(f => {
  const p = prepare(f.policy,f.relative,sha(f.after)); fs.writeFileSync(f.file,f.after); const rename = fs.renameSync;
  try { fs.renameSync = (a,b) => { rename(a,b); fs.writeFileSync(b,'external edit after rename'); }; assert.throws(() => restore(f.policy,p.id,p.id,true), /RESTORE_UNVERIFIED/); }
  finally { fs.renameSync = rename; }
  assert.ok(fs.existsSync(path.join(f.vault,`${p.id}.backup`)));
}));
test('cooperative recovery lock refuses concurrent operator', () => fixture(f => {
  fs.mkdirSync(path.join(f.vault,'.recovery-lock')); assert.throws(() => prepare(f.policy,f.relative,sha(f.after)), /RECOVERY_BUSY/);
}));
test('size limit rejects oversized source', () => fixture(f => {
  fs.writeFileSync(f.file,'a'.repeat(65537)); assert.throws(() => prepare(f.policy,f.relative,sha(f.after)), /UNSAFE_FILE/);
}));
const php = process.env.PHP_BIN || 'php'; const phpCheck = spawnSync(php,['-v'],{encoding:'utf8'});
test('fixed runtime-fatal PHP fixture recovered without booting WordPress', { skip: phpCheck.error && !process.env.REQUIRE_PHP_RECOVERY_TEST ? 'native PHP unavailable' : false }, () => fixture(f => {
  assert.equal(phpCheck.error, undefined, 'PHP required for CI fatal fixture');
  const p = prepare(f.policy,f.relative,sha(f.after)); fs.writeFileSync(f.file,f.after);
  const failed = spawnSync(php,[f.file],{encoding:'utf8',timeout:10000});
  assert.match((failed.stdout||'')+(failed.stderr||''), /fixture fatal/);
  assert.equal(restore(f.policy,p.id,p.id,true).verified,true);
  const healthy = spawnSync(php,[f.file],{encoding:'utf8',timeout:10000});
  assert.match(healthy.stdout,/healthy fixture/);
}));

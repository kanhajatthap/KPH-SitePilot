#!/usr/bin/env node
/** Experimental host-only recovery. Never imports/boots WordPress or executes source. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const MAX = 65536;
const fail = code => { throw new Error(code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
function canonical(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || path.resolve(p) !== p || fs.realpathSync(p) !== p) fail('UNSAFE_PATH');
  return p;
}
function readRegular(p, max = MAX, privateMode = false) {
  const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > max || (stat.mode & 0o022) || (privateMode && ((stat.mode & 0o077) || stat.uid !== process.getuid()))) fail('UNSAFE_FILE');
    const bytes = Buffer.alloc(max + 1); const size = fs.readSync(fd, bytes, 0, max + 1, 0);
    if (size > max) fail('FILE_TOO_LARGE');
    return { bytes: bytes.subarray(0, size), stat };
  } finally { fs.closeSync(fd); }
}
function target(policy, relative) {
  if (typeof relative !== 'string' || !/^wp-content\/(themes|plugins)\/[a-zA-Z0-9_-]+\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(php|js|css)$/.test(relative) || relative.includes('\n') || /config|secret|credential|password|private|vendor|node_modules|kph-sitepilot|wp-agent-bridge/i.test(relative) || !policy.allowedFiles.includes(relative)) fail('FILE_NOT_ALLOWED');
  let p = policy.root;
  for (const part of relative.split('/')) {
    p = path.join(p, part); const st = fs.lstatSync(p);
    if (st.isSymbolicLink() || (st.mode & 0o022)) fail('UNSAFE_PATH');
  }
  canonical(p); return p;
}
function load(policyPath) {
  if (process.platform !== 'linux' || typeof process.getuid !== 'function') fail('LINUX_REQUIRED');
  const p = JSON.parse(readRegular(canonical(policyPath), MAX, true).bytes.toString('utf8'));
  if (p.version !== 1 || p.environment !== 'staging' || p.enabled !== true || !Array.isArray(p.allowedFiles) || !p.allowedFiles.length || p.allowedFiles.length > 100) fail('STAGING_POLICY_REQUIRED');
  canonical(p.root); canonical(p.vault);
  if (!Array.isArray(p.publicRoots) || !p.publicRoots.includes(p.root) || p.publicRoots.length > 20) fail('PUBLIC_ROOTS_REQUIRED');
  for (const served of p.publicRoots) { canonical(served); if (inside(p.vault, served)) fail('PRIVATE_VAULT_REQUIRED'); if (inside(policyPath, served)) fail('PRIVATE_POLICY_REQUIRED'); }
  if (inside(p.vault, p.root) || inside(p.root, p.vault)) fail('PRIVATE_VAULT_REQUIRED');
  const root = fs.statSync(p.root); const vault = fs.statSync(p.vault);
  if (!root.isDirectory() || !vault.isDirectory() || (root.mode & 0o022) || (vault.mode & 0o077) || vault.uid !== process.getuid() || root.dev !== vault.dev) fail('UNSAFE_VAULT');
  const key = readRegular(path.join(p.vault, 'key'), 32, true).bytes;
  if (key.length !== 32) fail('KEY_INVALID');
  return { p, key };
}
function seal(record, key) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('sitepilot-host-recovery-v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}
function open(bytes, key) {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from('sitepilot-host-recovery-v1')); decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  } catch { fail('BACKUP_UNUSABLE'); }
}
function durableFile(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { let offset = 0; while (offset < bytes.length) {
    const n = fs.writeSync(fd, bytes, offset, bytes.length - offset); if (!n) fail('WRITE_FAILED'); offset += n;
  } fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function syncDir(dir) { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function locked(p, action) {
  const lock = path.join(p.vault, '.recovery-lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); } catch { fail('RECOVERY_BUSY'); }
  try { return action(); } finally { fs.rmdirSync(lock); }
}
/** Read-only admission check. Does not create a lock, backup or temporary file. */
export function preflight(policyPath, relative) {
  const { p, key } = load(policyPath);
  try { fs.lstatSync(path.join(p.vault, '.recovery-lock')); fail('RECOVERY_BUSY'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const file = target(p, relative); const first = readRegular(file);
  const vault = fs.statSync(p.vault);
  if (first.stat.dev !== vault.dev) fail('CROSS_DEVICE');
  if (first.stat.uid !== process.getuid() || first.stat.gid !== process.getgid() || (vault.mode & 0o2000)) fail('RESTORE_OWNERSHIP_MISMATCH');
  // access() is only a current permissions check, not a write/durability test.
  fs.accessSync(p.vault, fs.constants.W_OK | fs.constants.X_OK);
  fs.accessSync(path.dirname(file), fs.constants.W_OK | fs.constants.X_OK);
  const probe = { probe: 'host-recovery-preflight-v1' };
  if (open(seal(probe, key), key).probe !== probe.probe) fail('ENCRYPTION_UNAVAILABLE');
  const second = readRegular(target(p, relative));
  if (first.stat.ino !== second.stat.ino || first.stat.dev !== second.stat.dev || hash(first.bytes) !== hash(second.bytes)) fail('FILE_CHANGED');
  return { version: 1, readyForBackup: true, fileChanged: false, backupCreated: false,
    executionAllowed: false, file: relative, sha256: hash(second.bytes), bytes: second.bytes.length,
    unverified: ['staging-isolation', 'web-server-vault-exposure', 'actual-write-and-fsync', 'wordpress-health', 'opcache-restart'] };
}

export function prepare(policyPath, relative, afterHash) {
  if (typeof afterHash !== 'string' || !/^[a-f0-9]{64}$/.test(afterHash) || afterHash.length !== 64) fail('AFTER_HASH_REQUIRED');
  const { p, key } = load(policyPath);
  return locked(p, () => {
    const file = target(p, relative); const { bytes, stat } = readRegular(file);
    if (stat.dev !== fs.statSync(p.vault).dev) fail('CROSS_DEVICE');
    const id = randomBytes(16).toString('hex');
    const record = { version: 1, id, root: p.root, rootDev: fs.statSync(p.root).dev, rootIno: fs.statSync(p.root).ino,
      relative, beforeHash: hash(bytes), afterHash, before: bytes.toString('base64'), mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid };
    const out = path.join(p.vault, `${id}.backup`);
    durableFile(out, seal(record, key)); syncDir(p.vault);
    const check = open(readRegular(out, 100000, true).bytes, key);
    if (check.id !== id || hash(Buffer.from(check.before, 'base64')) !== record.beforeHash) fail('BACKUP_UNVERIFIED');
    return { id, beforeHash: record.beforeHash, afterHash, backupVerified: true, fileChanged: false };
  });
}
export function restore(policyPath, id, confirmation, apply = false) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || id.length !== 32 || confirmation !== id) fail('CONFIRMATION_REQUIRED');
  const { p, key } = load(policyPath);
  return locked(p, () => {
    const r = open(readRegular(path.join(p.vault, `${id}.backup`), 100000, true).bytes, key);
    const root = fs.statSync(p.root);
    if (r.version !== 1 || r.id !== id || r.root !== p.root || r.rootDev !== root.dev || r.rootIno !== root.ino) fail('WRONG_TARGET');
    const file = target(p, r.relative); const before = Buffer.from(r.before, 'base64');
    if (before.length > MAX || hash(before) !== r.beforeHash) fail('BACKUP_UNUSABLE');
    const current = readRegular(file);
    if (hash(current.bytes) !== r.afterHash) fail('FILE_CHANGED');
    if (current.stat.dev !== fs.statSync(p.vault).dev || current.stat.uid !== r.uid || current.stat.gid !== r.gid) fail('TARGET_METADATA_CHANGED');
    if (!apply) return { verified: true, dryRun: true, fileChanged: false, id };
    let tmp = path.join(p.vault, `${id}-${randomBytes(6).toString('hex')}.restore`);
    try {
      durableFile(tmp, before);
      const temp = fs.statSync(tmp);
      if (temp.uid !== r.uid || temp.gid !== r.gid) fail('RESTORE_OWNERSHIP_MISMATCH');
      fs.chmodSync(tmp, r.mode);
      const recheck = readRegular(target(p, r.relative));
      if (recheck.stat.ino !== current.stat.ino || recheck.stat.dev !== current.stat.dev || hash(recheck.bytes) !== r.afterHash) fail('FILE_CHANGED');
      fs.renameSync(tmp, file); tmp = null; syncDir(path.dirname(file)); syncDir(p.vault);
      if (hash(readRegular(file).bytes) !== r.beforeHash) fail('RESTORE_UNVERIFIED');
      return { verified: true, dryRun: false, fileChanged: true, id, sha256: r.beforeHash };
    } finally { if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  });
}
// Strict local CLI: no server, child process, WordPress loading, or arbitrary command.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, policy, value, confirmation, flag] = process.argv.slice(2);
    if (!policy || process.argv.length > 7) fail('USAGE');
    let result;
    if (command === 'preflight' && value && !confirmation && !flag) result = preflight(policy, value);
    else if (command === 'prepare' && !flag) result = prepare(policy, value, confirmation);
    else if (command === 'restore' && (!flag || flag === '--apply')) result = restore(policy, value, confirmation, flag === '--apply');
    else fail('USAGE');
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = /^[A-Z_]+$/.test(error.message) ? error.message : 'RECOVERY_FAILED';
    console.error(JSON.stringify({ error: code, verified: false })); process.exitCode = 1;
  }
}

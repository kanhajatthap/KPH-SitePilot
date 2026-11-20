# Experimental host-only recovery — isolated staging only

## Boundary

`tools/recovery/recovery.mjs` is a **local Linux / Node 22+ CLI**, never a WordPress
plugin, API, job tool, shell endpoint or remote supervisor. It does not load PHP,
WordPress, wp-config, the database or hosted service. It captures the original file
before a separately authorised change, then restores only if the current bytes
match the predeclared candidate SHA-256. It does not apply candidate changes.

This is a testable recovery foundation, not automatic WordPress crash recovery.
It does NOT decrypt the PHP engine's option backups: its independent encrypted
backup must be prepared **before** changing a file. Lost key/vault means recovery
is unavailable. Keep a full hosting backup separately. No production use certified.

## Preconditions (operator verifies)

- Disposable isolated staging with no production database/service connections.
- Linux filesystem; Windows and macOS are deliberately refused. Do not point a
  container/WSL policy at an untested host-mounted filesystem.
- Node 22+, host console access, and the same OS uid/gid as the original file.
- A private vault, mode 0700, outside **all** web-served roots, on the same device
  as the target. List every actual document root in `publicRoots`; the utility
  cannot discover hosting aliases. Verify non-exposure at the web-server level.
- Stop file deployments, editors and PHP workers during restore. Directory lock
  coordinates this helper only. Uncooperative writers can still race; local hostile
  administrators are outside the threat model.
- Identify one exact existing theme/plugin PHP, JS or CSS file (64 KiB maximum).
  Core, config, secrets, symlinks, hard links and writable-by-other paths are refused.

## Provision outside the website/repository

Create a host-private vault and a 0600 JSON policy. Example paths below are examples
only: replace them with verified canonical absolute paths on your test host.

```json
{
  "version": 1,
  "enabled": true,
  "environment": "staging",
  "root": "/srv/disposable-wordpress",
  "vault": "/srv/private-sitepilot-recovery",
  "publicRoots": ["/srv/disposable-wordpress"],
  "allowedFiles": ["wp-content/themes/test-child/functions.php"]
}
```

The policy's staging label is an operator assertion, NOT independent proof of site
isolation. The helper never opens wp-config or starts WordPress to infer it.

Generate the 32-byte AES-GCM key once in the vault, without printing it:

```bash
node -e "require('node:fs').writeFileSync('/srv/private-sitepilot-recovery/key',require('node:crypto').randomBytes(32),{flag:'wx',mode:0o600})"
```

Do not commit or upload the policy, key, vault, source backup or database credentials.
Do not put the helper behind a web handler. This runbook does not enable SitePilot
file-editing tools or bypass their release gates.

## Read-only preflight before creating backups

After provisioning the private key, policy and allowlist, run on the test host:

```bash
node tools/recovery/recovery.mjs preflight /srv/private-policy.json wp-content/themes/test-child/functions.php
```

This command reads only. It checks policy/key permissions, known public roots,
regular-file/path restrictions, same-device storage, current target uid/gid,
cooperative lock absence, current directory access and an in-memory AES-GCM
round-trip. It reads the target again to detect observed identity/hash changes.
No backup, lock, temporary file, candidate edit, network request or PHP process is
created. It refuses `--apply` and never prints source, keys or absolute host paths.

A successful JSON report means **readyForBackup**, not ready for execution or
verified recovery. It explicitly lists unresolved checks: actual staging isolation,
web-server aliases/vault exposure, actual write/fsync behaviour, WordPress health
and OPcache restart. OS access checks cannot detect disk-full conditions or prove
future write success. A concurrent external writer can still race after preflight;
prepare/restore must perform their own checks.

A failed report exits nonzero with a generic safe code. Do not remove a recovery
lock merely to obtain a green result. Native CI exercises this command on fixtures;
the real host still needs its own preflight and end-to-end acceptance.

## Capture and validate BEFORE any test edit

Obtain the SHA-256 of the reviewed candidate bytes without executing them. Then:

```bash
node tools/recovery/recovery.mjs prepare /srv/private-policy.json wp-content/themes/test-child/functions.php CANDIDATE_SHA256
```

`CANDIDATE_SHA256` must be replaced by the exact 64-character lowercase digest.
Preparation writes an exclusive AES-256-GCM encrypted snapshot, fsyncs it, decrypts
and verifies it, and returns a random `id` and hashes. It never changes the target.
Save that ID privately. A verified backup does not make the candidate safe to run.

## Recovery after an authorised change

Use the real backup ID twice; dry-run is the default:

```bash
node tools/recovery/recovery.mjs restore /srv/private-policy.json BACKUP_ID BACKUP_ID
node tools/recovery/recovery.mjs restore /srv/private-policy.json BACKUP_ID BACKUP_ID --apply
```

Restore verifies the encrypted record, exact root inode/device, allowlist, original
hash, expected live after-hash, ownership and file identity; stages privately;
renames atomically; fsyncs directories; and checks the restored bytes. Later edits
are not silently overwritten. No force option exists. A second restore normally
refuses because the expected after-hash is no longer present.

After file verification, restart PHP workers/clear OPcache through your hosting
controls (this Node process cannot invalidate another process's OPcache), then
verify the site manually. `verified:true` means **file bytes verified**, not site
health, database repair, cache purge or durability under every power-loss scenario.

Errors fail closed and do not print source/key material. `RESTORE_UNVERIFIED` may
mean rename already happened; stop and inspect via trusted host tools. The encrypted
backup remains. After a killed helper, `.recovery-lock` may remain: do not remove it
until you have proved no restore process is alive. No automatic lock stealing.

## Tests you can run without connecting test.local

```bash
node --test tools/recovery/recovery.test.mjs
REQUIRE_PHP_RECOVERY_TEST=1 node --test tools/recovery/recovery.test.mjs
```

The first command runs filesystem fixtures in temporary directories and cleans up.
The second requires native PHP for a **fixed** runtime-fatal fixture, then restores
its known-good bytes without WordPress. It never loads your site or arbitrary
submitted PHP. Missing PHP is an explicit skip in the first command, a failure in
the second. These are not live WordPress tests.

Real acceptance still pending: perform CSS/JS/PHP edit → host restore → PHP cache
restart → site health checks on an accessible authorised isolated WordPress host.
`http://test.local` on the owner's machine is not reachable from Arena. Do not
expose wp-admin publicly just to run this fixture suite.

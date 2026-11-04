# Restricted staging file editor — experimental engine, NOT shipped

## Owner decision and current status

On 2026-11-04 the owner selected the restricted-file-editor option: selected
staging theme/plugin PHP/JS/CSS files, not SQL/shell/WP-CLI or full filesystem access.
This changes the development priority, not the live connector's allowlist.

**This batch implements only the backend engine and isolated tests.**
`KPH_SP_Restricted_Files` is not required by the plugin bootstrap, has no admin UI,
REST handler or registered job tool, and does not run on plugin activation.
A connected WordPress site cannot use this editor from chat yet. The shipped tool
catalog remains unchanged. Do not manually wire this prototype into a real site.

## Implemented engine contract

- Every call requires `wp_get_environment_type() === staging`, explicit boolean
  operator opt-in, manage_options plus edit_themes/edit_plugins capabilities.
  Multisite and WordPress DISALLOW_FILE_EDIT / DISALLOW_FILE_MODS are refused.
- `KPH_SP_RESTRICTED_FILE_PATHS` is an **exact file allowlist**, not a folder glob.
  Only existing regular PHP/JS/CSS under themes/<slug> or plugins/<slug> qualify.
  No new files, deletes, uploads, core files, config files or arbitrary paths.
- Path traversal, URL schemes, encoded paths, hidden names, symlink components,
  hard-linked files, world-writable components, sensitive names and dependency
  folders are denied. The connector/legacy bridge itself cannot be edited.
- Files are bounded at 64 KiB, valid UTF-8 and no NUL. Conservative sensitive-text
  checks refuse credential-like identifiers; these are heuristics, not DLP proof.
- `read(relative)` returns bytes and SHA-256 to the authorised caller.
- `propose(relative, candidate, expectedHash)` checks the original hash, parses PHP
  syntax without evaluating it, and encrypts an immutable expiring proposal.
  It returns before/after content and hashes for a future **escaped** review UI.
- `apply(id, confirmation)` demands the exact random proposal id (not just CONFIRM),
  proposal ownership, a ten-minute TTL, current-file hash and exclusive advisory
  lock. The candidate comes from encrypted storage, not an apply request parameter.
- Before writing, an encrypted backup must persist and decrypt/read back identically.
  Both records use AES-256-GCM with random IV and key derived from WordPress auth
  salt; options are non-autoload. Salt changes make existing records unreadable.
- A private operator-supplied `KPH_SP_FILE_WORKSPACE` must be outside known web roots,
  owner-only permissions and on the target filesystem. This avoids plaintext temp
  source in the theme/plugin web directory. The engine does not create this directory.
  Its lack of web exposure still needs deployment-specific verification.
- Replacement is an atomic rename, not live-file truncation; file mode is preserved
  and OPcache invalidated when available. Read-back hash must match, otherwise the
  operation fails as unverified. Temporary files are cleaned up in finally.
- `restore(backupId, confirmation)` requires the same staging/capability/owner gates
  and current after-hash, so later legitimate edits are not silently overwritten.
  Backup records remain encrypted; automatic retention/cleanup is not implemented.

## Important limits — do not claim safety beyond evidence

1. Editing PHP/JS can cause execution when WordPress/browser subsequently loads it.
   Syntax validation cannot detect fatal runtime errors, infinite loops, malicious
   logic, dependency conflicts or data exfiltration. This is privileged source
   editing, not a safe arbitrary-code sandbox.
2. No health-probe / out-of-process recovery supervisor is implemented. A valid PHP
   change can break WordPress so its own plugin cannot execute restore. Independent
   hosting-level recovery and a full staging backup are release prerequisites.
3. Advisory locks coordinate cooperative writers only. External deployers or local
   actors can ignore them; double hash/path/inode checks reduce but do not eliminate
   all TOCTOU risks. Concurrent real-host filesystem tests remain required.
4. The environment check relies on WordPress configuration. A production clone
   pointing at production services must not be treated as safe staging simply by
   changing its environment label. Isolation needs owner verification.
5. The engine does not implement hosted user ownership, HMAC job delivery, catalog
   risk floors, site scopes, nonce/CSRF endpoints, central audit, editor UI, backup
   retention, a usage quota or fleet release/version negotiation. It has no endpoint
   precisely because those boundaries have not been completed.
6. Plan/backups are encrypted in WordPress options. Recovery depends on preserving
   auth salt material and that database; this is not a full site/database backup.
7. JS/CSS previews must remain isolated; never insert raw source into dashboard DOM.
   Hosting permissions, Windows/filesystem semantics and WordPress runtime behaviour
   have not been certified by fixture tests.

## Release sequence (pending)

1. Integrate canonical R3 specs, server-side staging + ownership gates, signed jobs,
   per-site opt-in/capabilities and version compatibility; do not weaken broad bans.
2. Add source review/diff UI, confirmation bound to saved proposal/hash and safe error
   mapping. Add per-owner request/nonces and audit records; never log source contents.
3. Add bounded encrypted backup retention and a tested external recovery mechanism.
4. Run native PHP/WordPress integration tests and filesystem concurrency/fault cases.
5. On an authorised isolated staging site, edit then verify and restore CSS, JS and
   PHP; exercise a syntactically valid runtime-fatal candidate with independent
   recovery. Never use production for this acceptance test.
6. Only then consider enabling the tool, updating the shipped catalog, bumping plugin
   version and releasing its ZIP. Keep arbitrary SQL/shell/WP-CLI and production
   source editing out of this scope.

## Test commands

From repo root, with PHP 8.2 available:

```bash
php wordpress/kph-sitepilot-connector/tests/test-restricted-files.php
KPH_TEST_MODE=disabled php wordpress/kph-sitepilot-connector/tests/test-restricted-files.php
KPH_TEST_MODE=mods-disabled php wordpress/kph-sitepilot-connector/tests/test-restricted-files.php
```

Tests create temporary filesystem fixtures and fake WordPress option/capability
functions, then clean up. They never connect to a site or execute the candidate PHP.
CI runs these separately from plugin static/protocol checks. The local sandbox can
also use an externally installed PHP WASM CLI for execution; that is not native
WordPress integration or proof of real-host locking/durability.

## Local validation — 2026-11-04

- Full `pnpm release:check`: **8/8 gates passed**, **974 tests / 100 files**.
- PHP parser: **17 files passed** (PHP 7.4 grammar).
- External PHP 8.5 WASM runtime: engine **48 assertions**, disabled mode **1**,
  file-modifications-disabled mode **1**; all passed. Hard-link test explicitly
  skipped because that filesystem does not support hard links.
- Same WASM runtime: connector static **240 assertions**, protocol **27 assertions
  across 4 fixtures**, legacy bridge static checks passed.
- These are local results, not native PHP 8.2 CI results. Native CI, real WordPress,
  concurrency/fault injection and independent recovery acceptance remain pending.
- No connected-site configuration, database migration or production rollout was
  performed for this batch.

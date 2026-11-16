# Restricted staging file editor — experimental engine, NOT shipped

## Owner decision and current status

On 2026-11-04 the owner selected the restricted-file-editor option: selected
staging theme/plugin PHP/JS/CSS files, not SQL/shell/WP-CLI or full filesystem access.
This changes the development priority, not the live connector's allowlist.

**The engine remains experimental. A later batch adds a metadata-only hosted review ledger/endpoint, not file execution.**
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

## Follow-up hardening — 2026-11-04

- Reject anonymous user IDs even if a capability filter erroneously allows them.
- Refresh filesystem metadata on each resolution and reject a world-writable
  content root, not only world-writable children.
- Read at most 64 KiB + 1 byte from an opened handle; compare its device/inode to
  the live path before and after reading. This bounds allocation if an external
  writer grows a file after the size check. It is not a filesystem snapshot and
  does not eliminate races with non-cooperative writers.
- Added boundary-size, invalid UTF-8, anonymous-user and content-root permission
  fixtures, plus restore refusal for wrong owner/confirmation and rotated salts.
- Local PHP 8.5 WASM: **57 engine assertions + 2 disabled-mode assertions passed**;
  hard-link test remains explicitly skipped. PHP parser: **17 files passed**.
  Focused dashboard governance/release-boundary checks: **23 tests / 2 files passed**.
- Hosted integration and independent runtime-fatal recovery remain pending; no
  bootstrap, catalog, endpoint or activation changes are included.
- Follow-up full `pnpm release:check`: **8/8 gates passed**, **974 tests / 100 files**.

## Experimental hosted review contract (initial foundation)

`packages/contracts/src/restricted-editor.ts` defines strict source-free approval
and persisted-proposal shapes and a pure review preflight. It is deliberately not
exported from the default package entrypoint or registered in the tool catalog.
The later metadata review endpoint imports its schema through an explicit experimental subpath. An unconditional execution gate returns `FILE_EDITOR_NOT_RELEASED`.

The preflight binds site/owner/proposal IDs, exact path allowlist, R3 risk,
before/after digests, typed proposal confirmation, current digest and a maximum
ten-minute lifetime. Timestamps in this hosted contract are epoch milliseconds
(the PHP engine uses epoch seconds; a future adapter must explicitly convert).
Consumed/revoked/expired/future proposals and unknown request fields are refused.
A successful preflight means **review only**, never permission to enqueue a job.

The context must be assembled from authenticated server-side lookups and trusted
connector state, not deserialized from a client request. The experimental protocol
label is a required contract version, not proof of attestation or an existing plugin
capability. This module does not provide RLS, CSRF, HMAC verification, connector
capability discovery, database persistence, atomic approval consumption, snapshot
creation, backup freshness or independent recovery. All remain integration gates.

Source content is excluded from these request shapes; source review still needs a
separate owner-authorized escaped UI and encrypted storage. No request was sent to
the owner's local WordPress site and no database or deployment was changed.

Local validation: full `pnpm release:check` **8/8 gates passed**,
**1013 tests / 101 files**, including **39 new review-contract tests**.
These are contract/unit checks, not real WordPress or hosted approval E2E evidence.


## Metadata review persistence and endpoint

Migration `20261104130000_restricted_file_reviews.sql` adds a source-free ledger:
immutable proposal metadata, R3-only risk, ten-minute maximum TTL, owner/site RLS,
and terminal consumed/revoked states. Authenticated users cannot insert or update
rows directly. Trusted ingestion is **not implemented**; no real proposals are
created by the application yet. Do not seed real proposals manually to enable editing.

`POST /api/connector/restricted-files/review` requires a hosted session, explicit
same-origin JSON request, strict approval schema and a body of at most 2 KiB.
The session-bound RPC checks live ownership, active staging status, matching hashes,
confirmation and expiry, then consumes the pending record atomically. A replay
returns a conflict. The RPC serializes against site/project changes and the same
proposal update. Review success explicitly returns `executionAllowed: false`.

**This is a review receipt, not operational file approval.** The endpoint does not
run the full review preflight or attest operator opt-in, connector version, allowed
paths or current filesystem hashes. Those require future signed connector ingestion
and revalidation before any write. No job/snapshot is created, no source is exposed,
and the PHP engine stays unbootstrapped. UI, source retention, external recovery and
real WordPress E2E remain pending. The ledger is not a complete central audit trail.

The migration has NOT been applied remotely. Without it the endpoint fails closed
with a generic 503. It must be tested/applied on an authorised staging database
before use. Supabase database CI now also runs on PRs touching migrations/tests.

Validation for this batch:
- 14 endpoint unit tests passed (mocked session/RPC, not live authentication).
- Full release check: 8/8 gates passed; 1,027 tests / 102 files.
- Optional isolated PGlite 0.3.14 smoke: 12 assertions passed on a minimal schema,
  including role privileges, RLS isolation and single-use consumption.
- 15 pgTAP database assertions added; full local Supabase/pgTAP and real concurrent
  transactions NOT run here (no Docker/Postgres executable). PR CI remains required.
- No remote migration, WordPress request, deployment, push or merge performed.


## Signed ingestion and source review batch

This section supersedes the earlier metadata-only implementation status, not its
execution boundary. The shipped catalog and plugin bootstrap remain unchanged.

### Implemented connected review path

1. The experimental PHP engine exposes `review_payload` and `submit_review`.
   Both require the saved proposal ID/confirmation and re-run staging, opt-in,
   permissions, path and current-hash checks. The sender uses the existing signed
   connector transport. **No activation hook or chat tool invokes these methods.**
2. `POST /api/connector/restricted-files/ingest` authenticates HMAC over the raw
   bounded body, timestamp and single-use nonce, then requires files/code scopes.
   Purpose, protocol and engine version are exact literals. Source hashes,
   allowlist, capability assertions, opt-in and staging claims must match. Owner
   identity is derived from the database, never the submitted payload.
3. The new migration `20261104140000_restricted_review_ingestion.sql` atomically
   saves immutable metadata and encrypted source evidence. Active staging and
   project ownership are resolved under row locks. Duplicate IDs cannot replace
   source. Browser SQL cannot read ciphertext or mint evidence.
4. The ingestion response returns a same-origin `reviewPath`. The
   `/restricted-review?siteId=…&proposalId=…` page loads source through an
   authenticated owner/RLS-gated endpoint. It displays hashes, expiry, R3 warnings,
   and text-only before/after comparison with differing aligned lines highlighted.
   This is not a semantic diff; inserted lines shift subsequent comparisons.
5. Typed full-ID confirmation records the existing single-use receipt. The SQL
   RPC now additionally requires fresh signed evidence and live files/code scopes,
   so calling it directly cannot bypass freshness. No jobs or snapshots are created.

### Freshness, privacy and recovery limits

- Evidence must be observed no more than **60 seconds** ago (future timestamps
  refused). Its deadline is the earlier of observation + 60 seconds and proposal
  expiry. A stale/used review requires a new proposal, not refreshing old authority.
- This is the latest signed file observation, **not an on-demand read at the exact
  approval instant**. A file can change after observation. Execution stays disabled;
  any later execution implementation must recheck on WordPress immediately before
  writing and independently verify recovery readiness.
- Compatibility is the explicit `restricted-files-v1` / engine version 1 contract,
  not a claim that every installed connector supports the experimental engine.
- Signed connector assertions establish possession of the site secret, not proof
  against a compromised WordPress host. Hosted ownership and staging gates still apply.
- AES-GCM source ciphertext binds site, proposal, path and digests inside the
  encrypted payload. Source is never placed in metadata, URL, audit or error messages.
  Owner-only source responses are no-store. Conservative sensitive-text checks are
  not complete DLP. Existing daily cleanup purges expired ciphertext; with healthy
  cron, physical retention is up to approximately one day, not precisely 60 seconds.
- Sources become unavailable immediately on expiry even before cleanup. Key loss
  makes them unreadable. This is a review store, not independent crash recovery.
- No remote migration or real WordPress request was performed. Apply migrations
  only to an authorised staging target after native database CI. Without the latest
  migration, new ingestion fails closed; coordinate deployment migration-first.
- A new source-review page does NOT activate the PHP engine or provide a UI for
  arbitrary candidate submission. Real-host setup/acceptance and independent
  recovery are still release gates before enabling editor tools.

### Local batch evidence

- Full release check: **8/8 gates**, **1,055 tests / 105 files** passed.
- Signed ingestion, owner-only source endpoint and safe source rendering: 28 new
  tests; existing review endpoint tests remain passing.
- Full migration-chain WASM smoke: **55 assertions passed**, using minimal auth
  and assertion shims, not native Supabase/pgTAP or concurrency proof.
- PHP 8.5 WASM: **61 engine assertions + 2 disabled-mode assertions** passed;
  hard-link fixture explicitly skipped on that filesystem. Native PHP CI pending.
- No browser end-to-end or real WordPress edit/restore test was performed.

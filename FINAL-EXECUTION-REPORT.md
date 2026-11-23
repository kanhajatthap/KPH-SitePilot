# Four-day execution handover — controlled pilot

## 1. Executive summary

**Recommendation: NO-GO.** Mandatory MySQL/PHP-FPM/HTTP/OPcache and real-auth browser gates remain **BLOCKED**. This session completed the safely executable independent work and preserved reproducible state; it did not run unattended for four days.

Implemented safer disposable test infrastructure, failure-backup retention, redacted evidence generation, and cleanup resilience. Verified native SQL/RLS/concurrency, host-byte recovery, portable WordPress recovery, compiled browser fixtures and full release regression. No production/staging deployment, remote migration, pilot activation, push, PR or merge was performed. No host-network/public test service was exposed.

## 2. Baseline, tested commit and branch

- Branch: `arena/6e110001-kph-sitepilot`.
- Baseline: `45e032ab0cbc2186c074055d9f502ca4077804f4` (PR50 merge).
- Initial Git status: clean; no user modifications to preserve.
- Implementation/tested commit: **`30d1bb1127ea3a160c2ce0177a671ccec0be806d`** — `test: isolate recovery fixtures and preserve acceptance evidence`.
- Final handover/evidence is a separate documentation-only local commit; its hash is available through `git log -1 --format=%H`. It does not change tested executable code.
- No branch switching/reset or remote Git writes.

Session date supplied to the agent is 2026-11-04. Machine-recorded timestamps differ; `verification-summary.json` explicitly labels its timestamp `recordedAtSandboxClock` rather than silently treating it as the user's calendar date.

## 3. Day-wise acceptance matrix

| Workstream | Status | Actual evidence / limit |
|---|---|---|
| Day 1 baseline and dependency inspection | PASS | Clean branch, frozen-lockfile installation, existing runners inspected |
| Docker/MySQL/FPM/nginx runtime | BLOCKED | Docker/PHP/MySQL executables absent; Docker preflight exits 2 with DOCKER_UNAVAILABLE |
| Image immutable digest inventory | BLOCKED | Declared tags recorded; no image was pulled/run; digest fields are null |
| Harness environment guards/isolation configuration | PASS | Unit/structural checks and YAML parse; not live container isolation proof |
| Day 2 independent CSS/JS/PHP byte recovery | PASS | Preflight → encrypted prepare → edit → dry-run → restore → independent original SHA-256 |
| Real WordPress + SQLite under PHP WASM | PASS | 25 assertions including fixed runtime-fatal fixture and fresh-process bootstrap after restore |
| Native PHP/FPM/MySQL HTTP health and OPcache restart | BLOCKED | Required runtime absent; no HTTP/OPcache success claimed |
| Day 3 native SQL/RLS/receipt concurrency | PASS | 55 pgTAP assertions + 29 custom checks on actual PostgreSQL; explicit auth identity shim |
| Actual Supabase Auth/PostgREST browser acceptance | BLOCKED | Disposable stack unavailable; no remote project substituted |
| Compiled browser API-fixture acceptance | PASS | 11 scenarios in separate network namespace; no host listening ports |
| Timed JWT expiry/refresh, HTTPS cookie behavior | NOT TESTED | Fixture browser and identity shim cannot verify these |
| Day 4 full release regression | PASS | 8/8 gates; 1,070 tests across 108 files |
| Real executed-write audit/disable switch acceptance | NOT TESTED | Only metadata consumption and in-flight revocation ordering tested; dispatch remains off |
| Hosted disposable staging verification | BLOCKED | No reachable authorized staging environment used |
| Current remote account/migration/deployment audit | NOT TESTED | No new remote queries this session; earlier account restrictions are historical, not freshly verified |

## 4. Implemented changes

### Disposable HTTP recovery harness

- **Vault isolation:** FPM and nginx no longer mount the entire fixture root. They do not receive the independent vault/key or root database password. FPM receives only the site, application DB credential, installer and runtime marker directory.
- **Docker selection guard:** rejects `DOCKER_HOST`/`DOCKER_CONTEXT` overrides and non-Unix endpoints before provisioning; pins the inspected local context. Inherited Compose/credential variables are stripped; explicit empty interpolation file prevents accidental configuration inheritance.
- **Evidence and cleanup:** failure retains generated private vault/site/diagnostics; cleanup errors cannot yield PASS. Success removes generated secrets/site but retains redacted evidence. Marker/project checks prevent cleanup from proceeding on a mismatched fixture.
- **Fatal verification:** requires a healthy direct FPM probe, exact HTTP 500 and a fixed fatal shutdown marker. Generic nginx 502/503 no longer counts as proof of a PHP fatal.
- **OPcache verification:** configured phase checks actual FPM SAPI and enabled OPcache/timestamp mode before asserting stale behavior. Still runtime-BLOCKED here.
- **Provenance:** future real runs record image IDs/available repository digests, phase statuses, HTTP response hashes and original/restored file hashes. No fabricated digests for this run.
- **Diagnostics:** raw failed subprocess output is confined to an owner-only temporary log; never printed or committed. Completed safe assertions are incrementally recorded in `checks.jsonl`.

### Authentication runner and independent verification

- Cleanup attempts all generated resources despite an earlier cleanup failure; redacted labels/statuses and nonzero exit status report failure.
- Project deletion requires confirmed successful creation, not merely allocation of a UUID.
- Native PostgreSQL tests cover consumers waiting behind revocation and revocation waiting behind an already-authorized transaction. After revocation commits, pending consumption is refused. Revocation does not pretend to undo an earlier receipt.
- Added network-namespace browser wrapper: only loopback, no forwarding/veth/public port, unprivileged browser, no dotenv credentials. No publicly exposed fallback.
- Added reusable host-byte evidence runner and persisted exact SHA-256 evidence.

### Files

Executable/test changes:
- `tests/wordpress/http/{compose.yml,run.mjs,phases.mjs,safety.mjs,safety.test.mjs}`
- `tests/browser/{cleanup.mjs,cleanup.test.mjs,real-auth-review.mjs,isolated-review.mjs}`
- `tests/database/native-review.mjs`
- `tests/recovery/byte-evidence.mjs`
- `apps/dashboard/tests/host-recovery.test.mjs`

Documentation/evidence:
- `TASKS.md`, `PROGRESS.md`, `FINAL-EXECUTION-REPORT.md`
- `tests/wordpress/http/README.md`, `tests/browser/{real-auth-review.md,isolated-review.md}`, `tests/database/README.md`
- `docs/pr50-task-history.md` preserves previous branch checklist
- `docs/evidence/fourday/*` contains redacted current-run outputs and hashes

No production application logic, database migration, permission-repair command or execution flag was added/changed in this batch.

## 5. Actual commands and results

| Command | Status | Output |
|---|---|---|
| `pnpm install --frozen-lockfile` | PASS | Dependencies installed without manifest/lock changes |
| `pnpm release:check` | PASS | `Release check: 8/8 gates passed.` |
| `node --test tools/recovery/recovery.test.mjs` | PASS | 19 passed, 0 failed; native PHP case skipped/BLOCKED |
| `node --test tests/wordpress/http/safety.test.mjs tests/browser/cleanup.test.mjs` | PASS | 11 passed, 0 failed |
| `node tests/recovery/byte-evidence.mjs` | PASS | Three cases, restoredHash equals originalHash; dry-run preserves changed bytes |
| `PGTAP_SOURCE=/tmp/fourday-pgtap/sql/pgtap.sql.in node tests/database/native-review.mjs /tmp/fourday-runtime/node_modules` | PASS | 55 pgTAP assertions + 29 custom checks; runner reports 33 aggregate checks including four SQL-file summaries |
| `WP_TEST_SOURCES=/tmp/fourday-wp-sources.json PHP_BIN=/tmp/fourday-runtime/node_modules/.bin/php-wasm-cli node tests/wordpress/recovery-acceptance.mjs` | PASS | `WORDPRESS_ACCEPTANCE_OK 25 assertions; ... PHP=WASM` |
| Isolated browser command in section 11 | PASS | 11 scenarios; process exit 0; host listening/new ports empty |
| `node tests/wordpress/http/run.mjs` | BLOCKED | Exit 2: `{"status":"BLOCKED","code":"DOCKER_UNAVAILABLE"}`; no fixture provisioned |
| Node syntax checks + Compose YAML parse | PASS | Changed runners parse; no published ports/internal network asserted |

Exact safe logs: `docs/evidence/fourday/{native-database.txt,wordpress-wasm.txt,host-recovery.txt,runner-guards.txt,release-summary.txt}`. Counts/tested commit: `verification-summary.json`. Original detailed local logs remain under `/tmp/fourday-*` and may not survive a restart.

The release script's generic Vercel auto-deploy message is not deployment evidence. Nothing was pushed or deployed.

## 6. Recovery SHA-256 evidence

Full before/changed/restored hashes: `docs/evidence/fourday/host-byte-recovery.json`.

| Fixture | Status | Original AND independently read restored SHA-256 |
|---|---|---|
| CSS | PASS | `7ada5a1234b13c6cafa63c438ae59e1a35173601906230c4b7508722aa1597f6` |
| JS | PASS | `16e895b69e0785335101f0fedd0eda77cb75ae5c0833736c2d19c78718ba053c` |
| PHP | PASS | `44a806e8343b91de1e70521e7b7c87646a1076a212060d4e05eda4c8e1e09a22` |

These prove bytes, not application/HTTP health. The separate PHP WASM WordPress test proves SQLite/bootstrap health in that runtime only. Native HTTP health/OPcache remain BLOCKED.

## 7. Authentication, concurrency, retention and audit

Native PostgreSQL uses actual transactions, roles and RLS, with a documented minimal `auth.uid()`/users shim. It verifies ownership transfer, non-owner isolation, hashes, scopes, expiry, replay, concurrent single-use, purge of expired ciphertext and retention of fresh evidence/metadata. It does not validate JWTs, refresh tokens or hosted sessions.

New in-flight ordering evidence shows: a committed revoke prevents a waiting consumer; an earlier authorized receipt transaction may finish before a waiting revoke. This is correct serialized metadata behavior, not cancellation semantics for a future file writer. No execution jobs are created by the tested receipt flow.

Complete executed-write auditing, operator disable behavior for actual file writes, timed source-erasure scheduling and production operator workflows remain NOT TESTED. Existing cleanup cadence may retain encrypted source beyond its short validity window.

## 8. Failures encountered and corrections

| Observation | Initial status | Correction / final status |
|---|---|---|
| Docker command missing | BLOCKED | Structured preflight exit; no repeated install/registry bypass attempts |
| Unprivileged read of `/proc/1/ns/net` denied | FAIL | Capture parent namespace ID before unshare; still require distinct namespace and loopback-only; corrected runs PASS |
| Over-broad FPM/web fixture mounts | NOT TESTED at runtime | Static review finding; narrowed mounts, regression structural test PASS; runtime isolation still BLOCKED |
| Failure cleanup discarded backups | NOT TESTED at Docker runtime | Unit tests exercise corrected helper with real temporary files; retention/cleanup tests PASS |
| One auth cleanup exception prevented later cleanup | NOT TESTED at provider runtime | Helper now continues; unit tests PASS; full provider cleanup BLOCKED |
| Any upstream 5xx accepted as fatal proof | NOT TESTED at runtime | Added direct probe/fatal marker/exact 500; syntax PASS, runtime BLOCKED |

No outstanding FAIL remains in executed final test suites. Missing acceptance is not converted to PASS.

## 9. Remaining risks and blockers

- Docker/native MySQL/PHP-FPM and permitted container-registry access required to run the primary HTTP harness. Fixed image tags alone are not immutable provenance or supported production recommendations.
- A Unix Docker socket could be manually forwarded to a remote daemon; operator must verify it is an isolated local engine. No unattended guard can establish that trust from URI syntax alone.
- Actual Supabase Auth/PostgREST and HTTPS/timed-session tests remain BLOCKED/NOT TESTED. Correct remote credentials are not a prerequisite for disposable local tests, but the local stack must exist.
- `test.local` is user-local; no access or hosting verification assumed.
- Prior reports mentioned Supabase project access and Vercel CPU restrictions; these were not freshly queried in this run. Separate current read-only audit is required before remote readiness claims.
- Host locks are cooperative; unrelated writers/deployments must be paused. No force restore or automatic permission repair was introduced.
- Runtime-fatal diagnostic marker and image inventory improvements have not been exercised under Docker yet.

## 10. Image inventory

`docs/evidence/fourday/image-inventory.json`: BLOCKED. Declared tags are PHP `8.2.29-fpm-bookworm`, MySQL `8.4.5`, nginx `1.28.0-alpine`, Node `22.16.0-bookworm-slim`. Immutable digests are null because no images were pulled/run. On a capable host, record actual repository digests and locally built PHP image identity; review the base-image digest separately.

## 11. Reproduction

```sh
pnpm install --frozen-lockfile
pnpm release:check
node --test tools/recovery/recovery.test.mjs
node --test tests/wordpress/http/safety.test.mjs tests/browser/cleanup.test.mjs
node tests/recovery/byte-evidence.mjs
npm install --prefix /tmp/fourday-runtime --ignore-scripts --no-audit --no-fund embedded-postgres@18.7.0-beta.19 pg@8.16.3 @php-wasm/cli@3.1.62 playwright-core@1.65.1 @sparticuz/chromium@153.0.0
```

Native SQL: follow pinned pgTAP commit/checksum instructions in `tests/database/README.md`, then run the command in section 5.

Portable WordPress:
```sh
node tests/wordpress/fetch-sources.mjs > /tmp/fourday-wp-sources.json
WP_TEST_SOURCES=/tmp/fourday-wp-sources.json PHP_BIN=/tmp/fourday-runtime/node_modules/.bin/php-wasm-cli node tests/wordpress/recovery-acceptance.mjs
```

Private browser (existing unprivileged `user` account, Linux namespace capability):
```sh
host_netns=$(readlink /proc/self/ns/net)
sudo -n unshare --net sh -c 'ip link set lo up; exec sudo -u user env HOST_NETNS="$1" /usr/local/bin/node tests/browser/isolated-review.mjs /tmp/fourday-runtime/node_modules' sh "$host_netns"
```

Do not use a public-listener fallback if namespaces are unavailable. Actual MySQL/FPM and real-auth instructions remain in their respective runner READMEs; do not substitute production credentials/data.

## 12. Cleanup and operator handover

- Native DB, successful host-byte and WASM fixtures cleaned their generated databases/sites/vaults. Namespace browser/server exited 0; no public service remains running.
- No Docker fixture was created. On a capable host, failed HTTP runs retain private site/vault/key/diagnostics; never paste/upload/commit these. Examine only the printed generated directory, verify `.fixture-owner`, and remove only its generated Compose project after investigation. No global prune.
- Successful HTTP runs now retain redacted `evidence.json`/`checks.jsonl` while removing generated secrets/site. A failed cleanup is FAIL.
- External source/dependency caches under `/tmp/fourday-*` are not deliverables; remove only known generated cache paths when no longer needed, never unrelated `/tmp` content.
- Resume by reading TASKS.md, PROGRESS.md, this report and `git status`; do not repeat historic passes as new evidence.

Next operator actions: provide an isolated Docker-capable runtime with permitted registries; execute actual MySQL/FPM/HTTP/OPcache and local Supabase real-auth suites; finish timed expiry/refresh/HTTPS/slow-backend checks; review real audit/disable semantics and exact staging environment; then independently review all evidence for the candidate commit. Any remote migration, push/PR, deployment or pilot activation still requires separate explicit authorization.

**Final recommendation: NO-GO.** Green independent suites are substantial evidence, but they do not satisfy the unverified mandatory runtime and authentication gates.

## Publication provenance note

At the user's subsequent PR request, persisted files were intact but Git history
had returned to baseline `45e032a`; the two previously reported local commit objects
were not in current history. The changes were therefore consolidated into a new
publication commit. Earlier tested hashes above and in the evidence JSON are
historical session references, not a claim that those commits are reachable from
this PR. See the PR's head commit for publication identity. Publication does not
claim a new full acceptance run or change any BLOCKED/NOT TESTED gate.

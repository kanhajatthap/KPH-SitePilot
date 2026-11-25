# Resumable progress

## Session 1 — audit / database setup
- Branch verified: arena/8a847ed8-kph-sitepilot; initially clean; base PR49 merge.
- `pnpm install --frozen-lockfile`: passed, no dependency manifest changes.
- No Docker, native PHP, MySQL or PostgreSQL commands installed. Debian 12, sudo available. Network permits GitHub/npm/PyPI only, not Debian or container registries. Do not repeatedly attempt blocked registries.
- Supabase read-only list_projects: configured zgkewnhrymswhucigtib absent; only unrelated tmgtqgjylmywrloulfpf visible. Remote audit BLOCKED; no substitute, no remote writes. Prior 403 not blindly retried.
- Vercel read-only get_team: FAIR_USE_LIMITS_EXCEEDED / fluidCpuDuration remains. No billing/deployment mutation.
- Installed isolated npm native PostgreSQL runtime (`embedded-postgres@18.7.0-beta.19`, `pg@8.16.3`) under /tmp/pilot-runtime, scripts disabled. Next: use temporary local-only cluster for true multi-connection locking tests. This is not Supabase Auth/PostgREST acceptance.
- Audit candidate: evidence freshness checked before receipt UPDATE may become stale while waiting on row lock. Reproduce before fix.

## Resume protocol
Read this file, TASKS.md and git status first. External runtimes in /tmp may not survive; recreate using pinned commands. Never infer passing evidence from configured tests. At most three focused attempts per blocker. Keep secrets out of logs. Next executable task: native PostgreSQL isolated runner and lock-wait regression.

## Milestone 1 — reproduced and fixed lock-wait freshness defect
- Fresh native PostgreSQL 18.7 starts successfully using isolated npm binaries; local loopback only, random ephemeral password, no external DB URL accepted.
- Added tests/database/native-review.mjs: all repository migrations, real roles/RLS, separate concurrent connections, ownership/revocation, replay, purge and lock-wait expiry.
- First run exposed test timestamp drift: two clock_timestamp() calls exceeded 60-second constraint by a microsecond. Corrected fixtures to statement_timestamp(); also corrected existing pgTAP fixture.
- Second run reproduced actual security defect: receipt consumed after evidence expired during row-lock wait (assertion failure).
- Added local-only 20261104150000_review_lock_freshness.sql: lock receipt and evidence first, then evaluate actual clock; preserve grants/no dispatch.
- Third run PASSED 17 assertions. This is native PostgreSQL with an explicit identity shim, NOT Supabase Auth/PostgREST E2E. No remote migration applied.
- Next: extend lock-wait cases and run regression, improve UI expiry handling, build isolated HTTP/FPM acceptance specification/harness and pilot gate.

## Milestone 2 — independent acceptance and UI hardening
- Native PostgreSQL suite expanded: 24 assertions PASS, including receipt/evidence lock waits, wrong hash/confirmation, scope removal, anonymous privileges and retention of fresh ciphertext.
- Added native concurrency invocation to local database workflow (not pushed or remotely executed).
- UI now checks wall-clock freshness at click (not stale interval state), removes expired source from rendered DOM, and reports malformed status without surfacing validator details.
- Added disposable MySQL/FPM/nginx/HTTP phase harness (OPcache timestamp checks disabled deliberately to prove restart requirement). No published ports, no Docker socket, fresh per-run project and credentials. Runtime BLOCKED: Docker absent and container registries outside network allowlist. JS syntax checked; Compose YAML parsed, NOT executed.
- Added real-auth browser runner with actual signed ingest, owner/non-owner sessions, concurrent tabs, dropped real POST response, revocation and lost-cookie reconciliation. Syntax checked only; Auth/PostgREST runtime BLOCKED on absent disposable Supabase stack. No claim of timed JWT expiry coverage.
- Added fail-closed offline pilot evidence evaluator: 8 tests PASS; even complete claims never grant activation. It checks completeness/freshness, not artifact authenticity.
- YAML validation first failed because PyYAML absent; used pinned isolated npm yaml@2.8.1 instead; both changed YAML files parse successfully.
- First regression after DB fix: pnpm release:check 8/8 PASS. Final regression/browser rerun pending latest changes.

## Milestone 3 — full native SQL assertions and browser regression
- Obtained upstream pgTAP v1.3.4 at exact commit 968eb53a33114e83042b3bdb0c664b5b80cf8bdf outside repo, SHA-256 verified SQL template; no mock assertion functions.
- Native runner now optionally executes ALL four repository SQL files with real pgTAP: 55/55 assertions PASS (11 recovery, 15 reviews, 11 ingestion, 18 RLS), plus 24 custom migration/concurrency/security checks PASS. Auth remains explicitly shimmed, not JWT E2E.
- Final compiled Chromium fixtures: 11/11 PASS including unavailable backend, lost POST, malformed reconciliation and wall-clock click expiry; source removed from DOM on expiry.
- Host recovery: 19 PASS / 1 native PHP skip. Pilot evaluator: 8 PASS.
- Final release check: 8/8 PASS; 1,069 unit/security tests in 108 files. Build/lint/typecheck all passed.
- Changed/created files are listed by git status and final report; no user modifications existed at start.
- Remaining runtime blockers: Docker/Supabase Auth/PostgREST, native PHP/MySQL/FPM/HTTP, production/hosted access. No remote operations attempted. New runners remain NOT RUN, not passing.
- Next: final syntax/security/diff review, stop temporary dashboard, write handover, consolidated local commit. Pilot NO-GO.

## Handoff
- Full staged diff reviewed; no production/remote activation paths added. Secret audit after staging: 332 files, 0 findings; governance: 35/35; diff check clean.
- Temporary compiled dashboard stopped; native database runner cleaned its temporary cluster. No ongoing unattended work is claimed.
- Final report: docs/pilot-execution-report.md. Mandatory blocked gates remain NO-GO. Reproduction and exact operator steps are included.
- Consolidated local milestone commit contains this record; resolve exact hash with git log -1 --format=%H. No push/PR/merge authorized or performed.

# New execution — arena/6e110001-kph-sitepilot

## Baseline milestone (2026-11-04 session date; machine timestamps may differ)
- Base/current commit 45e032ab0cbc2186c074055d9f502ca4077804f4; initial git status clean. Prior evidence above belongs to earlier branch, not this run.
- Read TASKS.md/PROGRESS.md and HTTP/database/auth runners. Preserved prior checklist in docs/pr50-task-history.md.
- `command -v docker php mysql`: none available. Runtime acceptance BLOCKED; no attempts to bypass network restrictions.
- `pnpm install --frozen-lockfile`: PASS. `node --test tools/recovery/recovery.test.mjs`: 19 PASS, native PHP fixture BLOCKED/skipped.
- Pinned external PostgreSQL/YAML runtime installed under /tmp/fourday-runtime (not repository dependencies).
- Static findings to address: FPM/web mount entire fixture including private vault; HTTP runner inherits remote Docker selection; failure path deletes generated backup/evidence; fatal phase treats any upstream 5xx as PHP fatal proof.
- Next executable work: isolate mounts, enforce local Docker selection, structured redacted evidence and test failure retention/cleanup.

## Environment/recovery milestone
- PASS — isolated runner safety tests: 9 tests; auth cleanup tests: 2 tests (11 total). Docker runtime remains BLOCKED, not simulated as passing.
- Fixed harness over-broad mounts: FPM/web no longer receive host recovery vault/key or root DB password. FPM receives site, DB credential, installer and runtime marker only. Internal network/no published ports verified by YAML parse and structural test.
- Docker environment guard rejects DOCKER_HOST/DOCKER_CONTEXT overrides and non-Unix endpoints, strips inherited Compose/secret env, pins selected local context and explicit empty env-file. A forwarded local socket is still an operator trust boundary.
- Failure preserves generated private vault and diagnostic files; services are scoped down, and cleanup failure cannot be reported as passing. Success removes generated secrets/site but preserves redacted evidence.
- Fatal harness now requires healthy direct FPM probe, exact HTTP 500 and fixed fatal shutdown marker, not any proxy 5xx. Actual FPM/OPcache behavior BLOCKED until Docker runtime exists.
- Added structured hashes/HTTP status/phase evidence and immutable image identity collection for future actual runs. Image digests NOT TESTED here.
- `node tests/wordpress/http/run.mjs`: BLOCKED, exit 2, {"status":"BLOCKED","code":"DOCKER_UNAVAILABLE"}; no resources created.
- `node tests/recovery/byte-evidence.mjs`: PASS CSS/JS/PHP byte fixtures including preflight, encrypted prepare, nonmutating dry-run, host restore, independent original hash comparison. Persisted redacted evidence: docs/evidence/fourday/host-byte-recovery.json. HTTP and PHP runtime explicitly NOT TESTED in this evidence.
- Native PostgreSQL custom suite: 29 checks PASS, including newly covered disable-before/after in-flight consumption ordering. No remote DB.
- Auth cleanup helper now attempts all generated-resource cleanup even if an earlier cleanup fails; errors redacted. Actual Auth E2E still BLOCKED.

## Native database / portable WordPress / isolated browser milestone
- PASS — all 55 pgTAP assertions (unchanged repository SQL) plus 29 custom native PostgreSQL checks. Output: /tmp/fourday-native-full.log. 33 aggregate lines include four pgTAP file summaries; not 33+55 distinct assertions.
- PASS — WordPress 6.8.3 + SQLite fixture under pinned PHP WASM 3.1.62, 25 assertions, including runtime-fatal fixture and host recovery. Output /tmp/fourday-wp.log. NOT native PHP/MySQL/FPM/HTTP acceptance.
- Network namespace capability available. First browser isolation preflight failed EACCES reading /proc/1/ns/net as unprivileged user; no listener started. Small correction compares captured parent namespace ID instead, while requiring only loopback. No privilege bypass or public-server fallback.
- PASS — compiled Chromium fixture scenarios 11/11 inside fresh network namespace. Server bound 0.0.0.0 only inside namespace; tool reported no host listening/new ports. Browser/server exited 0 and stopped. Actual Auth E2E remains BLOCKED.
- PASS — release:check 8/8, 1,070 unit/security tests / 108 files after runner safety wrapper addition; build/lint/typecheck passed.
- No Docker installation/remote registry workaround attempted; missing Docker preflight is a recorded BLOCKED result, not a passing container run.
- Next: final documentation/security review, source/runtime provenance and local commit; no push/deploy/activation.
- Final safety review: auth project deletion now requires a successful creation response, not merely an allocated UUID. Raw subprocess diagnostics stay in owner-only temporary files, never reports/Git. No application execution flags or remote migrations changed.

## Final verification / handover
- Sandbox-recorded timestamp: 2026-11-20T12:26:35.629505+00:00 (machine clock, not a claim of four elapsed days).
- Tested executable commit: 30d1bb1127ea3a160c2ce0177a671ccec0be806d; current branch arena/6e110001-kph-sitepilot.
- PASS final release check 8/8, 1,070 tests /108 files. PASS native SQL 55 pgTAP +29 custom checks; PASS WordPress/SQLite WASM 25; PASS host recovery 19 with native PHP BLOCKED; PASS isolated compiled browser 11, exit0/no host ports. PASS runner guard/cleanup tests11.
- Host-byte JSON rerun exactly matches committed CSS/JS/PHP original/restored hashes. Redacted logs and verification summary persisted under docs/evidence/fourday/.
- Full report: FINAL-EXECUTION-REPORT.md. Image inventory explicitly BLOCKED with null digests; no container runtime claim.
- Remaining next executable task requires an isolated Docker-capable host: actual MySQL/FPM/HTTP/OPcache then real Supabase Auth/PostgREST browser acceptance. Timed expiry/refresh/HTTPS also unverified. Pilot NO-GO.
- All started test services stopped; no push/PR/merge/deploy/migration/activation performed. Final documentation commit contains handover only.

## PR publication follow-up
- User explicitly authorized pushing this branch and opening a PR.
- On resume, implementation/evidence files were present but the previously reported local commits were absent from the current Git history (HEAD was baseline 45e032a). Recreated a consolidated commit from the persisted changes; earlier tested hashes in reports describe the prior session, not reachable commits in this checkout.
- PR submission checks: diff check and secret audit passed. Full acceptance results remain those recorded during implementation; no new runtime acceptance is claimed by publication.
- No merge, deployment, remote migration or pilot activation authorized by this follow-up.

## MySQL/FPM CI task — arena/c3b5cf08-kph-sitepilot
- Baseline e5b42f558bd402bca6644d51313493dd676f93db; initial tree clean. Docker executable still absent.
- Executed HTTP runner preflight: exit 2, {"status":"BLOCKED","code":"DOCKER_UNAVAILABLE"}; no fixtures or services started.
- Added .github/workflows/mysql-recovery.yml: GitHub-hosted Ubuntu, Node22, read-only repository permissions, pinned-source download, existing private Compose harness, 20-minute timeout, no deployment or secrets. Automatic concurrency cancellation disabled to avoid interrupting recovery cleanup.
- Added export-evidence.mjs and tests: allowlisted artifact projection strips labels/source/raw errors/paths/private diagnostics, validates generated temp paths and rejects symlinks. Workflow uploads exactly one sanitized JSON file, never fixture trees/vaults/keys/logs.
- PASS: 12 safety/export tests. PASS: workflow YAML parse and artifact path/permissions assertions. PASS: pnpm release:check 8/8 gates. Exporter included in dashboard regression wrapper.
- New workflow has NOT run on GitHub; no push/PR/dispatch authorized or attempted. Runtime hashes/digests and MySQL/FPM health remain BLOCKED locally and NOT TESTED remotely. Pilot remains NO-GO.
- Next: explicit publication authorization, then inspect actual new CI job output and address runtime failures. Do not infer passing acceptance from workflow configuration.

## Current authorized investigation — arena/86278a1c-kph-sitepilot
- Clean baseline 0f2d76dfc5fc58d72830448e0d49c5dca87e81dc. User authorized phases 1–5 including test publication/runtime verification; no merge/deploy/remote migration/pilot activation.
- GitHub run 45390402958 failed acceptance; newer main run 45398049759 PASSED all steps, including actual MySQL/FPM/HTTP/OPcache. GitHub compare reports no file differences between failed PR head and successful merge. Historical root cause is NOT CONFIRMED; intermittent environment/readiness remains a hypothesis.
- Artifact metadata readable; artifact download redirected to unavailable storage and failed EOF. Did not bypass network restrictions or repeatedly retry. Existing failed-job annotations only say exit 1.
- Confirmed diagnostics defect: exporter discarded runner stage/failure fields, preventing safe remote diagnosis. Added allowlisted stage/code/HTTP status and commit provenance, plus GitHub Checks annotations accessible without artifact storage.
- Hardened single-shot FPM probes to bounded transport/502/503/504 readiness retries. Unit reproduction covers restart transport race; wrong runtime/OPcache or invalid response fails immediately. This is not claimed as confirmed historical root cause.
- Added two independent CI samples (both required; no masking retries) and unique artifact names. Local 18 safety/export/readiness tests PASS. Full regression and actual CI pending.
- Actual two-sample run 45549578287 FAILED both samples at stage=install (annotations readable through Checks API). New diagnostics worked; phase recovery was never reached.
- Found MySQL healthcheck flaw: socket-default mysqladmin ping can succeed against the temporary initialization server. Official mysql Docker entrypoint runs that server with --skip-networking before docker_setup_db. Changed probe to explicit TCP/127.0.0.1, added regression, and safe install output classification. No passwords passed in command arguments. This is the first targeted fix for confirmed install-stage failures; verification pending.

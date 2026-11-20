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

# Controlled pilot execution — arena/8a847ed8-kph-sitepilot

Base: 85fad37f7c4eaa7699a565a99e4794eb917210e1. Local work only. No push/PR/merge, remote migration, production mutation or pilot activation.

## Completed this session
- [x] Audit branch/environment and external account visibility.
- [x] Run all migrations + 55 pgTAP SQL assertions on fresh native PostgreSQL (identity shim explicitly documented).
- [x] 24 native migration/RLS/concurrency/security checks; reproduce/fix expiry after lock waits.
- [x] Verify owner/non-owner, transfer, revocation, scopes, hashes, replay, source purge and retention in native DB.
- [x] Harden review click freshness, expired-source DOM display and malformed status handling.
- [x] Expand compiled Chromium fixture suite to 11 passing scenarios.
- [x] Implement disposable MySQL/FPM/HTTP/OPcache phase harness; syntax/YAML validation only.
- [x] Implement local real-auth signed-ingestion/browser runner; syntax validation only.
- [x] Controlled-pilot specification and fail-closed evidence-completeness gate (8 passing tests).
- [x] Release regression: 8/8 gates; 1,069 tests / 108 files; host recovery 19 pass / 1 native skip.

## Blocked / not executed (remain mandatory)
- [ ] Full Docker Supabase Auth/PostgREST stack and native Supabase CLI suite: Docker absent; native SQL alternative passed but does not replace Auth.
- [ ] MySQL/PHP-FPM/HTTP/OPcache runner runtime: Docker/native services absent; registries outside network allowlist.
- [ ] Real-auth browser runtime: disposable Supabase stack absent.
- [ ] Timed JWT expiry/refresh, HTTPS cookies, slow backend, authenticated WordPress admin acceptance: not yet covered by new runners.
- [ ] Correct remote Supabase migration inventory: configured project absent from connected account; prior 403, no substitution.
- [ ] Hosted deployment: Vercel CPU fair-use block; latest observed production remains PR42.
- [ ] Pilot activation: prohibited without separate authorization AND all mandatory evidence.

## Resume
Read PROGRESS.md and docs/pilot-execution-report.md, then git status. Recreate /tmp dependencies if needed. Run blocked suites only when prerequisites exist. Do not repeat completed tests without changes. Current pilot: **NO-GO**.

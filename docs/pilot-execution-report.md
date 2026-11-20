# Controlled-pilot execution report

## Executive summary

**PILOT STATUS: NO-GO.** This session executed multiple implementation/test milestones, not 48 hours of unattended operation. A real approval freshness defect was reproduced on native PostgreSQL and fixed locally. Native database/RLS and compiled browser evidence improved substantially. MySQL/FPM/OPcache and actual Auth/PostgREST browser acceptance remain unexecuted because this environment lacks their runtime prerequisites. No mandatory gate is waived.

Branch: `arena/8a847ed8-kph-sitepilot`; baseline: `85fad37f7c4eaa7699a565a99e4794eb917210e1` (PR49 merge). Changes are consolidated in a local milestone commit containing this report; obtain its hash with `git log -1 --format=%H`. No push, PR update, merge, production deployment, remote migration, external security/billing change or activation was performed. Progress/resume state: `TASKS.md`, `PROGRESS.md`.

## Implemented changes and files

| Files | Change |
|---|---|
| `supabase/migrations/20261104150000_review_lock_freshness.sql` | Lock receipt and evidence before evaluating wall-clock freshness. Preserves session identity, ownership/staging/scope checks and function grants; no dispatch |
| `supabase/tests/database/restricted-ingestion.test.sql` | Use one statement timestamp for exact 60-second test interval; avoid microsecond drift failure |
| `tests/database/native-review.mjs`, `README.md` | Fresh native PostgreSQL runner, all migrations, optional verified upstream pgTAP, real RLS and concurrent connections; no remote URL input |
| `.github/workflows/supabase-local.yml` | Native lock-wait/concurrency test step and path trigger; unpushed workflow not remotely run |
| `apps/dashboard/src/app/restricted-review/page.tsx` | Wall-clock check at click, hide expired source from DOM, safe malformed-status error |
| `tests/browser/restricted-review.mjs` | Four additional compiled-page fixture scenarios; expired source DOM assertion |
| `tests/browser/real-auth-review.mjs`, `.md` | Actual local Auth/login/signed-ingress/concurrent-tabs runner with real lost-response fault injection; runtime NOT RUN |
| `tests/wordpress/http/{Dockerfile,pool.conf,opcache.ini,nginx.conf,compose.yml,run.mjs,phases.mjs,README.md}` | Isolated MySQL/FPM/HTTP recovery and OPcache/restart phase harness; runtime NOT RUN |
| `tools/pilot/readiness.mjs`, `readiness.test.mjs` | Fail-closed evidence completeness/commit/freshness checks; never activates, even with complete claims |
| `apps/dashboard/tests/host-recovery.test.mjs` | Include pilot gate tests in regular dashboard regression |
| `docs/controlled-pilot-spec.md` | Mandatory acceptance evidence, failure stops, scope/allowlist/opt-in/audit/disable-switch requirements |
| `TASKS.md`, `PROGRESS.md`, this report | Persistent progress, blockers, reproduction and handoff |

## Security defect and verification

Old consumption function checked evidence freshness, then waited to update the receipt. Holding that receipt row in another transaction until evidence expired resulted in successful consumption. The native regression **failed against baseline**, proving the issue.

The new local migration obtains the receipt and evidence locks first, then samples `clock_timestamp()` and evaluates freshness and proposal expiry. Native tests now pass for both receipt-lock and evidence-lock waiting, simultaneous consumption, replay, wrong hashes/confirmation, scope removal, site revocation, owner transfer and RLS isolation. This migration is **not applied remotely**; do not assume a remote database has the fix.

## Tests PASSED

| Verification | Actual result |
|---|---|
| `pnpm release:check` | **8/8 gates**: typecheck, lint, tests, build, abuse-load, governance, secret audit, diff check |
| Monorepo tests | **1,069 passed / 108 files** |
| Native PostgreSQL migrations/concurrency/security | **24 checks passed**, separate actual database connections |
| Repository SQL via actual pgTAP on native PostgreSQL | **55/55 assertions passed**: recovery 11, review 15, ingestion 11, RLS 18 |
| Compiled Chromium fixture scenarios | **11/11 passed** |
| Independent host recovery | **19 passed / 1 skipped** (native PHP absent) |
| Pilot evidence gate | **8 passed**; wrapped by normal test suite |
| New runners | Node syntax checks passed |
| Compose/workflow YAML | Parsed successfully with isolated `yaml@2.8.1`; not Docker runtime validation |

Native runner reports 28 top-level checks when pgTAP is enabled: 24 custom checks plus four SQL-file aggregate checks. Do not add 28 and 55 as independent assertions.

## Tests FAILED and corrections

1. Native fixture initially violated the 60-second evidence constraint because separate clock calls differed by a microsecond. Classified test-fixture defect; changed interval endpoints to `statement_timestamp()`; rerun passed.
2. Baseline receipt-lock expiry regression failed: stale evidence consumed. Classified security code defect; added migration; reruns passed, including evidence-lock wait variant.
3. Python YAML parsing unavailable (`ModuleNotFoundError: yaml`). Classified tooling issue; isolated pinned npm YAML parser succeeded. No security verification bypass.

No known failing test remains among checks actually executed after fixes. Unexecuted checks below are not passes.

## BLOCKED / NOT RUN

- **Full local Supabase CLI stack, Auth and PostgREST:** Docker absent. Native SQL runs use a minimal `auth.users`/`auth.uid()` identity shim and actual PostgreSQL roles/RLS; they do NOT verify JWTs or replace the complete Supabase stack.
- **MySQL + PHP-FPM + HTTP + OPcache runtime:** no Docker/native PHP/MySQL. Container registries/Debian package hosts are outside the available outbound allowlist. Harness is implemented, syntax/YAML checked, but unrun.
- **Real-auth browser runner:** no disposable Auth/PostgREST stack available. Only fixture-based browser scenarios ran.
- **Timed JWT expiry/refresh rotation, HTTPS cookie behavior, slow backend acceptance, authenticated WordPress admin:** not executed and not fully covered by the initial new runner. Explicit future work, not fabricated evidence.
- **Fresh SQLite/PHP acceptance:** prior PR49 native CI passed; not rerun in this session. Do not relabel prior evidence as current acceptance.
- **New CI workflow step:** not run remotely because no push authorized.

## Real staging and external audit

No hosted/user-local WordPress staging was accessed or modified. `test.local` is not assumed reachable. No real hosting recovery evidence was generated.

Read-only Supabase project inventory still exposes only `tmgtqgjylmywrloulfpf`, not configured `zgkewnhrymswhucigtib`. Prior access denial was not blindly retried and the other project was not substituted. Correct remote migration state remains **BLOCKED**.

Read-only Vercel team inspection still reports `FAIR_USE_LIMITS_EXCEEDED` / `fluidCpuDuration`. Latest observed production deployment `dpl_BaQZb1rMXY8jDVkQi5nypbwoBWd5` is PR42 commit `aaabe699d5ab1d91ce8e1c4ee3cb60eaef88ce8d`. No deployment attempted. Generic release-script auto-deploy output is not deployment evidence.

## Recovery, retention and security boundaries

- Existing host helper remains independent of WordPress and default dry-run. Existing allowlist/path/lock/permission fixtures passed. No permission repair or force-write override was added.
- New Docker runner only copies pristine sources into a generated temporary tree, uses a random Compose project, no published ports or socket mount, internal network, random fixture credentials and targeted cleanup. Version tags require digest review/pinning before trusted acceptance; image availability/runtime behavior remains unverified.
- Expired source disappears from rendered UI, not claimed as memory zeroization. Native DB purge removes expired ciphertext and retains metadata/fresh evidence. Existing cleanup cadence can still retain ciphertext beyond its 60-second validity; no new scheduling/remote retention claim.
- Concurrent database locks protect transactional metadata, not hostile filesystem writers. Stop editors/workers/deployments for host recovery.
- Real-auth runner creates random fixture users/site/project; cleanup targets only generated IDs. Encryption-key validation does not echo secret values. No credentials/source dumps, screenshots or request tracing added.
- Readiness evaluator validates claims, not artifact authenticity. It can never grant activation. A complete executed-write audit trail and in-flight disable semantics still need evidence.
- Connector bootstrap/dispatch and production file writing remain disabled. No migrations or tools enable execution.

## Reproduction commands

```sh
pnpm install --frozen-lockfile
pnpm release:check
node --test tools/recovery/recovery.test.mjs
node --test tools/pilot/readiness.test.mjs
npm install --prefix /tmp/pilot-runtime --ignore-scripts --no-audit --no-fund embedded-postgres@18.7.0-beta.19 pg@8.16.3
node tests/database/native-review.mjs /tmp/pilot-runtime/node_modules
```

For all native SQL assertions use the pinned pgTAP instructions in `tests/database/README.md`. For browser fixtures install `playwright-core@1.65.1` and `@sparticuz/chromium@153.0.0` outside the repo, start compiled dashboard on port 3002, then:

```sh
node tests/browser/restricted-review.mjs /tmp/pilot-runtime/node_modules http://127.0.0.1:3002
```

Blocked environment commands/setup are documented in `tests/wordpress/http/README.md`, `tests/browser/real-auth-review.md`, and `.github/workflows/supabase-local.yml`. Do not send remote credentials to local fixtures or run remote migrations as part of reproduction.

## Exact next operator actions

1. Review local commit/migration and keep execution disabled. No push authorization is implied.
2. Provide an isolated Docker-capable host with required registry access; run full local Supabase migrations/SQL, real-auth browser and MySQL/FPM/HTTP acceptance. Record image digests and exact candidate commit.
3. Complete timed session expiry/refresh, HTTPS cookies, slow/outage handling and authenticated admin acceptance. Investigate failures; do not waive gates.
4. Review project/org permissions and connect an account with access to correct Supabase project; then inspect migration state read-only. Separate authorization required before remote migration.
5. Resolve/wait out Vercel CPU restriction through owner controls; no automatic paid upgrade or security changes.
6. Verify independent backup, exact allowlist, operator opt-in, full audit trail, disable behavior and failure stop conditions against intended staging environment.
7. Only after all mandatory evidence and independent review, request separate explicit activation authorization. Until then **NO-GO**.

Temporary dashboard was stopped. Native clusters are cleaned in runner `finally`; external dependencies/downloaded pgTAP and transient logs under `/tmp` are not committed and may disappear. Resume from persistent logs rather than assuming ephemeral runtime state.

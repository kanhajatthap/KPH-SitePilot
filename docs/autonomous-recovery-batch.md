# Autonomous recovery/review batch — 2026-11-04

## Scope and disposition

Branch: `arena/8c4ea936-kph-sitepilot`; base: `c8377a2e2af99f6649bbe68c0bf1542956613bd5`.
One consolidated local commit contains this report and implementation. Obtain its exact hash with `git log -1 --format=%H` (a commit cannot contain its own hash). No push, PR, merge, deployment, remote migration, billing change or production mutation was performed. This was a bounded interactive execution session, not eight hours of unattended background work.

## Implemented

- `tools/recovery/recovery.mjs`: redacted actionable error guidance for policy/key/access/path/lock/ownership failures; distinguishes lock existence from permission failures; catches post-replacement failures as RESTORE_UNVERIFIED rather than implying no file change. No permission repair added. Existing restore copies the saved mode to its temporary replacement, unchanged.
- `tools/recovery/recovery.test.mjs`: missing-key and malformed-policy CLI regressions, including no vault mutation/path leakage.
- `apps/dashboard/src/app/restricted-review/page.tsx` and `src/lib/restricted-review-client.ts`: bounded source envelope validation, identity matching, ISO timestamps including PostgreSQL UTC offsets, specific session/unavailable messages, request timeouts, double-submit guard, explicit reload, clearing source on uncertain writes. A failed/ambiguous write cannot be blindly resubmitted from the current screen.
- `apps/dashboard/src/app/api/connector/restricted-files/status/route.ts`: source-free no-store receipt reconciliation using session client, explicit owner filter and existing RLS; no service-role access or mutation. Pending status is not execution permission.
- Proposal route rejects non-finite database freshness/expiry values before source disclosure.
- `restricted-status-route.test.ts`, `restricted-review-client.test.ts`, and source-route tests cover status authorization/error responses and envelope validation. Existing signed-ingestion, ownership, staging, hash, nonce, expiry, replay and revocation suites were rerun; this is not a new hosted signed end-to-end execution path.
- `tests/browser/restricted-review.mjs`: real compiled Chromium fixtures updated for malformed responses, session loss and ambiguous submission → consumed-status reconciliation without a second POST.
- `tests/wordpress/{sources.json,fetch-sources.mjs,recovery-acceptance.mjs}`: pinned disposable WordPress 6.8.3 + SQLite integration 2.2.23 fixture. SHA-256-verified core archive and exact SQLite Git revision; no vendor sources committed. Installs isolated database with random fixture credentials, suppresses WordPress HTTP/mail/cron, checks CSS/JS/PHP edits, independent host restoration, original hashes and WordPress bootstrap/database/theme health. Experimental PHP engine is loaded directly only inside the fixture for proposal/export/apply/restore checks. Fixed fatal theme is recovered without bootstrapping WordPress.
- `.github/workflows/ci.yml`: native PHP/SQLite acceptance step added. Not remotely executed in this batch because nothing was pushed.
- `docs/host-recovery-runbook.md`: error handling, disposable commands, limitations and cleanup guidance.

## Actual verification

| Check | Result |
|---|---|
| Final `pnpm release:check` | **8/8 passed**: typecheck, lint, unit/security tests, build, abuse-load, governance, secret audit, diff check |
| Monorepo unit/security tests | **1,068 tests / 108 files passed** |
| `node --test tools/recovery/recovery.test.mjs` | **19 passed, 1 skipped**; native PHP fatal fixture skipped because native PHP absent |
| Compiled-page Chromium fixtures | **7/7 passed**, including safe literal source display and no second POST after ambiguous receipt reconciliation |
| Fresh pinned-source download + WordPress acceptance | **25 assertions passed under PHP WASM 3.1.62**; real WordPress bootstrap and SQLite, not mocked WordPress |
| Native PHP / PHP-FPM / MySQL / OPcache | **Not tested locally**; no native PHP or Docker available |
| Native Supabase DB/RLS SQL suite | **Not rerun locally**; requires local Docker/Supabase stack. Existing unit checks are not native RLS proof |
| Hosted sign-in/cookies/ownership end-to-end | **Not tested**; browser APIs were fixtures |
| User `test.local` WordPress | **Not accessed**; local-only URL is not assumed reachable |
| New CI step | **Configured, unrun remotely** |

A Node fetch attempt for pinned core failed on the sandbox TLS certificate chain. The fetcher was changed to curl using system trust, HTTPS-only and SHA-256 verification; fresh download and acceptance then passed. No TLS verification bypass was used. SQLite codeload archives omit required files via upstream export rules; the fetcher uses an exact Git revision instead. These were resolved fixture setup failures, not hidden passing tests.

The release script's generic auto-deployment message is not deployment evidence. Build success does not remove Vercel's account restriction.

## External read-only blockers

- Vercel team remains soft-blocked for `FAIR_USE_LIMITS_EXCEEDED` / `fluidCpuDuration`; latest observed production deployment remains PR42. No billing/plan/redeployment mutation attempted.
- Correct configured Supabase project `zgkewnhrymswhucigtib` refused migration listing with **403**. Connected account lists a different project; it was not substituted. Remote schema and migration application remain unverified. Do not infer access from successful login alone.

## Security review and remaining gates

No dispatch/bootstrap activation, new executable tool, schema migration, credential persistence, source HTML rendering, authentication bypass or automatic chmod/chown was introduced. Receipt status is informational and never authorizes a file write. Existing review consumption RPC remains responsible for transactional single-use and live ownership checks. No private fixtures, databases, vault keys, dependency trees or downloaded vendor archives are committed.

Host recovery still requires a snapshot prepared before the edit and independent hosting backups. Cooperative locks do not exclude hostile external writers. Stop editors/deployments/workers before recovery. Byte verification is not HTTP health, OPcache reset, or recovery certification. Source screening is not complete DLP. A compromised connector can misreport freshness. Normal experimental export/dispatch remains disabled; FILE-04/05 are not production-complete.

## Exact next operator steps

1. Review the local commit using `git show --stat HEAD` and `git show HEAD`; do not push without new explicit authorization.
2. Run native fixture acceptance on isolated Linux with Node 22, git/curl/tar and PHP 8.2 PDO SQLite:
   ```sh
   node tests/wordpress/fetch-sources.mjs > /tmp/sitepilot-wp-sources.json
   WP_TEST_SOURCES=/tmp/sitepilot-wp-sources.json node tests/wordpress/recovery-acceptance.mjs
   REQUIRE_PHP_RECOVERY_TEST=1 node --test tools/recovery/recovery.test.mjs
   ```
3. For native DB/RLS evidence on a disposable Docker host, follow `.github/workflows/supabase-local.yml`: start the isolated Supabase stack, apply migrations **locally**, run `supabase test db --local`, and stop without backup. Never substitute remote credentials.
4. Review Supabase project/organization permissions and connect an account with access to `zgkewnhrymswhucigtib`. Only then list its migration state read-only; require separate authorization before applying anything remotely.
5. Resolve/wait out Vercel account CPU restrictions through owner controls; no paid upgrade assumed. Separately authorize any future push/deployment.
6. Provision an actual reachable disposable staging site and host-only recovery vault; follow the runbook preflight/prepare/dry-run/apply flow. Verify WordPress HTTP/admin health, native PHP/FPM and OPcache restart behavior and signed hosted-session ownership/revocation/replay flows before considering activation.

Downloaded sources and external test runtimes live under `/tmp` and are not deliverables. The generated WordPress site/database/vault are removed by the harness. The temporary compiled-dashboard test server was stopped.

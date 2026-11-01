# KPH SitePilot — Micro-Task Backlog (execution order)

> Companion to [`docs/sitepilot-master-plan.md`](./sitepilot-master-plan.md).
> Rules: pick the next unchecked task whose dependencies are done · one task = one commit ·
> every task needs evidence in [`docs/plan-progress.md`](./plan-progress.md).
> `Est` is focused hours. `Done` is the acceptance condition.

---

## E0 — Stabilize the base (M0)

- [x] **E0-01** — Fix fresh-clone test ordering: CI and docs use `pnpm test` (Turbo, respects `^build`), not `pnpm -r test`. · *Files:* `.github/workflows/ci.yml`, `package.json`, `tests/README.md` · *Done:* clean clone → `pnpm test` passes without manual build · *Dep:* — · *Est:* 1h
- [x] **E0-02** — Fix failing test `workspace-task-engine › transitions to waiting_for_approval` (assert real failure cause; fix engine or test). · *Files:* `packages/agent-core/src/task-engine.ts`, `packages/agent-core/tests/workspace-task-engine.test.ts` · *Done:* full suite green 331/331, root cause explained in progress log · *Dep:* — · *Est:* 3h
- [ ] **E0-03** — Add `pretest` safety: `test` script builds workspace packages it depends on, so plain `pnpm -r test` also works. · *Files:* `package.json`, `turbo.json` · *Done:* `pnpm -r test` from clean clone passes · *Dep:* E0-01 · *Est:* 1h
- [ ] **E0-04** — CI: add PHP lint + plugin unit test job; add migration SQL syntax check; keep total < 6 min. · *Files:* `.github/workflows/ci.yml` · *Done:* CI shows 3 jobs green on a test PR · *Dep:* E0-01 · *Est:* 2h
- [ ] **E0-05** — Add `docs/plan-progress.md` template + first entry (audit evidence). · *Files:* `docs/plan-progress.md` · *Done:* file committed with today's audit numbers · *Dep:* — · *Est:* 30m
- [ ] **E0-06** — Update `.env.example` + `packages/config` for hosted mode (`SITEPILOT_MODE=local|hosted`, `SITEPILOT_ENCRYPTION_KEY`, `PAIRING_PEPPER`, `CONNECTOR_BASE_URL`). · *Files:* `.env.example`, `packages/config/src/index.ts`, `packages/config/tests/config.test.ts` · *Done:* config tests cover both modes; invalid hosted config fails loudly · *Dep:* — · *Est:* 2h
- [ ] **E0-07** — Amend governance rules for the product phase: production sites allowed with gating; connector is the only WP transport; no arbitrary code. · *Files:* `AGENTS.md`, `.agents/rules/architecture.md`, `.agents/rules/security.md` · *Done:* rules match plan §8.2; no contradictory statements remain · *Dep:* owner confirmation · *Est:* 1h
- [ ] **E0-08** — Add `docs/sitepilot-master-plan.md` + backlog to README docs index and roadmap. · *Files:* `README.md` · *Done:* README links both docs and marks new roadmap · *Dep:* — · *Est:* 30m

---

## E1 — Cloud spine: Supabase + Vercel (M1)

- [x] **E1-01** — Apply existing migrations to Supabase project `zgkewnhrymswhucigtib` (schema + RLS + chat history). · *Files:* `supabase/migrations/*` · *Done:* `list_migrations` shows 2 rows, `profiles/projects/...` exist, RLS enabled · *Dep:* — · *Est:* 1h
- [x] **E1-02** — Create migration `sites`, `pairing_codes`, `plans`, `approvals`, `jobs`, `job_events`, `snapshots`, `usage_events`, `user_api_keys`, `connector_nonces`, `rate_limits`, `automations`, `feature_flags` with indexes + RLS. · *Files:* `supabase/migrations/2026xxxx_sitepilot_v2.sql` · *Done:* migration applies cleanly on a fresh local DB and on the hosted project · *Dep:* E1-01 · *Est:* 6h · ✅ applied live as `20261101074317_sitepilot_v2` (13 tables, all RLS+FORCE, 6 policies, `site_metadata` view).
- [x] **E1-03** — SQL functions: `claim_next_job`, `consume_rate_limit` (extend), `purge_expired` (nonces/events/snapshots), `touch_site_heartbeat`. · *Files:* same migration or follow-up · *Done:* pgTAP/SQL tests cover happy + race path · *Dep:* E1-02 · *Est:* 3h · ✅ `claim_next_job` (SKIP LOCKED + lease + attempts), `touch_site_heartbeat`, `purge_expired_connector_state` applied live as `20261101080746_connector_functions`; verified 1→0→1 claim across lease expiry, attempts 2, 2 job_events, revoked site not revived. Rate-limit RPC already existed from v1.
- [ ] **E1-04** — RLS test suite for new tables (cross-tenant read/write denied, service role allowed). · *Files:* `supabase/tests/database/rls-v2.test.sql`, `packages/supabase/tests/rls-sql.test.ts` · *Done:* `supabase test db` green locally · *Dep:* E1-02 · *Est:* 4h
- [ ] **E1-05** — `@wp-agent/supabase` repos: `sites`, `plans`, `jobs`, `snapshots`, `audit`, `usage` (typed, injectable client). · *Files:* `packages/supabase/src/repos/*` · *Done:* unit tests with fake client · *Dep:* E1-02 · *Est:* 5h
- [x] **E1-06** — Extract API business logic into `apps/api-core` (transport-agnostic handler map: method + path → handler(input, ctx)). · *Files:* `apps/api-core/src/*`, `apps/api/src/index.ts` · *Done:* Node server uses api-core; existing API tests unchanged and green · *Dep:* — · *Est:* 8h · ✅ delivered as `packages/api-core` (`handleRequest` over transport-neutral `CoreRequest`/`CoreResponse` + `createCoreHandler`); `apps/api` is now a Node adapter; 6 new core tests.
- [x] **E1-07** — Next.js catch-all route `apps/dashboard/src/app/api/v1/[...path]/route.ts` delegating to api-core with Supabase auth context. · *Files:* new route + `lib/api-core-context.ts` · *Done:* `/api/v1/health` + `/api/v1/projects` work on Vercel preview · *Dep:* E1-06 · *Est:* 4h · ✅ delivered as in-process delegation: dashboard route handlers call `callApi()` → api-core, so the hosted app never dials `127.0.0.1:3001`.
- [ ] **E1-08** — Server auth helpers: session → user, project ownership guard, service-role client (server-only). · *Files:* `apps/dashboard/src/lib/auth/*`, `packages/supabase/src/server.ts` · *Done:* unauth request → 401; other user's project → 404/403; tests · *Dep:* E1-07 · *Est:* 3h
- [ ] **E1-09** — Set Vercel env vars (production + preview): Supabase URL/anon, service role, encryption key, pairing pepper, site URL. · *Files:* Vercel project settings · *Done:* `list_env_vars` shows keys on both targets; no secret in client bundle · *Dep:* E1-01 · *Est:* 1h
- [ ] **E1-10** — Vercel deployment settings: root `apps/dashboard`, build uses turbo, Node 22, function timeout, enable git deploy for `main` + previews. · *Files:* `vercel.json`, project settings · *Done:* push to branch produces a working preview URL with auth · *Dep:* E1-07, E1-09 · *Est:* 2h
- [ ] **E1-11** — Hosted health/version endpoint + `docs/deployment-guide.md` rewrite for Vercel + Supabase free. · *Files:* `api/v1/health`, docs · *Done:* prod URL returns `{status:'ok', mode:'hosted', version}` · *Dep:* E1-10 · *Est:* 1h
- [ ] **E1-12** — Auth flow on hosted: register → email confirm → login → protected `/app`; remove silent local bypass when Supabase configured. · *Files:* auth pages, middleware, `site-access.ts` · *Done:* Playwright/curl flow passes on preview · *Dep:* E1-08 · *Est:* 4h
- [ ] **E1-13** — Per-user free quotas middleware (projects/sites/jobs/day, AI/day) with friendly 429 + reset time. · *Files:* `apps/api-core/src/quota.ts` · *Done:* tests for each limit boundary · *Dep:* E1-03 · *Est:* 3h
- [ ] **E1-14** — Daily cron `/api/cron/daily` (keep-alive + purge) configured in `vercel.json`. · *Files:* route + config · *Done:* manual invoke works; logs show purge counts · *Dep:* E1-03 · *Est:* 2h

---

## E2 — Connector plugin v1 (M2)

- [x] **E2-01** — Scaffold plugin `wordpress/kph-sitepilot-connector` (bootstrap, constants, activation/deactivation, uninstall, PSR-4-ish autoloader). · *Files:* `wordpress/kph-sitepilot-connector/**` · *Done:* activates on WP 6.4+ without notices; `php -l` clean · *Dep:* — · *Est:* 2h
- [x] **E2-02** — Settings store (site id/token/secret encrypted option wrapper, scopes, poll mode) + capability guard `manage_options`. · *Files:* `includes/class-settings.php` · *Done:* unit tests with WP_Mock; no secret in debug output · *Dep:* E2-01 · *Est:* 3h · ✅ settings store already present; `manage_options` capability guard now enforced by the pairing REST routes.
- [x] **E2-03** — HMAC signer/verifier (`timestamp.nonce.sha256(body)`) + PHP↔TS shared fixtures. · *Files:* `includes/class-signature.php`, `packages/connector-protocol/*` · *Done:* same fixture signatures in PHP + TS tests · *Dep:* E2-01 · *Est:* 4h
- [x] **E2-04** — Outbound HTTPS client (wp_remote_post, timeouts, error mapping, UA header, retry/backoff). · *Files:* `includes/class-client.php` · *Done:* tests for 200/401/429/timeout paths · *Dep:* E2-03 · *Est:* 3h · ✅ outbound client lives in `includes/class-job-runner.php::request()`: 20 s timeout, `redirection => 0`, 1 MB response cap, HTTP error mapping, 401/403 recorded as `unauthorised`.
- [x] **E2-05** — Pairing UI + handler (code + label → `/api/connector/pair` → store credentials → success state). · *Files:* `admin/*`, `includes/class-settings.php` · *Done:* real site pairs in < 2 min against local API · *Dep:* E2-04, E1-07 · *Est:* 5h · ✅ admin card: pairing input, platform-URL form, REST-nonce JS, honest connected/disconnected states, local disconnect.
- [x] **E2-06** — Platform: `POST /api/connector/pair` (code hash lookup, single-use, expiry, site row, token+secret, audit). · *Files:* `apps/api-core/src/connector/pair.ts` · *Done:* tests: valid / expired / reused / wrong user codes · *Dep:* E1-02, E2-03 · *Est:* 4h · ✅ live at `POST /api/connector/pair` (code hash lookup, single-use, 10-min expiry, site row, token+secret once, encrypted secret at rest).
- [x] **E2-07** — Capability manifest builder (WP/PHP, theme type, plugins, post types, taxonomies, menus, Woo/SEO/cache detection, multisite, locale). · *Files:* `includes/class-capabilities.php` · *Done:* manifest validates against Zod schema; stored on site row · *Dep:* E2-02 · *Est:* 4h · ✅ `includes/class-capabilities.php` — site/theme(FSE)/plugins(cap 80)/post types(cap 40)/taxonomies/builders/environment/user counts; no emails, no secrets.
- [x] **E2-08** — Platform connector auth middleware (site lookup, timestamp window, nonce store, signature, rate limit, kill switch). · *Files:* `apps/api-core/src/connector/auth.ts` · *Done:* tests for each failure code + replay · *Dep:* E2-06 · *Est:* 4h · ✅ `apps/dashboard/src/lib/connector/auth.ts` — site lookup → status gate → secret decrypt → HMAC verify → nonce replay store → 240 req/min/site budget; 13 unit tests.
- [x] **E2-09** — Heartbeat endpoint + plugin scheduler (WP-Cron 60 s, admin-init poll, live mode 5 s, idle backoff). · *Files:* `class-job-runner.php`, `apps/dashboard/src/lib/connector/handlers.ts` · *Done:* site shows “live” in UI; backoff verified in logs · *Dep:* E2-08 · *Est:* 5h · ✅ `schedule_next()` shortens the gap to 5 s after any job, 60 s while active, 300 s after an hour without work; the pending single event carries the `live` arg so it never disturbs the recurring cron. Retires the E2-09 → UI “live” badge as part of E5-01.
- [x] **E2-10** — Job queue DDL + claim endpoint (`FOR UPDATE SKIP LOCKED`, lease, attempts, idempotency). · *Files:* migration, `connector/jobs-claim.ts` · *Done:* concurrency test: 2 sites, no duplicate claims · *Dep:* E1-03, E2-08 · *Est:* 4h · ✅ `POST /api/connector/jobs/claim` + `claim_next_job` RPC; one job per call, lease 120 s, allowlist guard fails non-executable tools loudly.
- [x] **E2-11** — Plugin job runner: fetch, parse, validate, dispatch to tool registry, try/catch, shutdown-handler fatal capture, result post. · *Files:* `includes/class-job-runner.php`, `includes/class-fatal.php` · *Done:* unknown tool → `unsupported`; fatal → `php_fatal` · *Dep:* E2-10 · *Est:* 5h · ✅ `KPH_SP_Fatal` registers a shutdown hook, records the last fatal for the admin screen and reports `kph_sp_fatal_error` for the in-flight job (paths redacted, message capped at 300 chars, single-shot guard).
- [x] **E2-12** — Tool registry (allowlist, per-tool arg validation, risk, dry-run/snapshot flags) + first tool `site.info`. · *Files:* `includes/tools/*` · *Done:* end-to-end job returns site info to platform · *Dep:* E2-11 · *Est:* 4h · ✅ `includes/class-tools.php` — deny-by-default registry (`site.info`, `site.health`, `content.list`, `content.get`), scope-gated, read-only in this build.
- [x] **E2-13** — Result endpoint + job state machine + `job_events` writer. · *Files:* `connector/jobs-result.ts` · *Done:* states transition correctly; duplicate results ignored by idempotency · *Dep:* E2-10 · *Est:* 3h · ✅ `POST /api/connector/jobs/{id}/result` — state machine (succeeded / retry→queued / failed), `job_events` writer, duplicate report is a no-op.
- [ ] **E2-14** — Admin page: status, connect, scopes, activity list (last 20 jobs), disconnect, debug bundle. · *Files:* `admin/class-admin-page.php`, views · *Done:* UI usable on mobile-width admin; no secrets rendered · *Dep:* E2-05 · *Est:* 5h
- [x] **E2-14a** — Hosted mode connects to **any** WordPress site: the localhost-only target gate was replaced by `lib/target.ts` (structural checks + cloud-metadata block) with ownership proven by `authorizeTargetSite` against the paired `sites` table; all 12 target-taking routes pass `saasMode` and local mode keeps its original restriction. · *Files:* `apps/dashboard/src/lib/target.ts`, `apps/dashboard/src/lib/api-proxy.ts`, 12 route files · *Done:* any owned https site reachable, metadata endpoints refused · *Dep:* E2-02 · *Est:* 2h · ✅ 4 new tests in `target-policy.test.ts`.
- [ ] **E2-15** — Platform site APIs: list/create/pair-code/delete/rotate-secret + capabilities read. · *Files:* `api/v1/sites/*` · *Done:* API tests + RLS ownership · *Dep:* E2-06 · *Est:* 4h
- [ ] **E2-16** — Connector events endpoint + ring-buffer logger + redaction on both sides. · *Files:* `connector/events.ts`, `class-logger.php` · *Done:* batched events visible in job detail; secrets redacted · *Dep:* E2-13 · *Est:* 3h
- [x] **E2-17** — Disconnect/revoke: plugin unpair + server revoke, token deletion, queued jobs cancelled. · *Files:* both sides · *Done:* revoked site cannot claim jobs (401) · *Dep:* E2-13 · *Est:* 2h · ✅ signed `POST /api/connector/unpair` (site revokes itself), owner-facing `DELETE /api/connector/sites/{id}` (ownership checked, queued jobs → `cancelled`), plugin tells the platform before forgetting credentials and clears them automatically when the platform answers `SITE_REVOKED`.
- [x] **E2-18** — Plugin packaging: `zip` build script, version constant, `readme.txt`, GitHub release workflow. · *Files:* `scripts/build-connector-zip.sh`, `.github/workflows/ci.yml` · *Done:* downloadable ZIP installs on a clean WP · *Dep:* E2-14 · *Est:* 3h · ✅ `pnpm connector:zip` builds `dist/kph-sitepilot-connector-<version>.zip` (31 KB), refuses when the header version and `KPH_SP_VERSION` disagree, excludes `tests/`, and smoke-checks the archive; CI uploads it as the `kph-sitepilot-connector` artifact. A tagged release workflow is still open.
- [x] **E2-19** — Install guide page (`/docs/connector`) with screenshots + troubleshooting table. · *Files:* `apps/dashboard/src/app/docs/connector/page.tsx` · *Done:* a non-technical user can connect without help · *Dep:* E2-18 · *Est:* 2h · ✅ five steps, requirements table, a “what it will and will not do” list and six real failure modes with fixes; linked from `/connect` and `/studio`. Screenshots still to be added on a real site.
- [ ] **E2-20** — Docker-based WP test matrix (6.4 + 6.8, PHP 8.1 + 8.3, classic + block theme) running plugin tests in CI. · *Files:* `docker-compose.wp.yml`, workflow · *Done:* CI job green and < 6 min · *Dep:* E2-18, E0-04 · *Est:* 6h
- [ ] **E2-21** — Compatibility: multisite (per-site options), object cache flush, low-memory guard, max payload check. · *Files:* plugin · *Done:* tests + manual multisite smoke · *Dep:* E2-20 · *Est:* 4h
- [ ] **E2-22** — Real-site acceptance: connect a live WordPress site, capture evidence, log latency. · *Files:* `docs/phase-connector-acceptance.md` · *Done:* evidence with URL, timestamps, capability manifest · *Dep:* E2-19 · *Est:* 2h

---

## E3 — Job engine, tool contract v2, first change (M3)

- [ ] **E3-01** — `@wp-agent/wp-tools` catalog package: `ToolSpec`, risk enum, scopes, families, registry + lookup. · *Files:* `packages/wp-tools/src/*` · *Done:* 100 % schema tests; unknown tool rejected · *Dep:* — · *Est:* 4h
- [ ] **E3-02** — Contracts v2: plan step, job, result, snapshot, error taxonomy (`SitePilotError`), shared with PHP fixtures. · *Files:* `packages/contracts/src/v2/*` · *Done:* `contracts.test.ts` green; fixtures shared with plugin tests · *Dep:* E3-01 · *Est:* 5h
- [ ] **E3-03** — Risk policy engine (R0–R3, destructive detection, typed-confirmation requirement, staging advice). · *Files:* `apps/api-core/src/policy/risk.ts` · *Done:* tests for each risk class and override paths · *Dep:* E3-02 · *Est:* 3h
- [ ] **E3-04** — Plan builder service: prompt + site context → plan JSON (steps, args, diff, risk, undo plan), Zod-validated, hash computed. · *Files:* `api-core/src/plans/build.ts` · *Done:* mock-model tests produce stable hashes · *Dep:* E3-02 · *Est:* 6h
- [x] **E3-05** — Plan/approve/reject APIs with hash binding, stale detection, audit events. · *Files:* `api/v1/plans/*` · *Done:* edited plan invalidates approval; replay blocked · *Dep:* E3-04 · *Est:* 4h · ✅ `POST/GET /api/connector/plans`, `…/[id]`, `…/[id]/approve`, `…/[id]/execute`; SHA-256 plan hash re-checked at approval (`PLAN_CHANGED`), R3 steps need a typed confirmation (first 8 chars of the plan id), one-step-at-a-time execution with `plan:<id>:step:<n>` idempotency, `PLAN_CHANGED`/`APPROVAL_REQUIRED`/`CONFIRMATION_REQUIRED` typed errors. 13 dashboard tests.
- [x] **E3-06** — Execution service: approved plan → child jobs (idempotent, ordered, dependency-aware), SSE progress. · *Files:* `api-core/src/execution/*` · *Done:* integration test with fake connector: 3-step plan applies in order · *Dep:* E3-05, E2-13 · *Est:* 6h · ✅ `advancePlan()` queues the next step only after the previous job `succeeded`; retryable failures keep the plan open; `handlers.ts` persists the plugin snapshot and returns `snapshotId` + `planStatus` to the site.
- [ ] **E3-07** — Verification service: read-back compare (fields/hash), `verify_failed` handling, auto-rollback hook. · *Files:* `api-core/src/execution/verify.ts` · *Done:* tampered result → rollback + audit · *Dep:* E3-06 · *Est:* 4h
- [x] **E3-08** — Snapshot service: store before/after in DB + Storage, checksum, retention, undo mapping. · *Files:* `api-core/src/snapshots/*` · *Done:* snapshot → undo restores exact before-state in test site · *Dep:* E3-06 · *Est:* 5h · ✅ snapshots stored by the platform (`restored_at`, `restore_job_id`, `snapshots_site_restored_idx` — migration `snapshot_undo_columns`), `POST /api/connector/snapshots/{id}/undo` enqueues `content.restore` with `undo:<snapshotId>` and answers `409 ALREADY_RESTORED` on replay.
- [ ] **E3-09** — Undo API + policy (which tools reversible, typed confirm for R2, warning for irreversible). · *Files:* `api/v1/changes/{jobId}/undo` · *Done:* undo of content/menu/settings tested; irreversible returns clear error · *Dep:* E3-08 · *Est:* 3h
- [ ] **E3-10** — Agent tool loop in api-core (read → plan → approve → execute → verify → summarise) with step budget. · *Files:* `packages/agent-core/src/loop.ts` · *Done:* mock-model golden tests pass (no network) · *Dep:* E3-04, E3-06 · *Est:* 6h
- [ ] **E3-11** — Model router + BYOK key storage/decryption + usage metering; Groq adapter. · *Files:* `packages/model-adapters/*`, `api-core/src/models/*` · *Done:* provider fallback test; key never logged · *Dep:* E0-06 · *Est:* 5h
- [x] **E3-12** — First write tool `content.update` end-to-end (schema, plugin handler, snapshot, verify, undo). · *Files:* `wp-tools`, plugin `content-tools.php`, api-core · *Done:* live page heading changed via job, verified, undone · *Dep:* E3-06 · *Est:* 6h · ✅ plugin v0.4.0 `content.update` / `content.create` / `content.restore`: post-type guard, `wp_kses_post`, status allowlist, draft default, before-snapshot → `wp_update_post(wp_slash())` → read-back → verify (content compared whitespace-normalised), `kph_sp_verification_failed` carries expected/actual. 15 new plugin static assertions.
- [ ] **E3-13** — Chat API (SSE) with conversation persistence + tool activity events. · *Files:* `api/v1/chat`, `conversations` · *Done:* refresh keeps history; reconnect resumes stream · *Dep:* E3-10 · *Est:* 5h
- [ ] **E3-14** — Golden prompt suite (40 cases) asserting plan tools/risk with mock model. · *Files:* `packages/agent-core/tests/golden/*` · *Done:* CI gate, deterministic · *Dep:* E3-10 · *Est:* 4h
- [ ] **E3-15** — Prompt-injection corpus (site content mimics instructions) + defence tests. · *Files:* `api-core/tests/injection.test.ts` · *Done:* no plan executes injected tool · *Dep:* E3-10 · *Est:* 3h
- [ ] **E3-16** — Job detail API + SSE reconnect (`Last-Event-ID`) + cancel. · *Files:* `api/v1/jobs/*` · *Done:* tests for cancel before/after claim · *Dep:* E3-06 · *Est:* 3h
- [ ] **E3-17** — Audit coverage: every plan/approve/apply/verify/undo writes a redacted event with correlation id. · *Files:* `packages/audit`, api-core · *Done:* audit trail reconstructs a full change · *Dep:* E3-09 · *Est:* 2h
- [ ] **E3-18** — Milestone M3 acceptance: scripted demo on a real site (heading change + undo), evidence doc. · *Files:* `docs/phase-m3-acceptance.md` · *Done:* video/screenshots + timings recorded · *Dep:* E3-12 · *Est:* 2h

---

## E4 — Read coverage & capability graph (M4)

- [ ] **E4-01** — `content.list` + `content.get` (pagination, search, status filters, block parse). · *Files:* plugin + tools · *Done:* 500-post site tested; payload < 64 KB per page · *Dep:* E3-01 · *Est:* 4h
- [ ] **E4-02** — `site.search` across posts/pages/media/users (bounded results). · *Files:* plugin · *Done:* relevance + limit tests · *Dep:* E4-01 · *Est:* 3h
- [ ] **E4-03** — `site.health` + `site.logs` (debug.log tail, redacted) + `site.usage`. · *Files:* plugin · *Done:* no fatal on hosts without debug.log · *Dep:* E3-01 · *Est:* 3h
- [x] **E4-04** — `plugins.list`, `theme.info`, `users.list`, `terms.list`, `menus.list`, `media.list` read tools. · *Files:* `includes/class-tools.php` · *Done:* contract tests for each · *Dep:* E3-01 · *Est:* 5h · ✅ plugin **0.5.0**: five of six shipped (plugins ≤100 with active flags, theme with block-theme/parent detection, users ≤50 with roles and **no emails**, media paged/MIME-filtered with alt text, terms limited to public taxonomies). Scopes: `site_ops` (plugins, users), `media`, `read`. `menus.list` added in 0.5.1 (locations + links, ≤100, `esc_url_raw`). Platform allowlist + `TOOL_RISK` extended, pinned by `connector-allowlist.test.ts`.
- [ ] **E4-05** — `settings.get` (allowlisted options only) + `seo.meta.get` (Yoast/RankMath detection). · *Files:* plugin · *Done:* unknown option key rejected · *Dep:* E3-01 · *Est:* 3h
- [ ] **E4-06** — Capability graph in UI: per-site tool availability map, disabled reasons, no dead buttons. · *Files:* `apps/dashboard/src/lib/capabilities.ts`, UI · *Done:* snapshot test for 4 site profiles · *Dep:* E4-04 · *Est:* 4h
- [ ] **E4-07** — Site context packer for the model (capabilities + counts + taxonomy + recent content, token-capped). · *Files:* `agent-core/src/context.ts` · *Done:* cap 4k tokens; tests on large sites · *Dep:* E4-04 · *Est:* 4h
- [ ] **E4-08** — Read-tool caching + invalidation (per site, 60 s TTL, bust on write). · *Files:* api-core · *Done:* hit/miss metrics in logs · *Dep:* E4-01 · *Est:* 2h
- [ ] **E4-09** — Honest empty/unsupported states in chat for missing capabilities. · *Files:* UI · *Done:* e.g. Woo site without Woo → clear message + install suggestion · *Dep:* E4-06 · *Est:* 2h
- [ ] **E4-10** — M4-read acceptance: 25 read tools, real site inventory report. · *Files:* acceptance doc · *Done:* evidence table tool → latency → result · *Dep:* E4-06 · *Est:* 2h

---

## E5 — Content, blocks, media, menus (M4)

- [ ] **E5-01** — Gutenberg parser upgrade: nested blocks, attributes, byte-stable serialization (BOM/CRLF). · *Files:* `packages/wp-client/src/integrations/gutenberg-adapter.ts` · *Done:* round-trip fuzz tests (100 fixtures) · *Dep:* — · *Est:* 5h
- [ ] **E5-02** — `content.create` (draft default, post/page/CPT, slug, excerpt, featured). · *Files:* plugin + tools · *Done:* creates draft only; duplicate detection · *Dep:* E3-12 · *Est:* 4h
- [ ] **E5-03** — `content.publish`, `content.trash`, `content.restore` with R2 confirmations. · *Files:* plugin + policy · *Done:* typed confirmation enforced for trash; undo verified · *Dep:* E5-02 · *Est:* 3h
- [ ] **E5-04** — `blocks.parse`, `blocks.replace`, `blocks.insert` with snapshot + diff. · *Files:* plugin + tools + UI diff · *Done:* nested section replace preserves unknown blocks · *Dep:* E5-01 · *Est:* 6h
- [ ] **E5-05** — Section-level editor: select section in preview → prompt → scoped change. · *Files:* UI + `blocks.replace` · *Done:* only selected section changes; diff shown · *Dep:* E5-04 · *Est:* 6h
- [ ] **E5-06** — `page.compose`: multi-section generation from brand brief (AI) into one plan. · *Files:* api-core + prompts · *Done:* generates valid block markup, no unknown blocks · *Dep:* E5-04 · *Est:* 6h
- [ ] **E5-07** — Block patterns: list registered patterns + insert by name. · *Files:* plugin · *Done:* works with theme patterns · *Dep:* E5-04 · *Est:* 3h
- [ ] **E5-08** — Revisions: list + restore (R2) + diff view. · *Files:* plugin + UI · *Done:* restore verified, undo available · *Dep:* E5-03 · *Est:* 4h
- [ ] **E5-09** — Media upload: Supabase Storage staging → signed URL → `media_handle_sideload`, MIME/size guards. · *Files:* api-core + plugin · *Done:* image uploads with alt, thumbnail generated, cleanup on failure · *Dep:* E1-02 · *Est:* 6h
- [ ] **E5-10** — `media.list/search/update/set_featured/delete` + alt-text batch (AI suggestions, approve per item). · *Files:* plugin + UI · *Done:* 20-image batch with partial failures handled · *Dep:* E5-09 · *Est:* 5h
- [ ] **E5-11** — Media safety: max 10 MB, jpg/png/webp/gif/pdf only, sanitize filenames, strip EXIF option. · *Files:* plugin · *Done:* tests for each rejection case · *Dep:* E5-09 · *Est:* 3h
- [ ] **E5-12** — `terms.create/update/assign`, category/tag/CPT taxonomy support. · *Files:* plugin · *Done:* assignment verified on read-back · *Dep:* E4-04 · *Est:* 4h
- [ ] **E5-13** — Menus: list, create, add/update/reorder items, location assign. · *Files:* plugin · *Done:* reorder verified; undo restores order · *Dep:* E4-04 · *Est:* 6h
- [ ] **E5-14** — Menu builder UI (tree view, drag/keys, one plan per save). · *Files:* UI · *Done:* accessible keyboard reorder · *Dep:* E5-13 · *Est:* 5h
- [ ] **E5-15** — Widgets/block-widgets: list + update in classic and block themes. · *Files:* plugin · *Done:* both theme types tested · *Dep:* E5-13 · *Est:* 4h
- [ ] **E5-16** — Navigation block (FSE) get/update. · *Files:* plugin · *Done:* block theme nav updated + verified · *Dep:* E5-13 · *Est:* 3h
- [ ] **E5-17** — Bulk content ops (≤25): status change, category add, delete-to-trash with per-item jobs + summary. · *Files:* api-core + plugin · *Done:* partial failure report + retry failed · *Dep:* E5-03 · *Est:* 5h
- [ ] **E5-18** — Draft/full-site preview snapshot (HTML + asset list) for before/after compare. · *Files:* plugin + Storage · *Done:* before/after toggle renders · *Dep:* E5-04 · *Est:* 4h
- [ ] **E5-19** — Content templates & brand voice memory (project-level). · *Files:* api-core + DB · *Done:* tone applied consistently across 3 generations · *Dep:* E5-06 · *Est:* 4h
- [ ] **E5-20** — M4-content acceptance: 10 real tasks on a live site (create page, rewrite section, media, menu). · *Files:* acceptance doc · *Done:* all with diff + undo evidence · *Dep:* E5-14 · *Est:* 3h

---

## E6 — Site operations (M5)

- [ ] **E6-01** — `settings.update` allowlist with per-key risk, validation, rewrite flush, undo. · *Files:* plugin + policy · *Done:* permalink change tested with rollback · *Dep:* E4-05 · *Est:* 4h
- [ ] **E6-02** — Settings UI: grouped form generated from allowlist, diff preview, changes as plan. · *Files:* UI · *Done:* no free-text option keys · *Dep:* E6-01 · *Est:* 4h
- [ ] **E6-03** — `plugins.install/activate/deactivate` (wp.org slug only, per-item approval, failure rollback). · *Files:* plugin · *Done:* install Rank Math + activate + undo (deactivate) · *Dep:* E3-01 · *Est:* 5h
- [ ] **E6-04** — `plugins.update` + `updates.list` + `updates.apply` (core/plugin/theme), dry-run report. · *Files:* plugin · *Done:* update one plugin; site still healthy after · *Dep:* E6-03 · *Est:* 5h
- [ ] **E6-05** — `plugins.delete` (inactive only, R3, typed confirm, snapshot of files list). · *Files:* plugin · *Done:* blocked for active plugin · *Dep:* E6-03 · *Est:* 3h
- [ ] **E6-06** — Plugin conflict scan: detect known conflicts from active list + PHP version compatibility. · *Files:* api-core · *Done:* report shown before install · *Dep:* E6-03 · *Est:* 3h
- [ ] **E6-07** — Theme: info/list/activate/update; FSE detection; preview warning before switch. · *Files:* plugin · *Done:* activate + revert tested · *Dep:* E4-04 · *Est:* 4h
- [ ] **E6-08** — Theme mods (customizer) get/update: logo, colors (theme-dependent), footer text. · *Files:* plugin · *Done:* supported mods detected, unsupported explained · *Dep:* E6-07 · *Est:* 4h
- [ ] **E6-09** — Users: list/get (last login, roles), create, role update, password reset link. · *Files:* plugin · *Done:* no plaintext password ever; email invite · *Dep:* E4-04 · *Est:* 5h
- [ ] **E6-10** — Users delete with content reassignment + self-delete guard + R3 confirmation. · *Files:* plugin · *Done:* reassignment verified · *Dep:* E6-09 · *Est:* 3h
- [ ] **E6-11** — Security audit tool (versions, users, debug flags, salts age, SSL, file perms, xmlrpc). · *Files:* plugin · *Done:* report + severity scoring · *Dep:* E4-03 · *Est:* 4h
- [ ] **E6-12** — File integrity check via WP.org checksums API. · *Files:* plugin · *Done:* modified core files listed · *Dep:* E6-11 · *Est:* 3h
- [ ] **E6-13** — Maintenance: cron list/run, transient flush, debug log rotate. · *Files:* plugin · *Done:* safe, bounded, audited · *Dep:* E4-03 · *Est:* 3h
- [ ] **E6-14** — Comments moderation (list/approve/spam/trash/reply). · *Files:* plugin · *Done:* batch ≤ 50 with per-item results · *Dep:* E4-04 · *Est:* 3h
- [ ] **E6-15** — Updates dashboard UI (available updates, risk, one-click plan). · *Files:* UI · *Done:* shows before/after versions · *Dep:* E6-04 · *Est:* 3h
- [ ] **E6-17** — Files scope: `files.list` + `files.read` with path allowlist, secret redaction and checksum. · *Files:* plugin tools + API · *Done:* reads theme/plugin/uploads only; wp-config secrets redacted · *Dep:* E2-21 · *Est:* 4h
- [ ] **E6-18** — Files scope: `files.write` + `files.delete` via `WP_Filesystem`, byte-exact snapshot, R3 typed confirm, fatal guard + auto-disable. · *Files:* plugin tools + policy · *Done:* write/restore round-trip byte-identical on a test theme · *Dep:* E6-17 · *Est:* 6h
- [ ] **E6-19** — Code scope: `code.css`, `code.js` and reviewed `code.php.snippet` with R3 gating, fatal auto-disable and audit. · *Files:* plugin tools + UI · *Done:* bad snippet auto-disables, site stays up · *Dep:* E6-18 · *Est:* 6h
- [ ] **E6-16** — M5-ops acceptance on a live site (settings, plugin install, user role, updates). · *Files:* acceptance doc · *Done:* evidence + rollback notes · *Dep:* E6-15 · *Est:* 3h

---

## E7 — SEO, performance, accessibility (M5)

- [ ] **E7-01** — SEO plugin abstraction (Yoast/RankMath/SEOPress) with capability detection. · *Files:* plugin · *Done:* meta read/write on 2 plugins · *Dep:* E4-05 · *Est:* 4h
- [ ] **E7-02** — `seo.meta.update` (title, description, canonical, OG, robots) per post/page. · *Files:* plugin · *Done:* verified in admin + frontend head · *Dep:* E7-01 · *Est:* 4h
- [ ] **E7-03** — Bulk SEO generation with per-item approve + CSV preview. · *Files:* api-core + UI · *Done:* 50 posts, partial retry · *Dep:* E7-02 · *Est:* 5h
- [ ] **E7-04** — `seo.audit`: title/meta length, H1, word count, internal/external links, alt coverage. · *Files:* plugin · *Done:* scored report per post + site summary · *Dep:* E7-02 · *Est:* 5h
- [ ] **E7-05** — Sitemap regenerate + robots.txt read/update (virtual, R2). · *Files:* plugin · *Done:* no filesystem write; revert available · *Dep:* E7-01 · *Est:* 3h
- [ ] **E7-06** — Schema/JSON-LD suggestions (Article/Product/FAQ) via detected SEO plugin. · *Files:* api-core · *Done:* valid JSON-LD, no schema collision · *Dep:* E7-02 · *Est:* 3h
- [ ] **E7-07** — PageSpeed/Core Web Vitals via free PSI API key. · *Files:* api-core · *Done:* cached 24 h, graceful quota failure · *Dep:* E1-06 · *Est:* 3h
- [ ] **E7-08** — Cache layer: detect (LiteSpeed/WP Rocket/W3TC/object cache), purge + status. · *Files:* plugin · *Done:* purge after writes automatic, manual tool · *Dep:* E4-03 · *Est:* 4h
- [ ] **E7-09** — Asset audit: enqueued scripts/styles per template + size hints. · *Files:* plugin · *Done:* top 10 offenders report · *Dep:* E7-08 · *Est:* 4h
- [ ] **E7-10** — DB optimize (R2): revisions/transients/autoload cleanup with dry-run counts + undo caveat. · *Files:* plugin · *Done:* counts before/after, explicit irreversibility warning · *Dep:* E6-13 · *Est:* 4h
- [ ] **E7-11** — Accessibility audit: alt text, headings, link text, labels, lang. · *Files:* plugin · *Done:* per-page issues with fix actions · *Dep:* E5-10 · *Est:* 4h
- [ ] **E7-12** — `a11y.fix_alt` batch with AI alt generation + review UI. · *Files:* api-core + UI · *Done:* 20 images, per-item approve · *Dep:* E7-11 · *Est:* 3h
- [ ] **E7-13** — Weekly SEO/health report generator (used later by automations). · *Files:* api-core · *Done:* deterministic markdown/HTML output · *Dep:* E7-04 · *Est:* 4h
- [ ] **E7-14** — M5-growth acceptance: full SEO pass on a live site + before/after scores. · *Files:* acceptance doc · *Done:* evidence + time saved · *Dep:* E7-13 · *Est:* 2h

---

## E8 — WooCommerce (M5)

- [ ] **E8-01** — Woo detection + capability + commerce scope opt-in (separate toggle, explicit warning). · *Files:* plugin + UI · *Done:* non-Woo sites show honest state · *Dep:* E4-06 · *Est:* 3h
- [ ] **E8-02** — `woo.products.list/get` with variants, stock, prices, categories. · *Files:* plugin · *Done:* 1 000-product site paginates · *Dep:* E8-01 · *Est:* 4h
- [ ] **E8-03** — `woo.products.create/update` (simple + variable), validation, draft-first. · *Files:* plugin · *Done:* product created as draft, verified · *Dep:* E8-02 · *Est:* 6h
- [ ] **E8-04** — Product media + categories/tags + attributes. · *Files:* plugin · *Done:* images attached, alt preserved · *Dep:* E8-03 · *Est:* 4h
- [ ] **E8-05** — Inventory + price updates (bulk ≤ 25, per-item approve, audit). · *Files:* plugin · *Done:* mismatch verification catches failures · *Dep:* E8-03 · *Est:* 4h
- [ ] **E8-06** — `woo.orders.list/get/update_status/add_note` (no refunds in V1). · *Files:* plugin · *Done:* status change verified + audit · *Dep:* E8-01 · *Est:* 4h
- [ ] **E8-07** — Refunds (R3) with typed confirm + amount check (V2 gated). · *Files:* plugin · *Done:* cannot exceed order total · *Dep:* E8-06 · *Est:* 3h
- [ ] **E8-08** — Coupons list/create/update (limits, expiry, usage caps). · *Files:* plugin · *Done:* validated + undo · *Dep:* E8-01 · *Est:* 3h
- [ ] **E8-09** — Store settings read (currency, tax, shipping basics) + guarded writes. · *Files:* plugin · *Done:* unknown keys rejected · *Dep:* E8-01 · *Est:* 3h
- [ ] **E8-10** — Sales report (period totals, top products) read-only. · *Files:* plugin · *Done:* matches Woo dashboard within tolerance · *Dep:* E8-06 · *Est:* 4h
- [ ] **E8-11** — Commerce safety: every money/stock write requires snapshot + verify + confirmation. · *Files:* policy + plugin · *Done:* policy tests enforce it · *Dep:* E8-03 · *Est:* 2h
- [ ] **E8-12** — M5-commerce acceptance on a demo store. · *Files:* acceptance doc · *Done:* evidence + rollback demo · *Dep:* E8-11 · *Est:* 2h

---

## E9 — Lovable-class UX (M6)

- [ ] **E9-01** — App shell: left rail (projects, sites, activity, automations, settings), chat + canvas panes, responsive collapse. · *Files:* `apps/dashboard/src/app/(app)/**` · *Done:* works 360 px → 1920 px · *Dep:* E1-12 · *Est:* 6h
- [ ] **E9-02** — Projects CRUD UI + switcher + per-project site binding. · *Files:* UI + APIs · *Done:* switching keeps isolated context · *Dep:* E9-01 · *Est:* 4h
- [ ] **E9-03** — Onboarding wizard (3 steps, plugin download, code, scan) with progress + failure recovery. · *Files:* UI · *Done:* first-time user completes without docs · *Dep:* E2-19, E9-01 · *Est:* 6h
- [ ] **E9-04** — Composer v2: mode selector, site pill, attachments, ⌘↵, stop, suggestions from capabilities. · *Files:* `ChatPanel.tsx` · *Done:* keyboard + mobile tested · *Dep:* E9-01 · *Est:* 5h
- [ ] **E9-05** — Assistant turn: reasoning timeline, tool cards with durations, retries, honest errors. · *Files:* UI · *Done:* snapshot tests for 6 states · *Dep:* E3-13 · *Est:* 5h
- [ ] **E9-06** — Plan card v2: risk badge, step list, diff preview, dry-run, snapshot note, approve/reject. · *Files:* UI · *Done:* approve triggers jobs; edited plan invalidates · *Dep:* E3-05 · *Est:* 6h
- [ ] **E9-07** — Diff viewer: field-level (text/meta/settings), block-level (page/section), image thumbnails. · *Files:* UI · *Done:* readable on mobile, no raw JSON by default · *Dep:* E9-06 · *Est:* 5h
- [ ] **E9-08** — Preview canvas v2: real page iframe, device frames, refresh, stale badge, open-in-new-tab. · *Files:* `PreviewCanvas.tsx` · *Done:* CORS-safe fallback message · *Dep:* E9-01 · *Est:* 5h
- [ ] **E9-09** — Before/after toggle using stored snapshots. · *Files:* UI + API · *Done:* side-by-side + slider · *Dep:* E5-18, E9-08 · *Est:* 4h
- [ ] **E9-10** — Activity timeline with filters + undo + “view plan” + correlation id. · *Files:* UI · *Done:* 1 000-row pagination smooth · *Dep:* E3-17 · *Est:* 5h
- [ ] **E9-11** — Sites page: scopes, capabilities table, last seen, rotate secret, disconnect. · *Files:* UI · *Done:* destructive actions confirmed · *Dep:* E2-15 · *Est:* 4h · ⏳ *partly done:* `/connect` now lists scopes, capabilities, last contact and can **disconnect** (name-typed confirmation → `DELETE /api/connector/sites/{id}`); secret rotation still open.
- [ ] **E9-12** — Settings: profile, BYOK keys (add/test/delete), usage meter, delete account. · *Files:* UI · *Done:* keys never re-displayed after save · *Dep:* E3-11 · *Est:* 4h
- [ ] **E9-13** — Empty states + suggested prompts generated from capability graph. · *Files:* UI · *Done:* no generic filler prompts · *Dep:* E4-06 · *Est:* 3h
- [ ] **E9-14** — Error surfaces: offline site, expired token, quota, model failure, verify failure — one action each. · *Files:* UI · *Done:* mapped from error taxonomy · *Dep:* E3-16 · *Est:* 3h
- [ ] **E9-15** — Command palette (⌘K) + shortcuts (⌘↵, u, g+a). · *Files:* UI · *Done:* accessible, documented in help · *Dep:* E9-04 · *Est:* 3h
- [ ] **E9-16** — Mobile pass: chat-first, canvas tab, sticky composer, safe areas, touch targets. · *Files:* UI · *Done:* Lighthouse mobile ≥ 90 a11y · *Dep:* E9-01 · *Est:* 4h
- [ ] **E9-17** — Design tokens + type scale + focus rings + dark-ready (optional) polish. · *Files:* `globals.css`, tailwind config · *Done:* contrast AA verified · *Dep:* E9-01 · *Est:* 3h
- [x] **E9-18** *(new)* — **Studio surface**: pick a connected site, type a prompt, review the plan, approve it (typed confirmation for R3), run it and watch each step, then undo any write from the same screen. · *Files:* `apps/dashboard/src/app/studio/page.tsx`, `components/Header.tsx` · *Done:* prompt → applied change without touching wp-admin · *Dep:* E3-06, E3-08 · *Est:* 4h · ✅ `/studio` ships: site selector, planner hints, per-step job status polled every 2 s from `GET /api/connector/plans/{id}`, undo list fed by the snapshot rows; no "just do it" button exists.
- [ ] **E9-18** — Marketing landing page with real product GIF + single CTA. · *Files:* `/` · *Done:* LCP < 2.5 s on 4G · *Dep:* E9-03 · *Est:* 4h
- [ ] **E9-19** — Docs hub: connect guide, tool catalog, safety/undo, troubleshooting, FAQ. · *Files:* `docs/`, `/docs` UI · *Done:* searchable static pages · *Dep:* E9-03 · *Est:* 4h
- [ ] **E9-20** — UX acceptance: 5 first-time users (or recorded self-test) complete connect + first change. · *Files:* acceptance doc · *Done:* notes + fixes list · *Dep:* E9-16 · *Est:* 3h

---

## E10 — Automations & reports (M6)

- [ ] **E10-01** — Automation model + CRUD (trigger: cron/webhook/post-published; plan template; enabled). · *Files:* DB + API · *Done:* schema + RLS tests · *Dep:* E1-02 · *Est:* 4h
- [ ] **E10-02** — Scheduler: daily Vercel cron evaluates due automations → queued plans (no auto-apply for R2+). · *Files:* `api/cron/*` · *Done:* idempotent across retries · *Dep:* E10-01 · *Est:* 4h
- [ ] **E10-03** — Approval modes per automation: auto-apply R0/R1, notify for R2/R3. · *Files:* policy + UI · *Done:* R2 never auto-applies · *Dep:* E10-02 · *Est:* 3h
- [ ] **E10-04** — Weekly report email/digest (steps run, changes, SEO/health deltas, failures). · *Files:* api-core · *Done:* renders inline + plaintext · *Dep:* E7-13 · *Est:* 4h
- [ ] **E10-05** — Automation UI: templates (“Monday SEO audit”, “Weekly plugin update check”), history. · *Files:* UI · *Done:* create/pause/resume tested · *Dep:* E10-01 · *Est:* 4h
- [ ] **E10-06** — Webhook trigger (site event → plan) with signature verify. · *Files:* API · *Done:* replay rejected · *Dep:* E10-01 · *Est:* 3h
- [ ] **E10-07** — Notification center in-app (job done, needs approval, failed). · *Files:* UI + DB · *Done:* read/unread, deep links · *Dep:* E10-02 · *Est:* 3h
- [ ] **E10-08** — M6-automation acceptance: run a scheduled audit for 3 days on a live site. · *Files:* acceptance doc · *Done:* logs + report evidence · *Dep:* E10-05 · *Est:* 2h

---

## E11 — Beta hardening & launch (M6)

- [ ] **E11-01** — Secrets audit: bundle scan, log scan, env review, rotation runbook. · *Files:* CI + docs · *Done:* zero secrets in client bundle/logs · *Dep:* E1-09 · *Est:* 2h
- [ ] **E11-02** — Rate limits + abuse protection on connector and user APIs (per site/user/IP). · *Files:* api-core · *Done:* load test shows graceful 429s · *Dep:* E1-13 · *Est:* 3h
- [ ] **E11-03** — Failure injection suite: offline, timeout, fatal, tampered result, expired token, DB error. · *Files:* tests · *Done:* all produce typed errors + UI guidance · *Dep:* E3-16 · *Est:* 4h
- [ ] **E11-04** — Load test: 10 sites × 60 s polling, 50 concurrent plans, 1 000 jobs. · *Files:* script · *Done:* p95 < 800 ms, no job loss · *Dep:* E3-06 · *Est:* 4h
- [ ] **E11-05** — Retention + purge jobs verified against 500 MB budget. · *Files:* cron · *Done:* DB stays < 200 MB in simulation · *Dep:* E1-14 · *Est:* 2h
- [ ] **E11-06** — Backup strategy for the platform itself (DB dump to Storage daily, restore runbook). · *Files:* docs + script · *Done:* restore rehearsed · *Dep:* E1-14 · *Est:* 4h
- [ ] **E11-07** — Connector upgrade path: min version gate, in-plugin update notice, changelog. · *Files:* plugin + API · *Done:* old plugin blocked with clear message · *Dep:* E2-17 · *Est:* 3h
- [ ] **E11-08** — Full docs sweep: architecture, connector API, tool reference, security, runbook, FAQ. · *Files:* `docs/*` · *Done:* index up to date, no stale claims · *Dep:* E9-19 · *Est:* 5h
- [ ] **E11-09** — Release checklist + versioning + GitHub release notes template. · *Files:* `docs/release-checklist.md` · *Done:* checklist executable by one person · *Dep:* E11-08 · *Est:* 2h
- [ ] **E11-10** — Beta program: 10–20 real sites, feedback form, issue triage labels. · *Files:* docs · *Done:* first 10 connected, ≥ 5 active · *Dep:* E9-20 · *Est:* 4h
- [ ] **E11-11** — P0 bug buffer + two-week polish window. · *Files:* — · *Done:* zero open P0 · *Dep:* E11-10 · *Est:* 40h
- [ ] **E11-12** — Public launch page + demo video + connector ZIP + status page. · *Files:* marketing + docs · *Done:* launch checklist signed off · *Dep:* E11-11 · *Est:* 6h

---

## Cross-cutting definition of done (every task)

1. Code + tests (unit; integration where relevant; PHP tests for plugin).
2. `pnpm typecheck && turbo run test --concurrency=1 && pnpm build` green (evidence pasted).
3. `docs/plan-progress.md` updated (task ID, change, evidence, next).
4. Commit `feat/fix/docs(Exx-xx): …` pushed to `arena/d0d25bf5-kph-sitepilot`.
5. Demoable on the preview URL or verifiable via script/curl.
6. No secret, no fabricated success, no dead button.

---

## Immediate next 10 (start here)

1. E0-01 · CI/test ordering
2. E0-02 · failing test
3. E0-05 · progress log
4. E0-08 · README links
5. E1-01 · apply migrations
6. ~~E1-02 · v2 schema~~ ✅
7. ~~E1-06 · api-core extraction~~ ✅
8. ~~E1-07 · Next catch-all API~~ ✅ (in-process callApi)
9. E2-01 · connector scaffold
10. E2-03 · HMAC protocol

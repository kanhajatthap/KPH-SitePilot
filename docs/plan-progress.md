# Plan Progress Log

> One entry per executed micro-task. No entry without evidence.
> Format: date · task ID · change · evidence · next.

| Date | Task | Change | Evidence | Next |
|---|---|---|---|---|
| 2026-11-01 | AUDIT | Full repository + deployment audit before planning; master plan and backlog written | `pnpm install --frozen-lockfile` ✅ · `pnpm build` 9/9 ✅ (50.7 s) · tests **330 passed / 1 failed** (`agent-core › workspace-task-engine › waiting_for_approval`) · Vercel `kph-sitepilot` has **0 env vars** · Supabase `zgkewnhrymswhucigtib` had **0 migrations / 0 tables / 0 edge functions** · CI run `40459112881` on `main` = **failure** | E0-01 |
| 2026-11-01 | E0-02 | Fixed the failing writes-approval test. Root cause: the test injected its fake transport as `fetchFn`, but `WordPressClient` only read `transport`, so the option was silently ignored and the client used real `fetch` against `http://test.local`. Accepted `fetchFn` as a deprecated alias, migrated tests to `transport`, added a regression test. | `pnpm --filter @wp-agent/agent-core test` → **67/67 pass** · full `pnpm test --force` → **332 tests, 0 fail** · regression test asserts the alias is used and real fetch is not | E0-01 |
| 2026-11-01 | E0-01 | CI + docs run tests through Turbo (`pnpm test`) instead of `pnpm -r test`, so `test.dependsOn: ["^build"]` builds workspace packages before tests import `dist/`. Documented the trap in `tests/README.md`. | Deleted every `dist/`, then `pnpm test --force` → **15/15 tasks, 332 tests, 0 cached, 25.4 s** | E1-01 |
| 2026-11-01 | E1-01 | Applied both repo migrations to the live Supabase project `zgkewnhrymswhucigtib` (tables, indexes, RLS, policies, view, trigger, rate-limit RPC, chat history). | `list_migrations` → `20261101072632 saas_schema`, `20261101072639 dashboard_chat_history` · schema probe: **9 public tables, 9 with RLS, 17 policies, 1 view, 3 functions** · `wordpress_connection_metadata` view present | E2-01 |
| 2026-11-01 | E2-03 | New `@wp-agent/connector-protocol` package: canonical string `<ts>.<nonce>.<sha256(body)>`, HMAC-SHA256 signing, timing-safe verification, timestamp window, nonce/body-size rules, typed error codes. PHP `KPH_SP_Signature` mirrors it; four shared fixtures drive both suites. | `pnpm --filter @wp-agent/connector-protocol test` → **17/17 pass** · fixtures cover latin, unicode, empty and CRLF bodies · PHP files parse with `scripts/php-lint.mjs` (php-parser 7.4) · CI job runs the PHP half with real PHP 8.2 | E2-01 |
| 2026-11-01 | CI | First green CI run on this branch (main was red): both jobs pass, including the new PHP job that executes the connector protocol + static tests with real PHP 8.2. | Run `41285152374`: **Build, Lint & Test — pass (1 m 33 s)**, **WordPress Connector Checks — pass (10 s)**, Vercel — pass | E1-02 |
| 2026-11-01 | E2-01 | Connector plugin scaffold `wordpress/kph-sitepilot-connector`: bootstrap, settings + 7 access scopes (default full, incl. `files` and `code`), admin status screen with honest “Not connected” + disabled pairing, scope form with nonce/capability checks, uninstall cleanup, readme, static test, PHP lint script, CI PHP job. | `pnpm typecheck` → **16/16** · `pnpm lint` → **10/10 + PHP parse 10 files** · `pnpm test` → **349 tests** · `pnpm build` → **10/10** · static PHP test written; runtime execution pending CI (no PHP binary in this sandbox) | E2-02 / E2-05 |
| 2026-11-01 | E1-02 | New v2 schema for connected sites: `sites`, `pairing_codes`, `plans`, `approvals`, `jobs`, `job_events`, `snapshots`, `usage_events`, `user_api_keys`, `connector_nonces`, `rate_limits`, `automations`, `feature_flags`; RLS **FORCED** everywhere, owner-only SELECT policies for plans/jobs/events/snapshots/usage/automations, service-only credential tables, `site_metadata` security-barrier view (never exposes token or secret). | Migration applied live as **`20261101074317_sitepilot_v2`** · `pg_class` probe → **13 tables, RLS enabled + forced on all 13, 6 policies** · columns verified per table · anon has **zero** grants, `authenticated` has SELECT only on the read-only set | E1-06 |
| 2026-11-01 | E1-06 | Extracted the 2.7k-line API monolith into **`@wp-agent/api-core`** with transport-neutral `CoreRequest`/`CoreResponse` and a `createCoreHandler()` fetch adapter (streaming SSE supported, hop-by-hop headers stripped, 64 KB body cap preserved). `apps/api` is now a thin Node HTTP adapter that re-exports the core. | `pnpm --filter @wp-agent/api-core test` → **6/6** (health, POST JSON, oversized body → 400, malformed JSON → 400, unknown route → 404, SSE stream) · `@wp-agent/api` **54/54** unchanged · `pnpm build` **11/11** | E1-07 |
| 2026-11-01 | E1-07 | Hosted dashboard no longer dials `127.0.0.1:3001`: every route handler now calls `callApi()` → api-core in-process. `API_SERVER_URL` remains only as an opt-in HTTP transport for debugging. | New **`tests/in-process-api.test.ts`** proves `/api/health` and `/api/chat` answer with `fetch` never called · dashboard **111/111** · `next build` compiles 3 new connector routes + `/connect` | E2-02 |
| 2026-11-01 | E2-02 / E2-06 | Platform pairing: `POST /api/connector/pairing-codes` (auth, 10-min single-use code), `POST /api/connector/pair` (public, rate-limited 10/min/IP, code hash lookup, expiry + reuse + project checks, site row, token+secret returned **once**), `GET /api/connector/sites` (RLS view), AES-256-GCM secret storage under `SITEPILOT_ENCRYPTION_KEY`, SHA-256 token hashing. | **18** pairing/crypto tests + **7** route tests (missing key → 503 `CONFIG_MISSING`, no storage → 503 `STORAGE_UNAVAILABLE`, brute force → 429, no account → 400) · secret never in responses · `site-access` now reads `site_metadata` | E2-05 |
| 2026-11-01 | E2-05 | Connector plugin v0.2.0 can finally pair: admin card with pairing input, platform-URL form, `assets/admin.js` (REST nonce, no secret handling), and admin-only REST routes `POST /pair`, `POST /unpair`, `GET /status`. Server-side validates credential shape before saving anything. | `php-lint` → **11 files parse** · static suite extended (+11 assertions: admin-only guard, nonce usage, no `error_log`, responses carry no token/secret) and simulated locally · real `php -l` + PHP tests run in CI job `wordpress-plugin` | E2-07 |
| 2026-11-01 | GATE | Full gate after this batch. | `pnpm typecheck` **19/19** · `pnpm lint` **11/11 + 11 PHP files** · `pnpm test` **382 pass / 0 fail** (was 349) · `pnpm build` **11/11** | next batch |

## Task status

| Task | Status | Commit |
|---|---|---|
| E0-01 CI test ordering | ✅ done | `45d903f` |
| E0-02 failing writes test | ✅ done | `28f707a` |
| E1-01 apply migrations | ✅ done (live project) | docs commit |
| E2-03 HMAC protocol | ✅ done | protocol commit |
| E2-01 connector scaffold | ✅ done | connector commit |
| E1-02 v2 schema (live) | ✅ done | `20261101074317_sitepilot_v2` |
| E1-06 api-core extraction | ✅ done | this batch |
| E1-07 in-process dashboard API | ✅ done | this batch |
| E2-02 / E2-06 pairing API | ✅ done | this batch |
| E2-05 connector pairing UI | ✅ done | this batch |

## Open blockers

| Blocker | Owner | Workaround |
|---|---|---|
| CI red on `main` at the old commit | us | fixed in this branch; green run expected on the PR |
| No job runner yet: a paired site cannot be driven by prompts until E2-08 (connector auth) + E1-03/E2-10 (claim/execute) land | us | pairing + scopes are live; the UI does not pretend otherwise |
| `SITEPILOT_ENCRYPTION_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are not set on Vercel yet | us | pairing fails closed with `CONFIG_MISSING` / `STORAGE_UNAVAILABLE` until set |
| PHP runtime missing in sandbox | us | `php-parser` syntax gate locally; real `php -l` + PHP tests in CI |
| Connector job polling/claiming not implemented (E2-08 → E2-13) | us | pairing works; jobs queue is next |

## Gate history

| Date | Typecheck | Tests | Build | Notes |
|---|---|---|---|---|
| 2026-11-01 | — | 330 pass / 1 fail | 9/9 | baseline before fixes |
| 2026-11-01 | 16/16 | **349 pass / 0 fail** | 10/10 | after E0-01, E0-02, E2-01, E2-03 |
| 2026-11-01 | — | PHP 8.2 protocol + static tests pass in CI | — | CI run `41285152374` all green |
| 2026-11-01 | 19/19 | 382 pass / 0 fail | 11/11 | after E1-02/E1-06/E1-07/E2-02/E2-05/E2-06 (lint: 11/11 + 11 PHP files) |

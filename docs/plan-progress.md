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

## Task status

| Task | Status | Commit |
|---|---|---|
| E0-01 CI test ordering | ✅ done | `45d903f` |
| E0-02 failing writes test | ✅ done | `28f707a` |
| E1-01 apply migrations | ✅ done (live project) | docs commit |
| E2-03 HMAC protocol | ✅ done | protocol commit |
| E2-01 connector scaffold | ✅ done | connector commit |

## Open blockers

| Blocker | Owner | Workaround |
|---|---|---|
| CI red on `main` at the old commit | us | fixed in this branch; green run expected on the PR |
| Hosted dashboard still calls `127.0.0.1:3001` | us (E1-06, E1-07) | none — next phase |
| Supabase live project has no `sites`/`jobs` v2 schema yet | us (E1-02) | base schema applied; v2 tables next |
| PHP runtime missing in sandbox | us | `php-parser` syntax gate locally; real `php -l` + PHP tests in CI |
| Connector cannot pair yet (no endpoint/job runner) | us (E2-05 → E2-13) | admin screen stays honest, pairing disabled |

## Gate history

| Date | Typecheck | Tests | Build | Notes |
|---|---|---|---|---|
| 2026-11-01 | — | 330 pass / 1 fail | 9/9 | baseline before fixes |
| 2026-11-01 | 16/16 | **349 pass / 0 fail** | 10/10 | after E0-01, E0-02, E2-01, E2-03 |
| 2026-11-01 | — | PHP 8.2 protocol + static tests pass in CI | — | CI run `41285152374` all green |

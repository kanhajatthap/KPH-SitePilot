# Phase 7 Acceptance — Supabase and SaaS Foundation

**Date:** 2026-10-22  
**Status:** **INCOMPLETE**  
**Deployment:** None. No remote Supabase project was linked or changed; no services were purchased and no WordPress mutations were performed.

## Implemented

- Supabase SSR signup, email confirmation, password login, logout, password-reset request, recovery callback, and password update actions in the dashboard. Sessions use server-managed `HttpOnly`, `SameSite=Lax` cookies; the dashboard uses only the public anon key.
- When Supabase is configured, middleware verifies the user with Supabase Auth, redirects unauthenticated page requests, returns `401` for protected APIs, and blocks authenticated legacy API proxies with `503` so SaaS requests cannot fall through to a shared local API.
- Local-only mode is preserved when public Supabase settings are absent.
- Version-controlled schema covers profiles, projects, WordPress connections, proposals, audit events, minimal agent-job metadata, model-usage accounting, and per-user rate limits. RLS is enabled and forced on every table. Project ownership is checked with `auth.uid()`; privileged writes are service-only. Browser users see connection metadata through a filtered view and cannot select encrypted credential bytes.
- `credentials-vault` verifies the user through Supabase Auth, checks project ownership, validates input and local-only site targets, encrypts application credentials with AES-256-GCM (random IV and connection-bound associated data), and supports revoke. Responses contain metadata only; there is no decrypt-to-browser action.
- `agent-proxy` validates identity, project/connection ownership, active status, local target, request size/schema, read-only mode, and an atomic per-user rate limit. It deliberately fails closed until a per-connection agent bridge can use WordPress credentials without exposing them to model providers.
- Added a PostgreSQL/pgTAP RLS tenant-isolation test, mocked auth/middleware and Edge Function tests, public environment examples, Edge Function TypeScript checking, and local/deployment documentation.

## Verification run in this workspace

| Check | Result | Evidence |
|---|---|---|
| `pnpm test` | PASS | Turbo: 15 tasks successful; 205 tests passed across 9 packages, including 12 dashboard auth/config/middleware tests and 17 Edge/RLS-schema tests. |
| `pnpm typecheck` | PASS | 15 Turbo tasks successful plus `tsc --noEmit -p supabase/functions/tsconfig.json`. |
| `pnpm lint` | PASS | 9 Turbo lint/typecheck tasks successful plus Edge Function TypeScript check. |
| `pnpm build` | PASS | 9 Turbo build tasks successful; Next.js production build generated `/login`, `/reset-password`, and `/auth/confirm`. Builds run sequentially to avoid intermittent `.next` manifest/cache races observed with parallel builds on this Windows workspace. |
| Edge credential response checks | PASS (mocked) | Tests verify plaintext username/password are absent from the response and encrypted data is supplied to persistence. |
| SaaS auth/middleware checks | PASS (mocked) | Tests cover login/signup/recovery actions, invalid credentials, local fallback, unauthenticated `401`, and legacy SaaS API denial. |

## Blockers and incomplete acceptance

1. **Live RLS execution is blocked:** Docker, Supabase CLI, and PostgreSQL CLI are unavailable. The pgTAP test at `supabase/tests/database/rls.test.sql` is committed but was not executed against PostgreSQL; the mocked Edge ownership tests and SQL-shape tests do not replace that run.
2. **Hosted Auth integration is not exercised:** no authorized Supabase project/configuration was supplied. Signup/login behavior is unit-tested with mocked Supabase responses, not against a live Auth provider.
3. **SaaS agent execution is not enabled:** `agent-proxy` returns `AGENT_BRIDGE_NOT_CONFIGURED` after authorization/rate checks. A secure per-connection bridge, model invocation, and actual token-usage recording must be implemented before SaaS agent requests can succeed. The dashboard SaaS mode blocks existing `/api/*` operations in the meantime.
4. **Project/site management UI and complete usage workflow remain unfinished:** database policies and the credential Edge Function provide the foundation, but a dashboard flow for creating/selecting multiple projects and connections and model-usage insertion after real provider calls is not wired.

## Safe next steps

1. Install/start Docker and Supabase CLI locally; run `supabase start`, `supabase migration up`, and `supabase test db`.
2. With explicit authorization, configure an isolated Supabase test project and verify email/password signup, login, recovery, protected routes, and cross-user RLS behavior.
3. Implement and test a per-connection read-only agent bridge that decrypts credentials only server-side and keeps them outside prompts, logs, and client responses; retain the Phase 5 approval gate for any later writes.
4. Add project/site selection and persist model usage only after real model calls; then rerun all checks and update this report.

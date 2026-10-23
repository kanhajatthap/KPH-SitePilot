# Authentication Implementation Report

**Date:** 2026-10-23
**Scope:** Supabase Auth, session management, route/API protection, per-user isolation, auth UX
**Status:** Code complete and verified locally. **One manual database step remains** before multi-tenant site operations work (see §8).

---

## 0. Summary

A complete, free-tier authentication layer now sits on top of the existing Supabase + Next.js foundation. No auth provider was added, no Edge Function was created, no package was installed, and no paid service was activated.

| Capability | Status |
| --- | --- |
| Email/password registration | Implemented, unit-tested |
| Email confirmation handling | Implemented (`/auth/confirm`, `/auth/callback`) |
| Login / logout | Implemented, smoke-tested |
| Session persistence and server validation | Implemented (`@supabase/ssr` + `getUser()`) |
| Password recovery | Implemented (`/forgot-password` → email → `/reset-password`) |
| Protected pages | Middleware redirect verified in production runtime |
| Protected APIs | Route-level `401` verified in production runtime |
| Per-user DB isolation | Existing RLS extended with verification tests |
| Open-redirect prevention | Implemented and verified in rendered forms |
| Privileged secrets in browser bundle | Scanned: none present |
| Supabase migration applied | **No — manual step required** |

**Critical bug found and fixed:** `middleware.ts` lived at `apps/dashboard/middleware.ts` while the app is under `src/app`. Next.js 15 therefore never loaded it — unauthenticated users could reach the dashboard. It now lives at `apps/dashboard/src/middleware.ts` and is confirmed compiled (`ƒ Middleware 94.3 kB` in the build output, `Compiling /middleware` in the dev log).

---

## 1. Files changed

### New — authentication core

| File | Purpose |
| --- | --- |
| `apps/dashboard/src/lib/auth/redirect.ts` | `safeNextPath()` open-redirect guard + login URL builder |
| `apps/dashboard/src/lib/auth/routes.ts` | Explicit public/private route inventory |
| `apps/dashboard/src/lib/auth/api.ts` | `authenticateApiRequest()` server-side session verification |
| `apps/dashboard/src/lib/auth/site-access.ts` | `authorizeTargetSite()` ownership enforcement |
| `apps/dashboard/src/lib/auth/messages.ts` | Stable auth error/info codes → user-facing copy |
| `apps/dashboard/src/middleware.ts` | Session gate (moved from app root; see §0) |
| `apps/dashboard/src/components/SessionGuard.tsx` | Client-side expiry watcher (focus + 60 s interval) |
| `apps/dashboard/src/components/auth/AuthLayout.tsx` | Responsive split-screen auth shell |
| `apps/dashboard/src/components/auth/PasswordField.tsx` | Accessible password input with visibility toggle |
| `apps/dashboard/src/components/auth/SubmitButton.tsx` | Pending/spinner state via `useFormStatus` |
| `apps/dashboard/src/components/auth/Alert.tsx` | Error/success/info banner (`role="alert"/"status"`) |
| `apps/dashboard/src/app/register/page.tsx` | Registration page |
| `apps/dashboard/src/app/forgot-password/page.tsx` | Recovery request page |
| `apps/dashboard/src/app/auth/callback/route.ts` | PKCE `?code=` exchange (template compatibility) |
| `apps/dashboard/src/app/api/auth/me/route.ts` | Session probe used by the account menu and expiry guard |

### Modified — auth behaviour

| File | Change |
| --- | --- |
| `apps/dashboard/src/app/auth/actions.ts` | Sign-in/up/out, recovery, password update; safe `next`; error mapping; duplicate detection; confirmation handling |
| `apps/dashboard/src/app/auth/confirm/route.ts` | Token-hash `verifyOtp`, supported types, safe `next`, stable error codes |
| `apps/dashboard/src/app/login/page.tsx` | Redesigned; `next` preservation; status/error states |
| `apps/dashboard/src/app/reset-password/page.tsx` | Requires a real recovery session; explicit invalid-link state |
| `apps/dashboard/src/app/layout.tsx` | Mounts `SessionGuard` when SaaS mode is active |
| `apps/dashboard/src/components/Header.tsx` | Account menu with verified email, change-password link, sign out |
| `apps/dashboard/src/app/api/**/route.ts` (12 files) | `authenticateApiRequest()` at the top of every private handler |
| 9 site-bound API routes | Added `authorizeTargetSite()` after the existing SSRF allowlist |

### New — tests

`apps/dashboard/tests/redirect.test.ts`, `api-auth.test.ts`, `site-access.test.ts`, `secret-boundary.test.ts`; extended `auth.test.ts`, `middleware.test.ts`, `packages/supabase/tests/rls-sql.test.ts`, `supabase/tests/database/rls.test.sql`.

### One unrelated line

`apps/dashboard/src/app/page.tsx:981` was missing the required `name` field on a `TaskStep` created by a concurrent, uncommitted edit. It prevented **any** production build. I added `name: 'Proposing section edit'` — one line, no behaviour change — and left the rest of that file untouched.

---

## 2. Public and protected routes

### Public pages (no session required)

| Route | Purpose |
| --- | --- |
| `/login` | Sign in |
| `/register` | Create account |
| `/forgot-password` | Request reset email |
| `/reset-password` | Consume recovery session and set a new password |
| `/auth/confirm` | Email token-hash confirmation |
| `/auth/callback` | PKCE code exchange |

Signed-in users visiting `/login` or `/register` are redirected to their safe return path. `/reset-password` deliberately stays reachable while signed in, because the recovery link creates a session before the page renders.

### Public APIs

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Local API liveness probe |
| `GET /api/auth/me` | Returns `{mode:'local'}` or the verified user; `401` when the session is missing/expired |

### Protected pages

Everything else, including `/` (builder workspace) and all future `/projects`, `/sites`, `/account` routes. Unauthenticated requests redirect to `/login?next=<safe-path>`; a stale Supabase cookie adds `&reason=session_expired`.

### Protected APIs (all require a verified session in SaaS mode)

`/api/agent`, `/api/builder/detect`, `/api/builder/propose`, `/api/chat`, `/api/draft/revise`, `/api/mutate/apply`, `/api/mutate/propose`, `/api/plan`, `/api/post/get`, `/api/publish/apply`, `/api/publish/propose`, `/api/task/stream`.

Site-bound endpoints additionally require the target origin to be either the deployment-owned `WP_SITE_URL` or an `active` connection visible through the `wordpress_connection_metadata` view (which filters on `auth.uid()`). Otherwise: `403 TARGET_NOT_AUTHORIZED`; if the schema is missing: `503 SCHEMA_NOT_READY`.

---

## 3. Supabase Auth and session implementation

- **Single client path:** `createSupabaseServerClient()` (`@supabase/ssr`) with the public anon key only. No browser Supabase client, no service-role key in the dashboard.
- **Cookies:** `HttpOnly`, `SameSite=Lax`, `Secure` in production, `path=/`. Refreshed cookies from middleware are copied onto redirects so rotation is never lost.
- **Validation:** every request calls `supabase.auth.getUser()`, which verifies the JWT with the Auth server. `getSession()` is never used for authorisation.
- **Registration:** `signUp` with `emailRedirectTo` pointing at `/auth/confirm?next=…`. Three outcomes are handled:
  1. confirmation required → `/login?message=check-email`;
  2. auto-confirm enabled → immediate session and redirect;
  3. duplicate (including Supabase's empty-`identities` response) → `/register?error=duplicate-email`.
- **Recovery:** `resetPasswordForEmail` always reports success to prevent account enumeration (except genuine rate limits). The reset page refuses to render the form without a real session; updating the password signs the recovery session out and sends the user to `/login?message=password-updated`.
- **Logout:** server action clears the Supabase session cookies, then redirects to `/login?message=signed-out`.
- **Expiry:** middleware distinguishes missing vs expired sessions; `SessionGuard` re-checks on focus and every 60 s and redirects with a safe `next`. All private APIs return structured `401` JSON with `code: SESSION_EXPIRED`.
- **Passwords:** validated at 12–128 characters server-side, with confirmation matching. Plaintext is never stored or logged.
- **Open redirects:** `safeNextPath()` accepts only same-origin absolute paths, rejects `//host`, backslashes, control characters, external URLs, oversized values and auth pages. Verified in rendered forms:

  | Input | Hidden `next` value |
  | --- | --- |
  | `https://evil.example` | `/` |
  | `//evil.example` | `/` |
  | `/projects?tab=active` | `/projects?tab=active` |

---

## 4. RLS policies and user isolation

The existing migration already had the right shape; this work verified and extended it rather than rewriting it.

- **8 tables** have both `ENABLE` and `FORCE ROW LEVEL SECURITY`: `profiles`, `projects`, `wordpress_connections`, `change_proposals`, `audit_events`, `agent_jobs`, `model_usage`, `agent_rate_limits`.
- **Owner-scoped policies** use `auth.uid()` (via project ownership for child tables): full CRUD for `projects` and `wordpress_connections`; read-only for `change_proposals`, `audit_events`, `agent_jobs`, `model_usage`; `profiles` self-read only. No browser policy exists for `agent_rate_limits`.
- **Credentials:** browser roles are revoked from all base tables; `wordpress_connection_metadata` is a `security_barrier` view exposing only metadata, filtered by `p.owner_id = (SELECT auth.uid())`. `encrypted_credentials` is never exposed.
- **Privileged writes:** proposal creation/approval, usage accounting and the rate-limit RPC remain service-role only.
- **pgTAP suite** (`supabase/tests/database/rls.test.sql`) now also asserts that user A cannot update or delete user B's project, in addition to the existing SELECT/INSERT/ownership-transfer/credential checks. **Not executed** — there is no local Postgres/Supabase CLI in this environment.
- **Static verification** (`packages/supabase/tests/rls-sql.test.ts`, 11 tests) asserts FORCE RLS, the exact policy matrix, view scoping and the service-role-only RPC. **All pass.**

Live isolation could not be exercised because the schema is not applied to the configured Supabase project (PostgREST returns `404` for `projects`, `profiles` and `wordpress_connection_metadata`). This is the manual step in §8.

---

## 5. Edge Functions

**None created.** Reasons:

1. Registration, login, logout, recovery and session refresh are native Supabase Auth operations — proxying them through an Edge Function would add latency and a new secret surface for zero benefit.
2. Every server-only operation needed by the dashboard already has a Next.js route handler, which now performs its own session verification and site-ownership check.
3. The existing gated Edge Function bridge (Phase 7) is unchanged. Hosted multi-tenant WordPress execution was out of scope and remains denied by default.

---

## 6. Tests actually run

| Suite | Command | Result |
| --- | --- | --- |
| Dashboard (unit) | `pnpm --filter @wp-agent/dashboard test` | **9 files, 64 tests passed** |
| Supabase (unit + static RLS) | `pnpm --filter @wp-agent/supabase test` | **5 files, 36 tests passed** |
| WordPress client regression | `pnpm --filter @wp-agent/wp-client test` | **3 files, 33 tests passed** |
| Audit redaction regression | `pnpm --filter @wp-agent/audit test` | **1 file, 4 tests passed** |
| Production build | `pnpm --filter @wp-agent/dashboard build` | **Passed** |
| Production runtime smoke | `next start` + real HTTP requests | **Passed** (see below) |
| Supabase provider probe | Auth health/settings + invalid login | **Reachable and correct** |

### Auth-specific coverage (dashboard)

- Valid/invalid sign-in, generic credential errors, unconfirmed email.
- Sign-up password policy, confirmation mismatch, invalid email, duplicate registration (both provider shapes), auto-confirm path.
- Recovery request non-enumeration and rate limiting; recovery update without a session; successful update + forced sign-out.
- Logout.
- Middleware: local mode, page redirect + `next`, expired-session reason, API `401`, authenticated API passthrough, public routes, signed-in bounce, unsafe `next`.
- `authenticateApiRequest`: local mode, missing session, expired refresh token, verified identity.
- `authorizeTargetSite`: local mode, deployment site, owned connection, unowned connection, missing schema, malformed URL.
- Secret boundary: no privileged env references, no non-public `NEXT_PUBLIC_*`, no hard-coded provider/Supabase secrets.

### Production runtime smoke (`next start`, real HTTP)

| Request | Observed |
| --- | --- |
| `GET /login`, `/register`, `/forgot-password`, `/reset-password` | `200`, expected headings rendered |
| `GET /` unauthenticated | `307 → /login` |
| `GET /projects` unauthenticated | `307 → /login?next=%2Fprojects` |
| `GET /api/auth/me` unauthenticated | `401 {"code":"UNAUTHORIZED"}` |
| `POST /api/agent` unauthenticated | `401 {"code":"UNAUTHORIZED"}` |
| `GET /auth/confirm` without token | `307 → /login?error=confirmation-invalid` |
| `GET /reset-password` without session | invalid/expired link state |

### Live provider probe (no accounts created)

- Auth health: `GoTrue v2.197.0` reachable.
- Settings: `disable_signup=false`, `mailer_autoconfirm=false`, email provider enabled → **email confirmation is required**.
- Bogus password grant: `400 invalid_credentials` — matches the app's generic error mapping.

### Browser bundle secret scan

Scanned all 39 JS/CSS files in `apps/dashboard/.next/static` for the real local values:

| Secret | Present in client bundle |
| --- | --- |
| `OPENROUTER_API_KEY` (73 chars) | **No** |
| `GEMINI_API_KEY` (53 chars) | **No** |
| `WP_APPLICATION_PASSWORD` (29 chars) | **No** |
| `SUPABASE_SERVICE_ROLE_KEY` / `GITHUB_MCP_PAT` / `VAULT_MASTER_KEY` | Not configured in the dashboard env |

The OpenRouter key is also absent from the dashboard **server** bundle (the dashboard proxies to the API service, which owns it).

---

## 7. Production build result

```
✓ Compiled successfully
✓ Generating static pages (18/18)
ƒ Middleware  94.3 kB
```

Auth routes (`/login`, `/register`, `/forgot-password`, `/reset-password`) are dynamic (`ƒ`); `/` remains static; all API routes and auth callbacks are dynamic. Build completed after the one-line `page.tsx` repair described in §1.

---

## 8. Manual configuration still required

### 8.1 Apply the database migration (blocking for site operations)

The configured Supabase project is reachable for Auth but has **no application schema** (REST returns `404`). Open **Supabase → SQL Editor** and run:

```
supabase/migrations/20261022000000_saas_schema.sql
```

Until then, site-bound API calls fail closed with `503 SCHEMA_NOT_READY`. Registration/login still work because they only touch `auth.users` (the profile trigger will start working once applied).

### 8.2 Auth URL configuration

In **Supabase → Authentication → URL Configuration**:

- Site URL: `http://localhost:3002` (or the deployed origin)
- Redirect URLs: `http://localhost:3002/auth/confirm*`, `http://localhost:3002/auth/callback*` (add production equivalents)

### 8.3 Email templates

For the token-hash flow, point the Confirm signup / Recovery templates at:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/
```

Recovery should use `type=recovery&next=/reset-password`. `/auth/confirm` also accepts a PKCE `?code=` (default `{{ .ConfirmationURL }}` template) and `/auth/callback` is available for explicit callbacks.

### 8.4 Environment

- `NEXT_PUBLIC_SITE_URL` must match the origin used in the email links. It is currently `http://localhost:3002`.
- No new environment variables are required; no service-role key is used by the dashboard.
- Supabase's built-in mailer is rate-limited on the free tier — fine for testing, add SMTP only if you need production volume.

### 8.5 Restart the stale server

A process was already listening on port 3002 and serving an **old build** (it returned `404` for `/register` and did not enforce auth). Verification used port 3005. Restart whatever runs 3002 after applying the changes.

---

## 9. Known limitations and exact next action

1. **No live end-to-end signup/email/reset.** Confirming email requires a real inbox, and creating a test account would mutate your Supabase project and send mail. I verified provider reachability, settings, error mapping, rendered pages, redirects and protected APIs instead. Do not treat email delivery as tested.
2. **Single-tenant local WordPress execution.** Any authenticated user of a deployment may target `WP_SITE_URL`; other sites require an active connection row. There is no connections UI yet, so in SaaS mode the default `test.local` site will be denied unless you register a connection, while `plugin-test.local` (the configured `WP_SITE_URL`) works. Hosted multi-tenant execution remains gated exactly as before.
3. **RLS runtime tests not executed.** The pgTAP file is ready but needs a local Postgres/Supabase instance.
4. **No re-authentication prompt for password change.** A signed-in user can open `/reset-password` and set a new password; the session is ended afterwards. Supabase's `updateUser` accepts this without a current-password challenge.
5. **Concurrent edits.** Other uncommitted work exists in the tree (`api-client.ts`, `types.ts`, `PreviewCanvas.tsx`, `apps/api`, `wp-client`, docs/images). I did not touch it beyond the one-line `page.tsx` build repair. Do not commit blindly.

### Exact next action

1. Apply `20261022000000_saas_schema.sql` in the Supabase SQL Editor.
2. Restart the 3002 server (`pnpm --filter @wp-agent/dashboard dev`).
3. Register a real address at `/register`, confirm from the inbox, sign in, refresh, sign out, then request a reset and complete it.
4. For site operations on `test.local`, insert a project and an active connection for your user using the existing vault encryption helper (`packages/supabase/src/vault.ts`) — never plaintext credentials — or select `plugin-test.local`, which is the deployment-owned site.

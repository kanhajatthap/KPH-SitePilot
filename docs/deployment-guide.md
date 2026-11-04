# KPH SitePilot — hosted deployment guide

> **Scope correction (2026-11-04):** This guide now describes the shipped hosted
> dashboard and signed WordPress connector, not the legacy standalone REST API.
> See the [documentation map](./README.md) and [current release checklist](./release-checklist.md).
> These are operator instructions, not evidence that a deployment was performed.

## 1. Architecture and prerequisites

```text
Browser → same-origin Next.js dashboard routes (Vercel)
                    ├─ Supabase Auth, RLS and connector storage
                    ├─ optional encrypted user BYOK model adapters
                    └─ plans / approvals / snapshots / signed job queue
WordPress Connector → pairing, heartbeat, job claim and result routes
```

The connector is the only WordPress transport. The cloud never fetches arbitrary
WordPress REST/XML-RPC/admin URLs. The dashboard calls core API logic in-process
by default (`apps/dashboard/src/lib/api-call.ts`); a separately deployed Node API
or Supabase Edge proxy is not required for the hosted connector flow.

Prerequisites: Node 22 LTS, the pnpm version pinned in root `package.json`, access
to the intended hosting and database projects, and an authorised test WordPress
site. Use isolated staging credentials for preview/testing, not production data.
Staging remains an owner-side setup task until actual project access is verified.

## 2. Dashboard environment

Configure values through the hosting platform's environment settings for the
intended environment. Never paste credentials into chat, logs, screenshots or
Git. Do not copy the entire root `.env.example` into production: it also contains
legacy local-API and Edge Function settings.

| Variable | Visibility | Hosted purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Intended Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Same project's anon/publishable key, never a service-role key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret | Privileged connector storage and app-side auth link generation |
| `SITEPILOT_ENCRYPTION_KEY` | Server-only secret | 32-byte encryption key encoded as 64 hex characters or base64; protects stored connector secrets and BYOK keys |
| `SITEPILOT_SITE_URL` | Server-only configuration | Explicit HTTPS origin for auth links; takes precedence over `NEXT_PUBLIC_SITE_URL` |
| `NEXT_PUBLIC_SITE_URL` | Public configuration | Alternative explicit auth origin; not a credential |
| `CRON_SECRET` | Server-only secret | Authenticates daily maintenance; missing value makes cron return 503 |
| `RESEND_API_KEY` | Server-only secret | Optional app-side email transport; requires a valid sender and admin configuration |
| `SITEPILOT_MAIL_FROM` | Server-only configuration | Verified sending address, optionally with display name |
| `SITEPILOT_MAIL_REPLY_TO` | Server-only configuration | Optional valid Reply-To address |
| `SITEPILOT_PLANNER` | Server-only configuration | `auto`, `model` or `deterministic`; default `auto` |
| `SITEPILOT_PLANNER_TIMEOUT_MS` | Server-only configuration | Planner timeout; template default 12000 ms |
| `SITEPILOT_QUOTA_AI`, `SITEPILOT_QUOTA_PLAN`, `SITEPILOT_QUOTA_JOB` | Server-only configuration | Daily per-user ceilings; defaults 200 / 100 / 500 |
| `SITEPILOT_ABUSE_PAIR`, `SITEPILOT_ABUSE_CONNECTOR`, `SITEPILOT_ABUSE_PLAN`, `SITEPILOT_ABUSE_CHAT` | Server-only configuration | Burst ceilings; see [abuse limits](./abuse-limits.md) for defaults and window overrides |

Store an approved backup of encryption material securely. Replacing the encryption
key without a migration makes previously encrypted data unreadable; do not rotate
it by simply generating a new value in a deployment setting.

Both public Supabase variables must be configured together. With neither present,
the dashboard uses local mode; a successful homepage is therefore not proof of
hosted configuration. Do not set platform-wide model API keys as a hosted requirement:
users save encrypted keys at `/settings/keys`, and deterministic planning works
without a model key. Leave demo account credentials unset in production.

Auth origin resolution in `src/lib/auth/site-url.ts` is: explicit server/public
origin → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → allowlisted request
origin → local fallback. Set an explicit staging origin for previews; otherwise
auth links may point to the stable production domain. Configure Supabase Site URL
and allowed redirects for the intended origin; verify the computed destinations
through `/api/auth/status?probe=0`. Follow [email deliverability](./email-deliverability.md)
for the actual confirmation/recovery paths and transport diagnostics.

## 3. Build and Git deployment

Run from the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm release:check
```

The release command executes the eight documented gates, including a production
build. Record the commit and results; green local gates do not establish live readiness.

For the dashboard hosting project, use Next.js with root directory `apps/dashboard`
and access to workspace files outside that directory. The build must compile
workspace dependencies before the dashboard: the root `pnpm build` uses Turborepo
and its dependency graph. If configuring an explicit build override from the app
root, use `cd ../.. && pnpm build`. Keep the Next.js output directory `.next`
relative to `apps/dashboard`. Review existing project overrides before changing
settings; this guide does not claim those remote settings were inspected.

Work on the current Arena branch → open a PR → review CI → merge when authorised.
The Git integration auto-deploys `main`. Do not create a redundant manual production
deployment. Environment changes affect a new deployment, not already-running
functions; arrange them through the authorised deployment workflow and verify the
resulting commit. Never push directly to `main`.

`apps/dashboard/vercel.json` schedules `/api/cron/daily` at `0 3 * * *` (03:00 UTC).
Keep `CRON_SECRET` configured server-side. Do not invoke this mutating cleanup
endpoint as a public health check.

## 4. Database preparation and isolation

Versioned schema and RLS live in `supabase/migrations/`. A dashboard deploy does
not apply database migrations. Before an authorised migration, confirm the target
project identity, backup/restore plan and schema compatibility; never infer the
target from a previously linked CLI session. Production migration and restore
operations require explicit scope/approval, not an opportunistic setup command.

The following reproduces the isolated local database CI workflow and requires Docker:

```bash
pnpm dlx supabase@2.122.0 start
pnpm dlx supabase@2.122.0 migration up --local
pnpm dlx supabase@2.122.0 test db --local
# Only for the disposable stack started above:
pnpm dlx supabase@2.122.0 stop --no-backup
```

`.github/workflows/supabase-local.yml` runs this on matching `main` pushes or
manual dispatch. Local pgTAP success is not proof of live staging/production RLS.
Check cross-tenant isolation on authorised staging separately. Do not deploy the
legacy `credentials-vault` / `agent-proxy` Edge Functions as a substitute for the
current signed connector. Their environment belongs to their separate runtime.

## 5. WordPress installation and first change

1. Use the connector ZIP release or `pnpm connector:zip`. Verify the plugin version
   and release provenance; install through the site owner's WordPress admin.
2. Sign in, select/create the intended project, and follow `/connect` or `/onboarding`.
   Register the correct site environment and use the single-use pairing code in
   the connector settings. Never include the code or returned secrets in evidence.
3. Confirm the site is active and its reported scopes/capabilities match the task.
4. On an authorised test site, run plan → approve → snapshot → write → read-back
   verify → undo. Record actual results, not just job submission.
5. Defaults are draft/private. Explicit publishing is R2 and requires `CONFIRM`;
   R3 requires a fresh snapshot and plan-id confirmation. Production sites are
   allowed with ownership and pairing gates; unknown targets fail closed.

A queued or unverified change is not a verified write. A failed/unavailable undo
must not be described as restoration. Never execute arbitrary code or upload a
plugin through a model-generated tool call.

## 6. Post-deployment verification

| Check | Evidence to record (without credentials) |
|---|---|
| Deployment | Ready status and intended Git commit |
| `GET /api/health` | HTTP status, `mode`, `commit`, component checks |
| `GET /api/auth/status?probe=0` | Correct origin, redirects and transport configuration; not an inbox delivery test |
| Real auth | Non-owner inbox signup, confirmation, login and password reset on authorised staging |
| Connector | Pairing and actual approved draft change/read-back/undo on test WordPress |
| Operations | Cron execution outcome and separately rehearsed backup/restore evidence |

Health semantics from `src/app/api/health/route.ts`:

- Overall status tracks API reachability: `ok` → 200, `degraded` → 502,
  `failed` → 503. Responses are `Cache-Control: no-store`.
- `checks.auth` distinguishes ready, not-configured and misconfigured.
- `checks.storage` and `checks.encryption` describe configuration readiness,
  not a database query, migration, encryption round-trip or RLS integration test.
- Storage/encryption readiness does not control overall HTTP status. Require
  hosted mode and the expected component states as well as HTTP 200.
- `commit` is the first seven characters of `VERCEL_GIT_COMMIT_SHA`, or null
  when unavailable. Compare it with the merged commit; do not reuse example SHAs.

Live load tests, job-loss accounting, inbox delivery and restore rehearsals remain
separate acceptance gates. Do not label them passed because a build or health check
succeeded. See the [release checklist](./release-checklist.md) for sign-off.

## 7. Local development and legacy boundary

For dashboard development, root `.env.local` is loaded by `apps/dashboard/next.config.mjs`.
Keep it ignored. Omit hosted credentials for local-only mode, or use authorised
isolated staging credentials for hosted-flow testing. After dependency builds, run
`pnpm dev:dashboard` (port 3002). Browser-facing requests remain same-origin.

`apps/api` is an optional legacy/debug runtime. `API_SERVER_URL` is an explicit
server-side transport override, not required in hosted production. Application
Passwords, local `WP_SITE_URL`, platform provider keys and Edge vault settings are
not substitutes for connector pairing. There is no configured Next.js standalone
output in this repository; use `pnpm start:dashboard` after a build for Node serving,
not a nonexistent `.next/standalone/server.js`.

# KPH SitePilot — Workspace Agent Guidelines (Product Phase)

> Enforced by `node scripts/governance-audit.mjs`, wired into `pnpm lint`.
> The rules below describe the **shipped** product, not the original prototype.

## 1. What is shipped — do not argue with the code

- Hosted Next.js 15 dashboard on Vercel + Supabase, with a local-only fallback
  when Supabase env vars are absent.
- WordPress Connector plugin `1.0.0` with **34 allowlisted tools** and a signed
  job queue (HMAC + nonce + timestamp, per-site secret, lease/state machine).
- **plan → approve → snapshot → write → read-back verify → one-click undo**.
  R0–R3 risk floors come from the canonical `WP_TOOL_SPECS` catalog; the model
  planner may raise a floor, never lower it.
- BYOK model keys, hosted auth/quotas, daily cron, `/api/health`, GitHub Actions
  CI (including a real PHP 8.2 connector job), and Vercel Git auto-deploy.

## 2. Production sites are allowed — with gating (plan §8.2)

- The earlier production ban is **retired**. Production sites are allowed for a
  signed-in owner once the site is explicitly registered as
  `environment: production` and paired with a single-use code.
- Default write mode is **draft / private**; publishing is an explicit R2 tool.
- R2 plans need the typed word `CONFIRM`; R3 plans need a fresh snapshot plus
  the plan-id confirmation. Editing a plan invalidates its SHA-256 hash.
- Ownership is always resolved owner-side: RLS on every table, the
  `site_metadata` security-barrier view, and an ownership check in every handler.
  Unknown or unauthorised targets fail closed (400/401/403/404).
- Free tier caps sites and quotas. Staging is *recommended* for R2/R3, never a
  silent prerequisite.
- Read-only (R0) tools need no approval; no other tool runs without a plan.

## 3. The connector is the only WordPress transport; no arbitrary code

- **The connector is the only WordPress transport.** The cloud never calls a
  WordPress REST/XML-RPC/admin endpoint directly and never fetches arbitrary
  site URLs (SSRF-prone paths stay blocked).
- **No arbitrary code** of any kind may run on a site: no user-supplied PHP,
  SQL, shell, WP-CLI, file edits, plugin uploads or code injection.
- No runtime tool invention: every tool name must exist in `WP_TOOL_SPECS` /
  `CONNECTOR_TOOL_ALLOWLIST`, pass Zod argument validation, and be permitted by
  the site's scopes and capability graph. Unknown tool names are refused.
- Site content is untrusted input: wrap it, never let it create tools, raise
  privileges or lower a risk floor.
- Deny-by-default still holds — but the allowlist and gating, not a blanket
  read-only phase, are what enforce it now.

## 4. Secrets & credentials (zero tolerance)

- Never commit, print, log or echo credentials, API keys, service-role keys,
  encryption keys, site tokens/secrets, pairing codes or signed URLs.
- Server-only env: `SUPABASE_SERVICE_ROLE_KEY`, `SITEPILOT_ENCRYPTION_KEY`,
  `PAIRING_PEPPER`, `CRON_SECRET`, `RESEND_API_KEY`. Only
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be public.
- BYOK keys are encrypted at rest, decrypted only in the model call path, never
  returned by an endpoint and never re-displayed after save.
- Never disable TLS verification (`--insecure`, `curl -k`,
  `NODE_TLS_REJECT_UNAUTHORIZED=0` are forbidden).
- Error copy is secret-safe: typed codes and one next action, never stack frames
  or key material.

## 5. Data, tenancy & honest success

- RLS everywhere; service role only in connector paths; audit events are
  redacted.
- A write whose read-back verification fails is reported as unverified, never as
  success. If a snapshot is unusable, no write is applied. If undo is
  unavailable, say so — do not claim the site was restored.
- No fabricated capability, no dead button, no invented metric in docs or UI.

## 6. Monorepo, gates & delivery

- pnpm 12 (Corepack), Turborepo, Node 22 LTS, TypeScript strict, PHP 8.2 in CI
  (`wordpress-plugin` job). `pnpm dlx supabase … test db --local` runs on `main`
  pushes touching migrations/database tests (`.github/workflows/supabase-local.yml`).
- Four gates before any PR: `pnpm typecheck`, `pnpm lint`, `pnpm test --force`,
  `pnpm build`, plus `git diff --check`. `pnpm lint` also runs PHP parsing,
  Edge typecheck and the **governance audit**.
- Work on the current Arena branch; PR → checks → merge to `main`. **Vercel
  auto-deploys every merge** — do not create manual production deployments.
- Never push directly to `main` and never commit `.env` files.

## 7. Evidence-based verification

- Never report a test, lint, build or command as passing without execution
  evidence (exact command, exit code, counts, changed files).
- If a check cannot run in this sandbox (PHP binary, Lighthouse, real WP site,
  real inbox), report it as **unverified** and lean on CI — never assume success.
- Record scope decisions honestly, including anything explicitly not shipped.

## 8. Context discipline

- Load only files relevant to the active task; prefer targeted grep / line ranges
  over directory dumps.
- Always-on rules stay concise in `.agents/rules/`; detailed runbooks live in
  `.agents/skills/<name>/SKILL.md`.
- Keep diffs focused; do not refactor unrelated lines.

## 9. Owner-side items — never improvise

- Supabase org/project access (the production project currently returns 403 to
  the connected integration), a verified Resend sending domain, one real
  signup/reset + WordPress E2E, and creation of a staging Supabase project.
- Do not ask for passwords, tokens or 2FA codes in chat; use Arena's connected
  apps settings instead.

## Approved restricted-editor workstream (2026-11-04)

The owner approved development of a **staging-only restricted file editor** for
exactly selected theme/plugin PHP, JS and CSS files, not full filesystem access.
The experimental engine may be developed and tested in isolated fixtures. It is
**not bootstrapped, not a shipped connector tool, and not available to prompts**.
The shipped no arbitrary code policy remains in force until a separately reviewed
R3 plan/approval, capability, UI and recovery integration is implemented.

Release requirements: explicit local operator opt-in, WordPress staging check,
exact file allowlist, admin/edit capabilities, protected paths and secrets blocked,
immutable expiring approval, current-file hashes, encrypted verified backup before
write, private same-filesystem temporary workspace, atomic replacement and read-back.
A PHP parse check is not proof of safe runtime behaviour. SQL, shell, WP-CLI, core
files, uploads, unrestricted filesystem and production file editing remain blocked.
See `docs/restricted-file-editor.md` for scope, residual risks and release gates.

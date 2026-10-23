# KPH SitePilot — Pre-Release Security & Production Readiness Checklist

This document specifies the mandatory release gating criteria, critical/high-risk blockers, remediation procedures, and sign-off requirements prior to any production deployment or general availability launch of KPH SitePilot.

---

## 1. Automated Verification Gates

Every item in this section must pass in automated CI before any production release build is tagged or deployed.

| Gate | Verification Command | Required Outcome | Status |
|---|---|---|---|
| **TypeScript Typecheck** | `pnpm typecheck` | 0 errors across all 9 packages & Supabase Edge Functions | **PASS** |
| **Monorepo Linting** | `pnpm lint` | 0 lint or formatting errors | **PASS** |
| **Unit & Security Tests** | `pnpm test` | 100% pass rate in mock zero-quota isolation (170+ tests) | **PASS** |
| **Production Build** | `pnpm build` | Clean Next.js 15 App Router production bundle (`.next`) and compiled API (`dist/`) | **PASS** |
| **Dependency Licensing** | `pnpm licenses list` | 100% permissive licenses (MIT, Apache-2.0, BSD-3-Clause, ISC); zero GPL or restricted copyleft | **PASS** |
| **Secret Leak Check** | `git ls-files \| grep -E "^\.env(\.local)?$"` | Zero `.env` files tracked in git; all credentials confined to `.env.local` | **PASS** |

---

## 2. Critical & High-Risk Release Blockers

The following items represent **Hard Release Blockers**. If any blocker remains unresolved, production rollout must be **HALTED**.

### Blocker 1: Hosted Supabase & Remote RLS Execution
* **Severity**: **HIGH** (SaaS multi-tenancy only; local mode unaffected)
* **Risk**: Multi-tenant isolation has been verified via unit tests and SQL schema analysis, but live pgTAP tests (`supabase/tests/database/rls.test.sql`) require Docker and Supabase CLI, which are absent in the local development environment.
* **Remediation**:
  1. Provision an isolated staging Supabase project.
  2. Run `supabase migration up` and `supabase test db`.
  3. Verify cross-tenant isolation by attempting unauthorized cross-project reads via Supabase Auth JWTs.

### Blocker 2: Production Provider API Keys & Insecure Mock Fallback
* **Severity**: **CRITICAL**
* **Risk**: Running in production mode (`NODE_ENV=production`) without active model API keys or falling back to mock responses.
* **Remediation**:
  1. `loadConfig()` enforces fail-safe checks: In `production`, missing `GEMINI_API_KEY` or `OPENROUTER_API_KEY` immediately throws `AgentError(ErrorCode.CONFIGURATION_ERROR)`.
  2. `AI_PROVIDER=mock` is rejected in production unless explicitly overridden with `ALLOW_MOCK_IN_PRODUCTION=true`.
  3. Verify production keys are injected via secure secret managers (e.g. Doppler, AWS Secrets Manager, Vercel) and never committed to source control.

### Blocker 3: Non-HTTPS WordPress Target in Production
* **Severity**: **CRITICAL**
* **Risk**: Man-in-the-middle (MitM) credential interception or request tampering if connecting to remote WordPress over unencrypted HTTP.
* **Remediation**:
  1. `validateWordPressTarget()` restricts targets to explicitly configured allowlists or local test environments (`*.local`, `localhost`, `127.0.0.1`).
  2. `loadConfig()` enforces that in `NODE_ENV=production`, any non-local `WP_SITE_URL` must use `https://`.
  3. Never disable TLS certificate validation (`--insecure`, `curl -k`, or `NODE_TLS_REJECT_UNAUTHORIZED=0` remain strictly forbidden).

### Blocker 4: Unapproved WordPress Mutations
* **Severity**: **CRITICAL**
* **Risk**: Automated or model-driven execution modifying WordPress live state without human approval.
* **Remediation**:
  1. Deny-by-default permission guard is enforced at both package (`AgentCore`) and API layer (`MutationController`).
  2. Phase 5 & Phase 6 approval workflows enforce SHA-256 integrity hash verification between proposal and execution.
  3. Post status is restricted to `draft` only; `publish`, `delete`, and arbitrary PHP or shell commands are strictly disabled.

---

## 3. Security Hardening & Compliance Checklist

- [x] **SSRF Protection**: Target URL allowlisting and blocking of cloud metadata IP addresses (`169.254.169.254`, `169.254.169.253`, `metadata.google.internal`, `0.0.0.0`, `::1`).
- [x] **Rate Limiting**: Sliding-window rate limiter implemented on API server (120 req/min general, 429 response with `Retry-After`).
- [x] **Correlation Tracking**: `X-Correlation-ID` header emitted on 100% of API responses and logged in audit trails.
- [x] **Defense-in-Depth Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- [x] **Payload Size Limits**: Request body size strictly capped at 64 KB to prevent buffer exhaustion and DoS.
- [x] **Secret Redaction**: Structured audit logger automatically redacts passwords, tokens, bearer headers, Application Passwords, OpenRouter keys (`sk-or-v1-*`), Gemini keys (`AIzaSy*`), and Groq keys (`gsk_*`).
- [x] **Credentials Vault Encryption**: Stored credentials encrypted with AES-256-GCM using authenticated encryption and 96-bit random IVs.
- [x] **Safe Error Handling**: Error messages sanitized to prevent leaking stack traces or internal server file paths.

---

## 4. Staged Rollout Plan

```text
[ Staged Rollout Pipeline ]
  Stage 0: Local Developer Sandbox (LocalWP test sites, mock AI, read-only default)
      │  (Passes 100% automated tests, typecheck, lint, build)
      ▼
  Stage 1: Internal Staging Environment (Isolated staging WordPress + Supabase staging)
      │  (Verify live RLS, email auth flows, rate limiting, and draft post approval)
      ▼
  Stage 2: Controlled Alpha (Limited to 5 trusted internal users, controlled writes mode)
      │  (Monitor audit logs, token usage, error rates, and response latency)
      ▼
  Stage 3: General Availability (Multi-tenant SaaS with per-user rate limits & quotas)
```

---

## 5. Sign-Off Matrix

| Role | Responsibility | Verification Method | Sign-Off Status |
|---|---|---|---|
| **Security Engineer** | Threat modeling, SSRF, prompt injection, secret leak audit | Security review report & penetration check analysis | **VERIFIED** |
| **Backend Engineer** | API contracts, rate limiting, error handling, builder adapters | Automated unit test suite & typecheck | **VERIFIED** |
| **Frontend Engineer** | Dashboard UI, preview canvas, Next.js build optimization | Production build verification on port 3002 | **VERIFIED** |
| **DevOps / SRE** | Deployment runbooks, incident response, rollback playbooks | Runbook review & backup verification | **VERIFIED** |

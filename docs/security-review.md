# KPH SitePilot — hosted security review and evidence map

> **Scope correction (2026-11-04):** This replaces the earlier local-API audit.
> It records code controls and unresolved review items, not a penetration test,
> compliance certification or live security sign-off. See the
> [release checklist](./release-checklist.md) and [documentation map](./README.md).

## 1. Trust boundaries and source evidence

The browser uses hosted Next.js routes, verified sessions and owner-scoped data.
WordPress uses the signed connector job queue; legacy local API/Edge proxy code
must not be treated as the hosted transport. Site content and model output are
untrusted. Provider credentials are optional encrypted BYOK, not a required
platform-wide key.

Paths below are relative to the repository. Tests are review entry points; their
presence alone does not mean they passed on a particular commit.

| Boundary / risk | Implemented controls | Evidence entry points |
|---|---|---|
| Model output and excessive agency | Canonical tool names, argument validation, scopes/capability checks, risk floors; model output cannot invent tools or lower risk | `packages/wp-tools/src/`, `apps/dashboard/src/lib/connector/model-planner.ts`, `apps/dashboard/tests/model-planner.test.ts` |
| Approval integrity | Approved plan hash, R2 typed CONFIRM, R3 plan-id confirmation and snapshot requirements | `apps/dashboard/src/lib/connector/plans.ts`, `apps/dashboard/tests/connector-plans.test.ts` |
| Connector authenticity/replay | HMAC-SHA256 over timestamp, nonce and raw-body hash; constant-time signature check, timestamp window and stored nonce | `packages/connector-protocol/src/index.ts`, `apps/dashboard/src/lib/connector/auth.ts`, `apps/dashboard/tests/connector-auth.test.ts` |
| Tenant isolation | Verified sessions, explicit owner checks, secret-free site metadata projection and database RLS | `apps/dashboard/tests/connector-store-ownership.test.ts`, `apps/dashboard/tests/auth-project-guard.test.ts`, `supabase/migrations/`, `supabase/tests/database/` |
| Secrets at rest | AES-256-GCM for site secrets and BYOK keys; token hashes; stored keys not re-displayed | `apps/dashboard/src/lib/connector/crypto.ts`, `apps/dashboard/src/lib/connector/keys.ts`, `apps/dashboard/tests/connector-keys.test.ts` |
| Secret exposure | Redaction utilities, server/client boundary checks and credential-literal audit | `packages/audit/src/`, `scripts/secret-audit.mjs`, `apps/dashboard/tests/secret-boundary.test.ts` |
| Resource abuse | Daily quotas and per-IP/site/user burst counters; provider calls bounded separately | `packages/api-core/src/abuse.ts`, `apps/dashboard/tests/abuse-guard.test.ts`, `docs/abuse-limits.md` |
| Recovery correctness | Snapshot resolver, signed restore jobs, typed unusable/unavailable errors | `apps/dashboard/src/lib/connector/undo.ts`, `apps/dashboard/tests/connector-undo.test.ts`, `docs/backup-restore-strategy.md` |

The catalog and gating prohibit arbitrary PHP, SQL, shell, file edits and runtime
tool invention. Code injection is prohibited, not a future roadmap feature.
R0 reads need no approval; ordinary writes are planned/approved, while explicit
owner-triggered undo uses its dedicated owned-snapshot route. Publishing is a
shipped explicit R2 tool, not silent automatic publishing.

## 2. Transport and cryptographic scope

The connector is the only WordPress transport for the hosted product. Do not
extrapolate the legacy local target allowlist to hosted registration or introduce
arbitrary WordPress fetches to bypass the queue. Never disable TLS verification.
Review any new outbound fetch path independently for URL validation, redirects,
DNS behaviour and data disclosure; this document does not certify all network paths.

The protocol constants define a 300-second timestamp window and a 262144-byte
body limit. These are signed connector protocol limits, not global HTTP body caps.
The canonical signature input is `<timestamp>.<nonce>.<sha256hex(rawBody)>`;
verify raw bytes before parsing. Method/path are not included in that canonical
string, so route-specific validation and replay prevention remain important.

`SITEPILOT_ENCRYPTION_KEY` protects stored connector and model secrets. Replacing
it alone does not migrate ciphertext. Keep matching recovery material protected;
no rehearsed key migration is certified here. Pairing and rotation return new
credentials once through their authorised flow; never log or publish them.

## 3. Open findings and review priorities

These are observed code limitations or unverified boundaries, not fixed by this
review. Severity/exploitability requires focused validation; do not imply an
exploit was reproduced merely from source inspection.

1. **Preview rendering:** `apps/dashboard/src/components/PreviewCanvas.tsx` has
   `dangerouslySetInnerHTML` sinks and an iframe allowing scripts and same-origin.
   The earlier claim that raw HTML rendering is prohibited everywhere was false.
   Trace each data source, sanitisation and iframe origin; add adversarial XSS tests
   and review isolation before asserting browser containment.
2. **Connector rate-limit ordering (fixed in code, 2026-11-04):** the per-site
   budget now runs after signature/site matching and successful nonce recording.
   Invalid signatures, stale requests and replays cannot spend that site's budget.
   A valid rate-limited request consumes its nonce; retries must be freshly signed.
   This is not an unauthenticated IP/edge DoS defence: lookup, crypto and nonce
   storage still need independent capacity protection.
3. **Abuse metadata and scaling:** counters are in-process/per-instance and fail
   open on counter errors. Signed routes still return fixed `Retry-After: 30` in
   `route-helpers.ts`; do not claim all endpoints report the actual reset time.
4. **Error disclosure (partially hardened, 2026-11-04):** site GET/PATCH/DELETE
   and snapshot undo now convert backend exceptions to fixed client-safe messages.
   Signed heartbeat, claim, result and unpair routes also mask thrown handler,
   request-read and dependency-setup failures, preserving explicit config errors.
   Snapshot lookup and ownership failures are included in the undo error boundary;
   no restore is queued when those checks throw. Undo failure copy tells the owner
   to inspect Activity first because enqueue may already have succeeded.
   Other connector handlers still require review for raw caught error messages;
   this scoped fix does not certify all runtime errors as scrubbed.
5. **Recovery bookkeeping:** undo marks snapshot restoration metadata at enqueue,
   not verified completion; revoke/cancel is not atomic; cloud snapshot recording
   may fail after a write. Consult the incident/backup runbooks and do not infer
   restoration or cancellation from a request being accepted.
6. **Dependency audit:** CI currently logs production dependency audit warnings
   without failing the job. Green CI is not proof of zero vulnerabilities or
   approved licenses. Review findings and exceptions for the specific release.
7. **Live evidence:** isolated schema tests do not prove deployed tenant isolation,
   email delivery, WordPress E2E, restore readiness or production header policy.
   Owner-authorised staging evidence is still required.

## 4. Verification and change discipline

Run `pnpm release:check` and record exact commit, commands, exit codes and counts.
Inspect PR PHP tests and the separate local database workflow. The latter runs
on matching main pushes or manual dispatch; it is not a live database audit.
Never label every response as having one universal CSP, correlation id, body cap
or rate limit without route-level evidence.

For follow-up fixes, add targeted negative tests: invalid signatures must not
consume a victim's authenticated budget; unsafe preview content must not execute;
backend errors must not expose secrets; failed undo must not be reported as restored.
Do not bypass ownership, approvals or TLS to make a test pass.

Full security sign-off requires review of the open findings, dependency output,
authorised cross-tenant and browser tests, plus live recovery evidence. The older
OWASP-labelled matrix was not a reliable current mapping and has been removed;
no blanket framework compliance is claimed.

## 5. Operational response

Use [incident response](./incident-response-and-rollback.md) for containment and
credential-specific recovery, [backup/restore](./backup-restore-strategy.md) for
resource versus platform recovery, and [deployment](./deployment-guide.md) for
configuration and health semantics. No production probing, secret rotation,
database operation or security remediation is performed by this docs update.

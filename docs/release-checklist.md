# KPH SitePilot — release checklist

Updated 2026-11-04. This is an operational checklist, **not a standing sign-off**.
Past green tests do not certify a new commit or a live environment. Record the
commit, command, exit code and evidence for each release in the
[release notes template](./release-notes-template.md).

## 1. Automated repository gates

```bash
pnpm install --frozen-lockfile
pnpm release:plan     # lists the 8 ordered gates
pnpm release:check    # runs all 8, collects failures, exits nonzero if any fail
```

The source of truth is `scripts/release-check.mjs`:

| Gate | Command | Required result |
|---|---|---|
| Strict types, including Edge functions | `pnpm typecheck` | Exit 0 |
| Workspace lint, PHP parsing, governance and secret audits, Edge types | `pnpm lint` | Exit 0; no audit findings |
| Unit/security tests | `pnpm test --force` | Exit 0; record actual counts |
| Production bundle | `pnpm build` | Exit 0 |
| Deterministic abuse policy simulation | `pnpm abuse:load` | Expected allow/deny counts, typed denials and reset recovery |
| Governance audit | `node scripts/governance-audit.mjs` | Exit 0 |
| Credential-literal audit | `node scripts/secret-audit.mjs` | Exit 0 |
| Diff hygiene | `git diff --check` | Exit 0 |

A missing gate result fails closed. `pnpm release:check --json` appends a JSON
verdict after command logs; the whole stdout stream is not a JSON document.
The simulation is not a deployed performance or job-delivery test.

CI additionally runs real PHP connector tests and a production dependency audit;
the dependency audit currently logs warnings without failing CI, so review its output explicitly. Inspect the actual PR checks rather than assuming a local parser proves PHP runtime
behaviour. The migration workflow runs a local Supabase database test on matching
`main` pushes. It does not certify a staging or production database.
Dependency/license review and live checks below are separate from the eight gates.
Do not mark them passed merely because `release:check` is green.

## 2. Hosted product safety requirements

- WordPress transport is the signed connector queue only. Never call arbitrary
  WordPress REST/XML-RPC/admin URLs from the cloud.
- Every tool must exist in `WP_TOOL_SPECS`, validate its arguments, and satisfy
  the site's scopes/capability graph. No arbitrary PHP, SQL, shell, plugin uploads,
  file edits or runtime tool invention.
- R0 reads need no approval. R1–R3 writes require an approved immutable plan;
  changing the plan invalidates its SHA-256 hash. Default content is draft/private.
  Publishing is supported by explicit R2 `content.publish`, with typed `CONFIRM`.
  R3 requires a fresh snapshot and plan-id confirmation. Model suggestions cannot
  lower the catalog risk floor.
- Writes follow snapshot → write → read-back verify. An unverified write is not
  success. Undo uses the signed queue and must not claim restoration without proof.
- Production sites are allowed with explicit production registration, single-use
  pairing and owner-side checks. Staging is recommended for high-risk changes,
  not an undocumented ban on production use.
- RLS, the secret-free `site_metadata` view and handler ownership checks isolate
  tenants. Unknown or unauthorised targets fail closed.
- Hosted model keys are optional encrypted BYOK keys. The deterministic planner
  works without them. Do not require platform-wide model keys on Vercel.
- Keep server credentials server-only, enforce TLS verification, redact errors
  and audit data, and never include secrets in release evidence.

The legacy local API (`apps/api`) has its own provider configuration and target
policy. Its mock/provider startup requirements are **not hosted SaaS requirements**.
See [AGENTS.md](../AGENTS.md) for the enforced product policy and
[abuse limits](./abuse-limits.md) for route-specific limits and known limitations.
Do not extrapolate a local API header, payload cap or rate limit to every hosted route.

## 3. Live readiness and outstanding owner-side evidence

These remain **unverified by repository gates**. Historical access/sender findings
are in the [2026-11-03 audit](./status-2026-11-03.md); recheck them before launch.

- [ ] Owner access to the intended Supabase project confirmed through the connected app.
- [ ] Isolated staging Supabase project created; migrations and cross-tenant RLS checks verified.
- [ ] Verified email sending domain (SPF/DKIM) and intended sender configured;
  real signup → email confirmation → login and password reset tested with a non-owner inbox.
- [ ] Real WordPress connect → plan → approve → snapshot → write → read-back → undo recorded.
- [ ] Mobile/device and accessibility acceptance recorded (do not infer Lighthouse scores).
- [ ] Authorised staging load run records p95 and job accounting (E11-04); the
  deterministic abuse simulation does not establish p95 < 800 ms or no job loss.
- [ ] Platform backup restore rehearsed in isolation; a written runbook alone is not evidence.
- [ ] Dependency/security findings reviewed for this release; exceptions documented.

Never run destructive QA or load tests against production as a substitute for
missing staging access. Never ask for credentials in chat.

## 4. Delivery and rollback

1. Work on the current Arena session branch; never switch to or push directly to `main`.
2. Run the gates and record evidence. Open a PR from that branch and inspect CI.
3. Merge only through the approved PR workflow. Vercel Git integration auto-deploys
   `main`; do not create a redundant manual production deployment.
4. Verify the resulting deployment's health/version and intended user flow.
   A successful local build does not prove a production deployment is healthy.
5. For rollback, follow [incident response](./incident-response-and-rollback.md)
   and [backup/restore](./backup-restore-strategy.md); distinguish reverting app
   code from restoring WordPress content or database state.

## 5. Release-specific sign-off

| Area | Evidence required | Status for a new release |
|---|---|---|
| Engineering | Commit + all eight gate results + PR CI | Pending |
| Security/tenancy | Findings review + isolated RLS evidence | Pending |
| Product QA | Real auth/email and WordPress workflow recording | Pending |
| Operations | Deployment health + rollback/restore evidence | Pending |

Replace Pending only with attributable evidence for the particular release.
Repository tests do not provide human sign-off or general-availability approval.

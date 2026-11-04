# Documentation map

Updated 2026-11-04. Start with the product-phase rules and current code, not an
old acceptance report. Dates and test counts in reports are historical evidence,
not promises about the current deployment.

## Current entry points

| Need | Source |
|---|---|
| Product safety and architecture boundaries | [Workspace policy](../AGENTS.md) |
| Hosted deployment, environment and post-deploy checks | [Deployment guide](./deployment-guide.md) |
| Setup and repository commands | [Repository README](../README.md), [environment template](../.env.example) |
| Release gates, live blockers and sign-off | [Release checklist](./release-checklist.md) |
| Incident containment and credential recovery | [Incident runbook](./incident-response-and-rollback.md) |
| Resource undo and pending platform restore rehearsal | [Backup and restore](./backup-restore-strategy.md) |
| Connector route inventory and semantics | [API reference](./connector-api-reference.md) |
| Restricted staging source editor (experimental, not callable from chat) | [Engine scope and release gates](./restricted-file-editor.md) |
| Security controls and open findings | [Security review](./security-review.md) |
| Burst protection and limitations | [Abuse limits](./abuse-limits.md) |
| Auth/email troubleshooting | [Email deliverability](./email-deliverability.md) |
| User guides, tools, safety, troubleshooting, FAQ | Public dashboard `/docs` (source: `apps/dashboard/src/app/docs/`) |
| Planned work and execution evidence | [Backlog](./sitepilot-backlog.md), [progress log](./plan-progress.md) |
| Last recorded hosted audit | [2026-11-03 snapshot](./status-2026-11-03.md); not a fresh live check |

## Architecture and API source map

The hosted runtime is Next.js on Vercel, backed by Supabase. Browser calls use
same-origin dashboard routes; core logic can execute in-process. The WordPress
plugin polls the signed job queue. Cloud code does not fetch arbitrary site URLs.
Optional BYOK adapters and a deterministic planner feed the same gated tool path.

| Contract | Authoritative implementation |
|---|---|
| Tool names, schemas, risk floors, scopes and undo metadata | `packages/wp-tools/src/` |
| HMAC canonicalisation, headers, timestamps and nonce validation | `packages/connector-protocol/src/` and shared protocol fixtures |
| Pairing and signed route adapters | `apps/dashboard/src/app/api/connector/` |
| Connector auth, handlers, plan/undo logic and storage | `apps/dashboard/src/lib/connector/` |
| Plugin transport and tool implementations | `wordpress/kph-sitepilot-connector/` |
| Tenant isolation and database changes | `supabase/migrations/`, `supabase/tests/database/` |
| Hosted ownership helpers | `apps/dashboard/src/lib/` and dashboard auth/ownership tests |
| CI and local database verification | `.github/workflows/` |

Use the shipped tool catalog, not an aspirational master-plan tool list, when
claiming support. A successful handler test is not a real WordPress E2E recording.

## Historical or mixed-scope material

- [Master plan](./sitepilot-master-plan.md) and [architecture decisions](./architecture-decisions.md)
  retain design history and proposed scope; they do not prove every capability shipped.
- The security review is a code evidence map with open findings, not a live
  penetration test or compliance certification.
- Phase acceptance files, QA reports, screenshots and dated status reports are
  point-in-time evidence. Do not relabel their old counts as current results.
- A backup plan is not a rehearsed platform restore; resource-level undo is not
  a database backup. Those acceptance tasks remain open in the backlog.

E11-08 is still in progress: this entry-point cleanup does not certify a complete
line-by-line audit of every legacy runbook, API description and FAQ.

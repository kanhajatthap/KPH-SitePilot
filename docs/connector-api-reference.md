# Connector API reference — implemented route inventory

Reviewed 2026-11-04. Route inventory below is derived from exported handlers, not
an OpenAPI contract. Argument schemas and typed domain failures remain in source.
No credentials or usable signatures are included in examples.

## Authentication boundaries

- `/pair` is public but consumes a single-use pairing code and applies an IP burst
  guard. `/config` is a configuration diagnostic, not site data access.
- `/heartbeat`, `/jobs/claim`, `/jobs/[id]/result`, `/unpair` use site-signed raw
  request bodies. Headers: `x-sitepilot-site`, `x-sitepilot-timestamp`,
  `x-sitepilot-nonce`, `x-sitepilot-signature`. Canonical HMAC input is
  `<timestamp>.<nonce>.<sha256hex(rawBody)>`; timestamp window is 300 seconds.
- Other management routes use the signed-in owner/session path. Site/project
  ownership checks are required; unknown/foreign targets do not grant access.
- A valid signed 429 consumes the nonce. Retry with a new timestamp/nonce/signature.
  Signed-route Retry-After is still a fixed 30 seconds; see [abuse limits](./abuse-limits.md).

## Routes

| Path (brackets denote route parameters) | Methods |
|---|---|
| `/api/connector/activity` | GET |
| `/api/connector/config` | GET |
| `/api/connector/heartbeat` | POST |
| `/api/connector/jobs/[id]/result` | POST |
| `/api/connector/jobs/claim` | POST |
| `/api/connector/jobs` | GET, POST |
| `/api/connector/keys` | GET, POST, DELETE |
| `/api/connector/pair` | POST |
| `/api/connector/pairing-codes` | POST |
| `/api/connector/plans/[id]/approve` | POST |
| `/api/connector/plans/[id]/execute` | POST |
| `/api/connector/plans/[id]` | GET |
| `/api/connector/plans` | POST, GET |
| `/api/connector/projects` | GET, POST |
| `/api/connector/sites/[id]/rotate-secret` | POST |
| `/api/connector/sites/[id]` | GET, PATCH, DELETE |
| `/api/connector/sites` | GET |
| `/api/connector/snapshots/[id]/undo` | POST |
| `/api/connector/unpair` | POST |

## Plan / job / undo contract

1. Create a plan with siteId and a supported prompt/settings/structured-step input.
   Validation and canonical risk floors are enforced server-side.
2. Approve using the plan id and required confirmation (R2 CONFIRM; R3 plan-id
   prefix plus snapshot requirements). Malformed approval JSON is rejected.
3. Execute returns a queued job, not proof of a write. Direct job enqueue is R0
   only; writes cannot bypass the plan by calling `/jobs`.
4. Result path id must match signed body jobId. Boolean ok indicates connector
   outcome; restore tools additionally require result.verified === true.
5. Owned snapshot undo returns 202/queued and a job id. The unique `undo:<snapshotId>`
   idempotency key prevents duplicate restore jobs. A duplicate/failed job needs
   inspection; this change does not introduce automatic retry or clear old jobs.
6. Migration `20261104120000_recovery_integrity.sql` marks restored_at only when
   an allowlisted restore job succeeds with boolean verification, matching the
   snapshot's project/site and idempotency key. Old timestamps are not auto-repaired.

## Errors and side effects

Validation (400), session/ownership errors, conflicts (409), unusable undo (422),
rate limits (429), configuration/storage (503) and signed adapter failure (500)
are distinct. Error bodies use an error code and safe message; do not assume one
universal envelope for every domain result. A timeout/503 after mutation can be an
unknown outcome: inspect Activity before resubmitting.

Revocation RPC plus site status trigger atomically cancel queued jobs when status
becomes revoked, including PATCH. They do not stop already-running WordPress work
or guarantee that a concurrent in-flight claim was cancelled. Resume/rotation
requires queue reconciliation; rotation reactivates the site.

## Deployment gate

Deploy/rehearse the recovery migration before the matching dashboard code. No
migration has been applied remotely by this batch. The full local Supabase suite,
real WordPress flow, deployed p95/job accounting and restore rehearsal are separate
acceptance gates. See [release checklist](./release-checklist.md).

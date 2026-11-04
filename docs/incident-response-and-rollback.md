# KPH SitePilot — hosted incident response

> **Scope correction (2026-11-04):** This replaces legacy Application Password,
> direct SQL and standalone-server recovery recipes with the shipped connector
> workflow. See the [release checklist](./release-checklist.md). This runbook is
> not evidence of a completed incident drill or a production change authorisation.

## 1. Triage and evidence

Treat suspected credential compromise, unauthorised writes and tenant isolation
failures as critical. Widespread outages or persistent job failures are major;
isolated display issues are minor. Escalate to the project owner/operator; do not
publish an unmeasured response-time SLA.

Record UTC times, deployment commit, affected project/site and job identifiers,
observed status codes, last known good state and actions taken. Use `/activity`
and owner-scoped job history. Keep evidence access-controlled and redact site
content where necessary. Never include keys, pairing codes, signed requests,
auth links, cookies or decrypted snapshot data in public issues or chat.

## 2. Contain an affected connector

1. Verify the signed-in owner and intended site at `/connect`. Use **Pause** to
   block subsequent signed connector requests while investigating. Authentication
   rejects paused and revoked sites with `SITE_PAUSED` / `SITE_REVOKED`.
2. For compromise, use **Disconnect** and confirm the site name. With the recovery migration installed, this soft-revokes
   the site and cancels queued jobs in one database transaction while retaining
   history. Earlier code was not atomic with revocation; old outcomes still need
   reconciliation. A database failure must not be reported as a completed revoke.
3. Pause/revoke is not an emergency stop for already-claimed or running work.
   Inspect WordPress state directly through the authorised owner's admin interface
   and reconcile in-flight jobs. A blocked result submission is not proof that a
   WordPress write never happened. If the dashboard is unavailable, have the owner
   disable the plugin through WordPress admin; this also does not undo completed work.
4. Do not resume until the cause and queued/in-flight work have been reviewed.
   Do not clear audit history to make a connection look healthy.

Application Password revocation does not revoke a SitePilot connector secret.
Do not use legacy `wordpress_connections` SQL against the hosted `sites` workflow.

## 3. Rotate the right credential

### Site connector credentials

The owner-facing **Rotate credentials** action at `/connect` calls
`POST /api/connector/sites/{id}/rotate-secret`. It replaces the token hash and
encrypted secret and returns new credentials once. Old credentials stop working.

**Rotation sets the site status to active**, including a paused or revoked site.
Do not rotate during containment unless reactivation is intended. Review queued
work first. Transfer the one-time values directly to WordPress **SitePilot → Apply
rotated credentials**, not to chat or logs, then verify fresh signed traffic. If
values are lost, use the supported rotation/pairing flow again; they cannot be
recovered from the token hash. Re-pair only after verifying ownership and site identity.

### User model keys

For a leaked Gemini/OpenRouter/Groq BYOK key, revoke it at the provider, then
replace or remove the saved key via `/settings/keys`. Removing the saved copy does
not revoke the provider's key. Inspect provider usage and affected user activity.
Do not install a platform-wide model key as a workaround. Deterministic planning
remains available without BYOK; provider quota exhaustion is not itself compromise.

### Platform secrets

Handle service-role, email and cron credentials in the authorised platform secret
manager and deploy through the approved workflow. Verify affected integrations
without exposing values. A service-role compromise needs broader data-access and
session review; rotating one site secret is not sufficient containment.

`SITEPILOT_ENCRYPTION_KEY` is different: changing it alone makes existing encrypted
connector secrets and BYOK keys unreadable. No production re-encryption utility or
rehearsed key-rotation procedure is certified by this runbook. Require a reviewed,
backed-up and isolated rehearsal before migration. Do not use legacy `VAULT_MASTER_KEY`
instructions as a substitute.

## 4. Recover an unintended WordPress change

Use the [backup and restore runbook](./backup-restore-strategy.md). Identify the
specific snapshot and compare current content, including legitimate edits made
since the incident. Do not blindly undo an entire site or replay failed jobs.

An undo response of **202 queued is not restored**. The recovery migration marks snapshot metadata only after a succeeded restore
job with boolean verified=true. Earlier deployments marked it at enqueue time;
old restored_at values are not automatically repaired. Follow the
returned job and verify the resulting WordPress state; `restored_at` alone is not
proof. If `ALREADY_RESTORED` appears after a failed job, inspect that job rather
than resetting metadata or resubmitting repeatedly.

A paused/revoked connector cannot execute the recovery queue. Resume only after
containment review, or use an authorised manual WordPress recovery with its own
backup and verification. Missing snapshots and unsupported undo require explicit
manual recovery; never claim restoration based on a button click.

## 5. Recover a bad application release

Identify the bad and last known good commits. Prepare a reviewed revert PR on the
current working branch; run release gates, obtain merge authorisation and let the
Git integration deploy `main`. Do not push directly to `main` or create a redundant
manual production deployment. Emergency hosting rollback requires separately
approved operator scope and follow-up reconciliation with Git.

An app rollback does not revert database migrations, WordPress writes, external
emails or leaked credentials. Check schema compatibility before redeploying old
code. Verify `/api/health` commit/mode/component checks and an authorised end-to-end
flow. HTTP 200 alone does not establish database or connector correctness.

## 6. Exit criteria and follow-up

- Cause, scope and possible data exposure assessed; required owner notifications sent.
- Compromised credentials revoked; intended connections and jobs reconciled.
- Recovery verified against the actual resource, with unresolved losses stated.
- Release/health evidence recorded; monitoring and recurrence tests assigned.
- Incident timeline and residual risks reviewed by the owner/operator.

Implementation references: `src/lib/connector/auth.ts`, `store.ts`, the site
route/rotate-secret route and snapshot undo route under
`apps/dashboard/src/app/api/connector/`. These are behaviour references, not
permission to bypass owner checks with ad hoc administrative SQL.

# KPH SitePilot — backup and restore runbook

> **Scope correction (2026-11-04):** Hosted connector snapshots support bounded
> resource undo, not full disaster recovery. E11-06 remains open until an isolated
> platform restore is rehearsed. No scheduled database backup, PITR entitlement,
> retention window or recovery-time guarantee is established by this document.
> See the [release checklist](./release-checklist.md).

## 1. Distinguish the recovery layers

| Layer | What it can recover | What it does not recover |
|---|---|---|
| Connector snapshot undo | Supported captured resource fields through an allowlisted restore job | Entire WordPress database, files, all later edits or platform state |
| WordPress owner backup | Database/files included in the owner's verified backup | Hosted Supabase state or external provider accounts |
| Platform database backup | Included schema/data at the backup point, subject to actual backup scope | Encryption keys, deployment configuration, WordPress files or necessarily Storage objects/auth settings |
| Application revert | Versioned application code through reviewed Git delivery | Database/data mutations, leaked secrets or sent emails |

The signed connector is the only agent transport to WordPress. Manual full-site
recovery is an owner/operator task outside the tool catalog; never ask the model
to execute SQL, shell, WP-CLI or arbitrary file operations on the site.
Production sites are supported with registration, pairing, ownership and approval
gates. There is no local-only write restriction in the hosted product.

## 2. Snapshot-based undo: implemented scope

The resolver `apps/dashboard/src/lib/connector/undo.ts` chooses these tools only
when the snapshot carries usable fields. Catalog presence is not proof that a
particular snapshot exists or that a restore completed.

| Snapshot resource | Restore tool | Boundary |
|---|---|---|
| Content with a valid before-state id | `content.restore` | Captured content fields, not a site backup |
| `settings` / `settings:*` | `settings.restore` | Writable allowlisted options; excludes canonical origin settings |
| `terms:*` | `terms.restore` | Post taxonomy assignments captured in the snapshot |
| `seo:*` | `seo.meta.restore` | Allowlisted captured SEO metadata |
| `media:*` | `media.restore` | Attachment text fields, not original media binary recovery |
| `featured:*` | `media.restore_featured` | Captured featured-image association |
| `menus:*` | `menus.restore` | Captured menu items and location data |

`irreversible:*` returns `ROLLBACK_UNAVAILABLE`. Missing/malformed restorable
fields return `SNAPSHOT_UNUSABLE`. Never invent support for arbitrary deletion,
plugin code rollback, schema changes or permanent file recovery.

### Recovery procedure

1. Confirm owner, target site, affected job and snapshot. Preserve evidence and
   contain further work using the [incident runbook](./incident-response-and-rollback.md).
2. Compare the captured fields with current WordPress state. Review subsequent
   legitimate edits; restoring old fields may overwrite them. Do not assume a
   universal concurrent-edit guard for every restore tool.
3. Check whether the connector can safely resume and whether the snapshot remains
   available. Snapshot recording can fail after a write has happened; successful
   write reporting does not guarantee a durable cloud undo snapshot.
4. Request the supported undo through the dashboard. The owned snapshot endpoint
   `POST /api/connector/snapshots/{id}/undo` returns 202 with `status: queued` and
   a job id. **202 queued is not restored**.
5. Follow that job to its actual outcome and verify the resource in WordPress.
   The current route marks `restored_at` at enqueue time, not after read-back
   verification. Do not use that timestamp or `ALREADY_RESTORED` as restoration proof.
6. If the job fails, snapshot is unusable or read-back is unverified, report that
   state explicitly. Investigate before retrying; do not clear restored metadata,
   force duplicate jobs or claim the site was restored.

Snapshots are not permanent archives: daily maintenance invokes
`purge_expired_connector_state()`. Inspect deployed retention policy and backup
coverage before relying on old snapshots. `/api/cron/daily` is housekeeping,
**not a database backup job**.

## 3. WordPress owner recovery when undo is unavailable

Use a verified WordPress hosting backup or an applicable native revision through
the authorised owner's administration tools. Revisions are not guaranteed to
exist for every resource or mutation, and do not replace a file/database backup.

Confirm the backup timestamp, included database/files, target site and scope of
lost intervening edits. Capture the current state before destructive recovery.
Prefer an isolated clone rehearsal before authorising a production restore.
Validate affected content, media and functionality after recovery. Document any
missing objects rather than asserting a complete restoration.

## 4. Platform backup plan — acceptance still pending

Before relying on a backup service, the owner/operator must establish:

- Actual project access, enabled backup/PITR features, retention and recovery
  granularity for the project's current plan. Never assume a seven-day PITR window.
- A successful backup inventory: schema, data, RLS/grants/functions, auth data,
  Storage objects and configuration as applicable. Identify what each artifact omits.
- Encrypted, access-controlled backup storage outside the source repository;
  checksums, timestamps, retention, restore instructions and ownership.
- Separately protected recovery access and matching `SITEPILOT_ENCRYPTION_KEY`
  material. Database ciphertext alone cannot restore connector/BYOK usability.
- Operationally agreed recovery point/time objectives, measured in rehearsal
  rather than invented as product guarantees.

A daily dump-to-Storage automation is not shipped or verified by this documentation
change. Do not treat the existing daily cron or the migration test workflow as one.

## 5. Isolated restore rehearsal (E11-06 definition of done)

1. Obtain owner approval and provision an isolated target; verify its project id
   is not production. Disable outbound email, cron and connector job execution
   before importing any data. Never attach real WordPress sites to a restored clone.
2. Select a verified backup; record checksum/time/schema version and missing scope.
   Obtain matching encryption material through the approved secret manager, not chat.
3. Restore using the provider-supported procedure appropriate to that backup.
   Keep provider-specific destructive commands out of generic copy/paste instructions.
4. Validate schema/migrations, constraints, counts, RLS/grants and cross-tenant
   denial tests with isolated accounts. Check representative encrypted values
   without logging plaintext. Check Storage and auth configuration separately.
5. Reconcile queued/running jobs before any reconnection: restoring database state
   can resurrect stale work, revoked connections, used pairing codes or replay
   nonces. Never automatically dispatch restored queues to production WordPress.
6. Exercise a fresh isolated connector plan/write/verify/undo and test auth with
   approved test inboxes. Record actual outcomes and observed recovery time/data loss.
7. Securely remove disposable data according to approved retention policy; retain
   redacted evidence and have the owner/operator sign off. Only then consider E11-06
   acceptance, with remaining production differences explicit.

## 6. Evidence record

Record date, responsible operator, authorisation, source/target identifiers,
backup checksum/time/scope, app commit/schema version, actual restore duration,
validation commands and exit codes, tenant checks, job reconciliation, losses and
cleanup result. Never attach backup dumps or secret material to a public PR.

This runbook change executes no backup, migration, restore or key rotation.
The database CI workflow validates an isolated fresh schema; it is not a backup
restore rehearsal. Live acceptance remains unverified until evidence is collected.

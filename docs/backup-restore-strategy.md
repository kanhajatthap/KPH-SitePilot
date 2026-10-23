# KPH SitePilot — Backup, Restore, and Disaster Recovery Strategy

**Scope**: Phase 5 (Controlled WordPress Editing & Safe Mutations)  
**Security Mandate**: Never execute mutating operations on WordPress without verified rollback snapshots or automated transactional rollback capability.

---

## 1. Safety Principles & Preconditions

Before any staged change plan can transition from `approved` to `applied` on a target site:
1. **Precondition Integrity**: The target resource's content hash is recorded at proposal time. If any concurrent edit alters the resource before execution, the change is aborted with `PRECONDITION_FAILED`.
2. **Snapshot Capturing**: The exact `before` state (raw content, post meta, title, excerpt, status) is stored in the `MutationController` applied snapshots journal.
3. **Dry-Run Validation**: Changes must complete dry-run validation with 0 fatal permission or structural warnings.
4. **Explicit Human Consent**: The change must be signed off by a human user with an immutable SHA256 integrity hash.
5. **Real Mutation Default**: `isRealMutationEnabled` remains `false` by default. Real writes are strictly opt-in and restricted to verified local development environments (`*.local`).

---

## 2. Resource-Level Rollback Capabilities

| Resource Type | Rollback Supported | Snapshot Technique | Rollback Mechanism | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **WordPress Pages** | **YES** | Pre-mutation JSON snapshot of post record (`title`, `content`, `excerpt`, `meta`). | `update_page` with previous snapshot data; revision restored. | Does not restore deleted media attachments if unlinked. |
| **WordPress Posts** | **YES** | Pre-mutation JSON snapshot. | `update_post` with previous snapshot. | Comments attached during the interim period remain intact. |
| **Site Options / Settings** | **YES** | Key-value snapshot of previous option value. | `update_option` reverting key to previous value. | Autoload flags must be matched accurately. |
| **Deleted Pages (`delete_page`)** | **PARTIAL** | Soft delete moves to WordPress Trash (`wp_trash_post`). Full deletion (`wp_delete_post(..., true)`) cannot be undone via REST. | Restore from Trash (`wp_untrash_post`). | Permanent hard-deletes are permanently destructive; dry-run flags warnings. |
| **Database Schema** | **NO** | Schema migrations require SQL backup dump. | `wp db import backup.sql` via WP-CLI. | REST API does not support arbitrary DB rollbacks; restricted to WP-CLI tooling. |

---

## 3. Disaster Recovery Runbook (LocalWP)

If a change leads to unintended site breakage on a LocalWP instance:

### Step 1: Automated Agent Rollback
In the KPH SitePilot Dashboard or API:
```powershell
# Invoke rollback endpoint for the specific plan ID:
Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/changes/rollback" -Method Post -ContentType "application/json" -Body (@{ planId = "<PLAN_ID>" } | ConvertTo-Json)
```

### Step 2: WordPress Built-In Post Revisions
Every page modification created via REST API creates a WordPress post revision.
1. Open WordPress Admin: `http://plugin-test.local/wp-admin/post.php?post=<POST_ID>&action=edit`
2. Click **Revisions** in the right document inspector sidebar.
3. Select the timestamp prior to the AI change and click **Restore This Revision**.

### Step 3: LocalWP Database Restore (WP-CLI)
```powershell
# Create backup before testing real mutations:
wp db export C:\AI\KPH SitePilot\backups\pre-mutation-backup.sql --path="C:\Users\india\Local Sites\plugin-test\app\public"

# Restore in case of failure:
wp db import C:\AI\KPH SitePilot\backups\pre-mutation-backup.sql --path="C:\Users\india\Local Sites\plugin-test\app\public"
```

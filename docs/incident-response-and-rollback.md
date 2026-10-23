# KPH SitePilot — Incident Response & Rollback Runbook

This runbook outlines incident response classifications, containment protocols, secret rotation procedures, and rollback workflows for KPH SitePilot.

---

## 1. Incident Severity Levels

| Severity | Definition | Examples | SLA (Containment) |
|---|---|---|---|
| **P1 — Critical** | Security breach, credential compromise, unauthorized write operation, or severe data corruption. | Exposed Application Password, unintended bulk page deletion, SSRF bypass. | < 15 minutes |
| **P2 — Major** | Partial service degradation, model provider outage, rate-limit blockage affecting all users. | Gemini 429 quota exhaustion, database connection pool exhaustion. | < 1 hour |
| **P3 — Minor** | Isolated bug, non-fatal parsing error, single-tenant UI glitch. | Unrecognized third-party block causing fallback warning. | < 24 hours |

---

## 2. Emergency Containment Playbooks

### Playbook A: WordPress Credential Compromise
1. **Immediate Revocation in WordPress**:
   - Log into WordPress Admin (`/wp-admin`).
   - Navigate to **Users $\to$ Profile**.
   - Scroll to **Application Passwords**.
   - Locate the compromised application name (e.g. `KPH-SitePilot`) and click **Revoke**.
2. **Mark Connection Revoked in Supabase**:
   ```sql
   UPDATE public.wordpress_connections
   SET status = 'revoked', updated_at = now()
   WHERE id = '<connection_id>';
   ```
3. **Audit Inspection**:
   - Query `audit_events` filtered by correlation ID or timestamp to inspect all actions executed during the compromise window:
   ```sql
   SELECT * FROM public.audit_events
   WHERE project_id = '<project_id>'
     AND created_at >= '<incident_start_time>'
   ORDER BY created_at DESC;
   ```

### Playbook B: Rogue Mutation or Content Corruption
1. **Trigger Automated Rollback via Mutation Controller**:
   - The Mutation Controller retains snapshots of the pre-change state (`before` in `StagedChangeOperation`).
   - Invoke `rollbackPlan(executedPlan)` to invert the applied operations:
     - `create_page` $\to$ delete or draft page.
     - `update_page` $\to$ restore previous title/content/status from snapshot.
     - `update_option` $\to$ revert option value.
2. **WordPress Native Revisions**:
   - If the Mutation Controller is offline, navigate to WordPress Admin $\to$ **Pages** $\to$ select affected page $\to$ **Revisions** (in block editor sidebar) $\to$ **Restore This Revision**.

### Playbook C: Gemini API Key Compromise or Quota Exhaustion
1. **Key Rotation in Google Cloud Console**:
   - Go to Google Cloud Console $\to$ **APIs & Services** $\to$ **Credentials**.
   - Create a replacement API key.
   - Update `.env.production` or cloud secret store:
     ```bash
     GEMINI_API_KEY="AIzaSyNewKey..."
     ```
   - Restart the backend API:
     ```bash
     sudo systemctl restart sitepilot-api
     ```
   - Delete the old key in Google Cloud Console.

---

## 3. Secret Rotation Procedures

### Rotating `VAULT_MASTER_KEY`
When rotating the 256-bit symmetric encryption key used for credential storage:
1. Generate a new 256-bit key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Execute the re-encryption script:
   - Read all records from `public.wordpress_connections`.
   - Decrypt `encrypted_credentials` using `OLD_VAULT_MASTER_KEY`.
   - Re-encrypt `encrypted_credentials` using `NEW_VAULT_MASTER_KEY`.
   - Update `encrypted_credentials` and `updated_at` in transaction.
3. Update `VAULT_MASTER_KEY` in Supabase Edge Secrets:
   ```bash
   supabase secrets set VAULT_MASTER_KEY="<new_key>"
   ```

---

## 4. Disaster Recovery & Database Restoration

### LocalWP Environment
- LocalWP stores database dumps and site files in `%USERPROFILE%\Local Sites\<site-name>\`.
- To restore from a LocalWP backup:
  1. Stop the site in LocalWP.
  2. Restore MySQL dump using WP-CLI:
     ```powershell
     wp db import backup.sql --path="C:\Users\india\Local Sites\plugin-test\app\public"
     ```
  3. Start the site in LocalWP.

### Supabase Cloud Environment
- Point-in-Time Recovery (PITR) allows database state restoration to any second within the retention window (up to 7 days).
- In Supabase Dashboard: **Project Settings** $\to$ **Database** $\to$ **Backups** $\to$ **Point in Time Recovery** $\to$ select timestamp immediately preceding incident.

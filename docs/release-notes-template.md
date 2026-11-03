# Release notes template

Copy this file into the GitHub release description for each production merge. Every field must be filled from a command or a live response — no guesses.

```markdown
## KPH SitePilot — <version or short commit> — <YYYY-MM-DD>

**Commit:** `<merge commit sha>`
**Deployed:** Vercel auto-deploy from `main` (no manual redeploy)
**Health:** `GET https://kph-sitepilot.vercel.app/api/health?v=<PR number>` → `status:ok`, `commit:<short sha>`

### What changed
- <one line per shipped backlog task, with its E-number>

### Verification
- `pnpm release:check` → <N>/<N> gates green (typecheck, lint + audits, tests, build, diff check)
- Tests: <total> pass / 0 fail, <files> files; dashboard <n>/<n>
- CI: run <id> on `main` → success
- Production health: <timestamp from the live response>

### Owner-side work still owed
- <staging Supabase project / real SMTP E2E / real-device Lighthouse check, if any>

### Rollback
- Revert the merge commit on `main`; Vercel auto-deploys the previous commit.
- WordPress writes are already reversible through snapshots + one-click undo; do not
  replay a plan against a site whose read-back verification failed.

### Safety notes
- Connector is the only WordPress transport; no arbitrary code executes on a site.
- Production sites require `environment: production` + pairing, default draft/private,
  R2 `CONFIRM`, R3 fresh snapshot + plan-id, read-back verification and undo.
```

## Versioning

- The workspace version stays `0.1.0` until a breaking contract change; releases are identified by the merge commit SHA and the PR number used as the health cache-buster.
- Connector releases use their own semantic version (`kph-sitepilot-connector-<version>.zip`) and are gated by the min-version check.
- Never put a credential, connection string or raw error payload in release notes.

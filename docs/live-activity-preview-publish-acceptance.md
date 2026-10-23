# KPH SitePilot — Live Agent Activity, Visual Preview & Publish Approval Upgrade Acceptance Report

**Date**: 2026-10-22  
**Status**: APPROVED & VERIFIED  
**Reference Post**: Post #23 on `http://test.local` (Untouched, verified `draft` status preserved)  
**Monorepo Test Pass Rate**: 267 / 267 Passing (100%)  
**TypeScript / Lint Status**: 0 Errors, Clean Build  

---

## 1. Executive Summary

This upgrade enhances the KPH SitePilot Intelligent Agent Workspace with real-time truthful task visibility, side-by-side post preview, a structured draft completion card, an explicit separate publish privilege boundary, and a staged revision workflow.

### Core Upgrades Implemented

1. **Truthful Real-Time Activity Feed**:
   - Replaced static waiting spinners with real-time discrete step streaming via SSE (`/api/task/stream?taskId=...`).
   - Discrete steps: *Understanding request*, *Inspecting target WordPress site*, *Checking duplicates*, *Planning structure*, *Staging proposal*, *Awaiting approval*, *Saving approved draft*, *Verifying resource*, *Refreshing preview*, *Asking next steps*.
   - Zero fabricated progress percentages: only real elapsed seconds and truthful step states (`pending`, `running`, `completed`, `failed`, `cancelled`, `waiting_for_approval`).
   - Cooperative Stop action to cancel tasks cleanly without leaving orphan operations.

2. **Persistent Side-by-Side Visual Preview**:
   - Clear amber banner `PREVIEW (NOT SAVED)` on staged uncommitted proposals.
   - Read-only resource retrieval via `POST /api/post/get` returning standardized `VerifiedResource`.
   - Clear `DRAFT` vs `PUBLISHED` status badges, last verified timestamp, manual refresh button, and direct "Open in WP Admin" link (`wp-admin/post.php?post={id}&action=edit`).

3. **Draft Completion Card**:
   - Once a draft is saved and verified, the agent renders a structured card with 4 explicit choices:
     - `[ 👁️ Preview Draft ]`: Focuses and refreshes the side-by-side preview canvas.
     - `[ ✏️ Revise Draft ]`: Opens an inline revision modal with custom instructions and staged diff review.
     - `[ 🚀 Publish Now ]`: Initiates the separate publish confirmation workflow.
     - `[ 📁 Keep as Draft ]`: Dismisses the card and acknowledges retention in draft status.

4. **Separate Publish Approval Privilege Boundary**:
   - Creating a draft does NOT permit publishing. Publishing requires a distinct proposal (`POST /api/publish/propose`) and explicit user confirmation (`POST /api/publish/apply`).
   - Requires explicit confirmation via modal displaying public visibility warnings: *"Publishing will make this post immediately visible to the public on {targetSite}"*.
   - Cryptographic SHA-256 integrity hash verification prevents proposal tampering between review and execution.
   - Post-execution independent read-only lookup verifies `post.status === 'publish'` and sets `isLivePublished: true`.

5. **Revise & Republish Workflow**:
   - Allows users to provide iterative feedback on existing drafts via `POST /api/draft/revise`.
   - Generates staged before/after diffs without immediate database mutation.
   - Follows identical Controlled Writes approval requirements for applying revisions.

---

## 2. Reference Post #23 Safety & Verification Evidence

As strictly mandated, WordPress post #23 on `http://test.local` was **not modified, published, or deleted** during implementation or testing.

### Verification Command & Output
```powershell
$body = @{ siteUrlOrSlug = "http://test.local"; targetSite = "http://test.local"; postId = 23 } | ConvertTo-Json
($res = Invoke-RestMethod -Uri "http://localhost:3002/api/post/get" -Method Post -ContentType "application/json" -Body $body).post | Format-List
```

**Output**:
```yaml
id              : 23
type            : post
slug            : post-23
title           : 2 How to Make a Simple Website Using AI
status          : draft
editLink        : http://test.local/wp-admin/post.php?post=23&action=edit
targetSite      : http://test.local
lastVerifiedAt  : 2026-10-22T13:04:48.230Z
isLivePublished : False
```

Post #23 remains in `draft` status with `isLivePublished: False`.

---

## 3. Test & Verification Evidence

### Monorepo Test Summary (`pnpm test`)
- **Total Test Files**: 35 passed (35)
- **Total Tests**: 267 passed (267)
- **Exit Code**: 0

| Package | Test Suites | Tests | Status |
| :--- | :--- | :--- | :--- |
| `@wp-agent/contracts` | 1 | 13 | PASSED |
| `@wp-agent/config` | 1 | 9 | PASSED |
| `@wp-agent/audit` | 1 | 4 | PASSED |
| `@wp-agent/wp-client` | 3 | 33 | PASSED |
| `@wp-agent/supabase` | 5 | 33 | PASSED |
| `@wp-agent/dashboard` | 5 | 27 | PASSED |
| `@wp-agent/model-adapters` | 3 | 25 | PASSED |
| `@wp-agent/api` | 9 | 54 | PASSED |
| `@wp-agent/agent-core` | 7 | 59 | PASSED |
| **Total Monorepo** | **35** | **267** | **ALL PASSED** |

### TypeScript Typecheck (`pnpm typecheck`)
- `turbo run typecheck && pnpm typecheck:edge`: 15 tasks successful, 0 errors, exit code 0.

### Linting (`pnpm lint`)
- `turbo run lint && pnpm typecheck:edge`: 9 tasks successful, 0 errors, exit code 0.

### Production Build (`pnpm build`)
- `turbo run build`: 9 packages built successfully, Next.js optimized bundles generated, exit code 0.

---

## 4. Live API & Security Gate Verification Evidence

| Test Scenario | Endpoint & Method | Input Payload | Result & Exit Code | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Verified Post Lookup** | `POST /api/post/get` | `{ targetSite: "http://test.local", postId: 23 }` | 200 OK | Returned post #23 with status `draft`, `isLivePublished: false`, verified timestamp |
| **SSE Activity Stream** | `GET /api/task/stream?taskId=sample-task` | `taskId=sample-task` | 200 OK (text/event-stream) | Received `: connected to task sample-task` event heartbeat |
| **Publish Proposal Generation** | `POST /api/publish/propose` | `{ targetSite: "http://test.local", postId: 23, postTitle: "2 How to Make a Simple Website Using AI" }` | 200 OK | Generated `planId`, SHA-256 `integrityHash`, status `proposed`, and public visibility warning |
| **Tampered Hash Rejection** | `POST /api/publish/apply` | `{ planId: "...", integrityHash: "invalid-tampered-hash", targetSite: "http://test.local", postId: 23, intendedStatus: "publish" }` | 403 Forbidden | `FORBIDDEN`: Integrity hash mismatch: The publish proposal was modified after creation! |
| **Unauthorized Target Rejection** | `POST /api/publish/apply` | `{ targetSite: "https://evil.com", ... }` | 403 Forbidden | `TARGET_NOT_ALLOWED`: Target "https://evil.com" is not an authorized local development environment. |
| **Draft Revision Proposal** | `POST /api/draft/revise` | `{ targetSite: "http://test.local", postId: 23, revisionPrompt: "Test proposal generation", ... }` | 200 OK | Generated staged before/after diff with `status: proposed` without mutating WordPress |

---

## 5. Security & Isolation Verification

1. **Deny-by-Default Writes**: All write actions require explicit user approval with staged SHA-256 cryptographic hashes.
2. **Strict Target Allowlisting**: Only local development environments (`*.local`, `localhost`, `127.0.0.1`) are accepted. Production URLs are unconditionally rejected at both dashboard proxy and core API layers.
3. **No Secret Leakage**: WP application passwords, session secrets, and LLM API keys are kept strictly server-side and never sent to browser clients or logged in SSE events.
4. **Mocked Unit Tests**: All automated unit tests run against in-memory mock transports and isolated SQLite/memory fixtures; no network calls or database modifications occurred on `http://test.local` during test execution.

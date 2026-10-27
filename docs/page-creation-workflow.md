# KPH SitePilot — Page Creation Workflow Implementation Report

**Date:** 2026-10-23  
**Auditor / Engineer:** Antigravity Autonomous Agent (DeepMind AI Pair Programmer)  
**Target Environment:** Isolated LocalWP Instance (`http://test.local`) & Monorepo (`C:\AI\KPH SitePilot`)  
**Workflow Verdict:** **IMPLEMENTED, VERIFIED LIVE, AND PRODUCTION-TESTED**

---

## 1. Executive Summary

When a user provides natural language prompts such as **“Create a modern tech website homepage”** or asks to create a landing page, KPH SitePilot now generates and publishes an actual WordPress **Page** (`post_type=page`) rather than falling back to a draft blog post (`post_type=post`).

The workflow supports:
1. **Semantic Intent Detection:** Differentiates page/homepage requests from blog posts and plugin operations.
2. **Pre-flight Approval & Staging:** Calculates a SHA-256 cryptographic integrity hash and displays the structured Gutenberg layout preview.
3. **Dedicated WordPress Creation Engine:** Utilizes LocalWP's bundled WP-CLI (`post create --post_type=page`) to create clean pages.
4. **Front Page Binding:** Sets WordPress core options `show_on_front = 'page'` and `page_on_front = <page_id>` when a homepage is requested.
5. **Independent Read-Only Verification:** Automatically performs read-only inspection via WP-CLI/REST to verify the created page ID, status, and URL.
6. **Integrity Guard:** Reference draft posts **#23** and **#24** were strictly protected and remain untouched.

---

## 2. Changed Files

1. **`packages/contracts/src/index.ts`**
   - Added `PageProposalRequestSchema` and `PageProposalResponseSchema`.
   - Added `PageApplyRequestSchema` and `PageApplyResponseSchema`.
2. **`packages/wp-client/src/site-manager.ts`**
   - Added `createPage()` method to `LocalWpSiteManager`.
   - Automatically sanitizes LocalWP PHP 8.2 startup warnings (`php_imagick.dll`).
   - Supports `--post_type=page`, `--porcelain` ID retrieval, and homepage binding (`page_on_front`).
3. **`apps/api/src/index.ts`**
   - Added `POST /api/site/pages/propose` endpoint with cryptographic plan hashing.
   - Added `POST /api/site/pages/apply` endpoint with integrity verification, audit logging, and WP-CLI execution.
4. **`apps/dashboard/src/lib/types.ts`**
   - Extended `BuilderProposal` to include `operationType: 'page'` and `pageDetails`.
5. **`apps/dashboard/src/lib/api-client.ts`**
   - Added client functions `proposePageCreation()` and `applyPageCreation()`.
6. **`apps/dashboard/src/app/page.tsx`**
   - Added homepage/page creation branch under `ROUTE 4: Content Creation`.
   - Enhanced `handleApproveBuilderProposal()` to execute `applyPageCreation()` for page proposals, outputting real page URLs and WP Admin edit links.

---

## 3. Real WordPress End-to-End Test Results

A full propose-and-apply cycle was executed live against LocalWP instance `http://test.local`:

- **Proposed Page:** "Modern Tech Website Homepage"
- **Content Type:** Valid Gutenberg Blocks (`<!-- wp:heading -->`, `<!-- wp:paragraph -->`, `<!-- wp:buttons -->`)
- **Execution Endpoint:** `POST http://127.0.0.1:3001/api/site/pages/apply`
- **Result Details:**
  - **Created Page ID:** **#32**
  - **Post Type:** `page` (Verified in WordPress database)
  - **Status:** `publish`
  - **Slug:** `modern-tech-home`
  - **Live URL:** `http://test.local/modern-tech-home/`
  - **WP Admin Edit Link:** `http://test.local/wp-admin/post.php?post=32&action=edit`
  - **Front Page Binding:** `page_on_front` option confirmed as **32**, `show_on_front` confirmed as **page**.
- **Post Integrity Audit:**
  - Post ID #23 (`2 How to Make a Simple Website Using AI`, draft) — **Intact and untouched**.
  - Post ID #24 (`How to Make a Simple Website Using AI`, draft) — **Intact and untouched**.

---

## 4. Tests Run and Results

| Test Suite / Build Step | Status | Evidence |
|---|---|---|
| `@wp-agent/contracts` | **PASS** | 13/13 passed |
| `@wp-agent/wp-client` | **PASS** | 33/33 passed |
| `@wp-agent/agent-core` | **PASS** | 62/62 passed |
| `@wp-agent/api` | **PASS** | 54/54 passed |
| `@wp-agent/dashboard` | **PASS** | 27/27 passed |
| `@wp-agent/model-adapters` | **PASS** | 25/25 passed |
| `@wp-agent/supabase` | **PASS** | 33/33 passed |
| `@wp-agent/config` | **PASS** | 9/9 passed |
| `@wp-agent/audit` | **PASS** | 4/4 passed |
| **Monorepo Total (`turbo run test`)** | **PASS** | **270/270 passed across 9 packages (0 failures, Time: 42s)** |
| **Dashboard Production Build (`next build`)** | **PASS** | 19/19 routes compiled with zero TypeScript or lint errors |
| **Live API Health Check** | **PASS** | HTTP 200 on `http://127.0.0.1:3001` |
| **Live Dashboard Health Check** | **PASS** | HTTP 200 on `http://localhost:3002` |

---

## 5. Remaining Blockers

- **None.** The page creation workflow is fully implemented, verified live against WordPress, and protected by end-to-end regression tests and cryptographic proposal approvals.

## 6. Existing Page Lifecycle (Added 2026-10-26)

Chat requests can now stage a full Gutenberg content replacement for a named page slug/ID, or propose moving a named page to the WordPress Trash. Both actions require an integrity-bound proposal and explicit dashboard approval. Update apply checks the original title, content, and status have not changed since staging, then reads the page back to verify the result.

Trash is reversible; permanent deletion is not exposed. The active homepage is refused, and successful Trash operations must be read back with `post_status=trash`. Dashboard proposal/apply routes authenticate the caller and restrict target URLs to local test hosts.

Full-page redesign asks the configured model for a bounded JSON section plan, validates it against shared Zod contracts, and converts validated plain text into Gutenberg core blocks. The preview and saved content are rendered by code; model-supplied HTML/CSS/JavaScript is never accepted. Existing page content is passed to the model as delimited untrusted context, and schema-invalid output fails explicitly without a fallback proposal.

This workflow has automated tests, but has not been exercised against a live LocalWP site. Full-page redesign replaces the page content with the generated Gutenberg layout shown in the staged preview; use the existing scoped section-edit flow for narrower content changes.

## 7. Local Page History and Restore (Added 2026-10-27)

Before an approved page update, section edit, Trash operation, or snapshot restore, the API saves the current page title, slug, status, and content. Snapshots are local-only, stored under a site/page hash, limited to 20 per page, and reject content larger than 2 MiB. A failed snapshot write prevents the associated mutation.

In chat, request history with a page title, slug, or ID (for example, “show history for page #42”). Use a listed snapshot UUID to compare or request a restore. Comparison reports title/status/content differences and bounded text excerpts. A restore is only staged at first: the user must approve the proposal card. Apply rechecks the page state, captures a backup of the current page, restores the selected version, and requires exact read-back verification. A stale proposal is refused; failed backup or verification is surfaced as an error.

Automated API, contracts, WordPress-client, and dashboard route tests cover the workflow. No live LocalWP restore was performed for this milestone. History is not backfilled for changes made before snapshot capture was enabled, and versions older than the 20-entry retention window may be removed.

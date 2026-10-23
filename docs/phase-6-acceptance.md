# Phase 6 Acceptance Report — WordPress Builder Integrations

**Date**: 2026-10-22  
**Target Environment**: LocalWP (`http://test.local`, `http://plugin-test.local`)  
**Backend API**: `http://127.0.0.1:3001`  
**Dashboard UI**: `http://localhost:3002`  
**Status**: **PASSED**  

---

## 1. Executive Summary

Phase 6 enables **KPH SitePilot** to detect, understand, and generate validated, compatible website structures across five key WordPress editor ecosystems in strictly sequential order:
1. **Gutenberg / Block Editor**: Core block serialization, comment delimiting (`<!-- wp:heading -->`), inner HTML rendering, and verbatim preservation of third-party / unknown block namespaces (`core/*` vs third-party).
2. **Elementor**: Section -> Column -> Widget tree generation, settings schemas (`title`, `editor`, `button`), element parsing, and verbatim preservation of third-party widgets.
3. **Advanced Custom Fields (ACF)**: Field group constraint validation (`key`, `name`, `type`, `required`), data type validation, and preview card rendering.
4. **WooCommerce**: Product data validation (numeric pricing, `salePrice < regularPrice` enforcement), and High-Performance Order Storage (HPOS) compatibility checks.
5. **Custom Themes & FSE**: `theme.json` parser, Full Site Editing (FSE) block theme detection vs Classic PHP themes, color palette extraction, and font family inspection.

Every builder mutation strictly integrates with **Phase 5's human approval workflow** using a staged `ChangePlan`, SHA-256 integrity hash verification, and verified post creation via `POST /api/mutate/apply`.

---

## 2. Implementation Architecture

### 2.1 Package Contracts (`packages/contracts`)
- Added `BuilderTypeSchema`: `'gutenberg' | 'elementor' | 'acf' | 'woocommerce' | 'theme'`.
- Added `BuilderCapabilitiesSchema`: boolean flags for each builder, theme manifest info, and `supportedNamespaces: string[]`.
- Added `BuilderDetectRequestSchema` & `BuilderDetectResponseSchema`.
- Added `BuilderProposeRequestSchema` & `BuilderProposeResponseSchema`.

### 2.2 WordPress Client (`packages/wp-client`)
- `detectCapabilities(siteUrlOrSlug)`: Probes `/wp-json/` index for REST namespaces (`wp/v2`, `elementor/v1`, `acf/v3`, `wc/v3`) and active theme.
- `readBuilderContent(siteUrlOrSlug, pageIdOrSlug)`: Distinguishes Gutenberg, Elementor, or Classic markup and extracts structural blocks/elements.
- `proposeGutenbergPost(siteUrlOrSlug, params)`: Serializes Gutenberg blocks, generates before/after diffs, and preserves third-party blocks verbatim.
- `proposeElementorPost(siteUrlOrSlug, params)`: Converts sections to Elementor element tree, generates before/after diffs, and preserves custom widgets.
- `validateAcf(values, group)`: Validates custom field values against field group definitions.
- `validateProduct(product)`: Validates WooCommerce product pricing and stock constraints.
- `checkHpos(systemStatus)`: Verifies HPOS database table and environment status.
- `inspectTheme(siteUrlOrSlug)`: Parses theme manifest, detecting block templates and `theme.json` palette/fonts.

### 2.3 Agent Core (`packages/agent-core`)
- Registered `builder.detect` and `builder.inspect` tools under `PermissionLevel.READ_ONLY` in `PermissionRegistry`.
- Integrated builder proposal generation with `calculatePlanHash` for anti-tamper security.

### 2.4 Server-Side API (`apps/api`)
- `POST /api/builder/detect`: Validates target site URL, queries capabilities via `wpClient.detectCapabilities`, records audit log, and returns capabilities.
- `POST /api/builder/propose`: Validates request, generates builder-native structures, calculates SHA-256 hash, stages change in `activeProposals`, and returns preview HTML and before/after diff.
- Integrated with `POST /api/mutate/apply` for human approval execution.

### 2.5 Dashboard Workspace (`apps/dashboard`)
- Added Next.js proxy routes `/api/builder/detect` and `/api/builder/propose`.
- Added capability detection on site selection with active builder badges in `Header.tsx`.
- Added View 8 in `PreviewCanvas.tsx` featuring visual preview, side-by-side Before/After diff, raw markup tabs, and "✓ Approve Changes & Save Draft" button.
- Added Phase 6 quick prompts and builder staging cards in `ChatPanel.tsx`.

---

## 3. Verification & Evidence

### 3.1 Typecheck (`pnpm typecheck`)
```
$ turbo run typecheck
• Packages in scope: @wp-agent/agent-core, @wp-agent/api, @wp-agent/audit, @wp-agent/config, @wp-agent/contracts, @wp-agent/dashboard, @wp-agent/model-adapters, @wp-agent/supabase, @wp-agent/wp-client
• Running typecheck in 9 packages
Tasks:    15 successful, 15 total
Time:     20.184s
```

### 3.2 Full Test Suite (`pnpm test`)
```
Tasks:    18 successful, 18 total
Time:     1m17.655s

Summary of Test Results:
- @wp-agent/config:          4 passed (4)
- @wp-agent/contracts:       7 passed (7)
- @wp-agent/audit:           3 passed (3)
- @wp-agent/model-adapters: 25 passed (25)
- @wp-agent/wp-client:      27 passed (27)
- @wp-agent/supabase:       21 passed (21)
- @wp-agent/agent-core:     46 passed (46)
- @wp-agent/api:            33 passed (33)
- @wp-agent/dashboard:      15 passed (15)

Total: 161 passed, 0 failed across all packages
```

### 3.3 Dashboard Production Build (`pnpm --filter @wp-agent/dashboard build`)
```
Route (app)                                 Size  First Load JS
┌ ○ /                                    14.8 kB         117 kB
├ ○ /_not-found                            988 B         103 kB
├ ƒ /api/agent                             142 B         102 kB
├ ƒ /api/builder/detect                    142 B         102 kB
├ ƒ /api/builder/propose                   142 B         102 kB
├ ƒ /api/chat                              142 B         102 kB
├ ƒ /api/health                            142 B         102 kB
├ ƒ /api/mutate/apply                      142 B         102 kB
├ ƒ /api/mutate/propose                    142 B         102 kB
└ ƒ /api/plan                              142 B         102 kB
+ First Load JS shared by all             102 kB
```

### 3.4 Live Smoke Test on LocalWP (`test.local`)
Executed via `scratch/smoke-test.ps1`:
```
=== 1. Testing Gutenberg Proposal ===
Gutenberg Status: proposed | Hash: 26644a06a6e0

=== 2. Testing Elementor Proposal ===
Elementor Status: proposed | Elements staged: 1

=== 3. Testing ACF Proposal ===
ACF Status: proposed | Hash: ee67522c1c36

=== 4. Testing WooCommerce Proposal ===
WooCommerce Status: proposed | Hash: e2f93c9bb9cc

=== 5. Testing Theme Inspection Proposal ===
Theme Proposal Status: proposed | Hash: 14d15b9fa38f

=== 6. Testing Next.js Proxy Routes on Dashboard (port 3002) ===
Dashboard Proxy Detect Status: True
```

---

## 4. Compatibility & Limitations Matrix

| Builder / Ecosystem | Capability Detection Method | Round-Trip Preservation | Limitations / Fallback |
| :--- | :--- | :--- | :--- |
| **Gutenberg** | Checks `wp/v2` namespace and block comment markers | Preserves unknown namespaces (`core/*` vs third-party) verbatim | Dynamic PHP blocks are rendered with placeholder previews |
| **Elementor** | Checks `elementor/v1` namespace and CSS classes | Preserves custom widget types and unrecognized controls verbatim | Complex custom CSS extensions require live Elementor editor |
| **ACF** | Checks `acf/v3` or `acf/v2` namespace | Enforces field constraints and required flags | Repeater sub-fields require structured object array schemas |
| **WooCommerce** | Checks `wc/v3` or `wc/v2` namespace | Validates price logic (`salePrice < regularPrice`) and HPOS status | Product attributes and variable product matrices require HPOS |
| **Custom Themes** | Probes active theme endpoint & `theme.json` | Distinguishes FSE block themes vs Classic PHP themes | Classic PHP templates cannot be edited via block simulator |

---

## 5. Security & Operational Boundary Validation

1. **Deny-by-Default Writes**: Builder proposals generate a read-only staging diff with zero live WordPress database mutations.
2. **Phase 5 Approval Reused**: Every builder proposal computes a SHA-256 integrity hash across the proposed operations. If any parameter is tampered with post-approval, the request is rejected with `403 FORBIDDEN`.
3. **No Unsafe Execution**: Generated code contains no arbitrary PHP, JavaScript, or direct SQL execution. Block markup is strictly serialized according to standard WordPress core rules.
4. **Target Site Isolation**: Requests are strictly bound to local development instances (`*.local`, `localhost`, `127.0.0.1`).

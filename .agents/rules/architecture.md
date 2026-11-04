---
name: architecture-boundaries
description: Enforces provider-independent architecture, monorepo module boundaries, connector-only WordPress transport and product-phase write gating.
trigger: always_on
phase: product-phase
---

# Architecture Rules

## 1. Provider Independence
- Keep core domain models, prompt orchestration, and agent planning decoupled from specific AI provider SDKs (Gemini, OpenRouter, Groq, local models).
- Use interface adapters and standardized tool contracts (`model-adapter-and-tool-contracts`) so providers can be swapped without affecting business logic.
- BYOK keys are optional; the deterministic planner must keep working without one.

## 2. Monorepo Structure & Boundaries
- Workspace managed with `pnpm` workspaces and `turbo`.
- Packages must declare explicit dependencies; circular imports between monorepo packages are strictly prohibited.
- Application code, agent runtime, and the WordPress connector plugin live in dedicated subpackages with separate build and test lifecycles.
- `@wp-agent/wp-tools` is the single source of truth for tool names, scopes, risk floors, undo metadata and Zod argument schemas.

## 3. Product-Phase Write Gating (replaces the old read-only phase)
- The foundational read-only phase is **over**. The shipped product writes to real sites through the gated pipeline:
  **plan → approve → snapshot → write → read-back verify → one-click undo**.
- R0 read tools need no approval. R1–R3 writes require an approved, immutable, SHA-256-hashed plan; R2 needs typed `CONFIRM`, R3 needs a fresh snapshot plus the plan-id confirmation.
- The risk floor declared in `WP_TOOL_SPECS` can only be raised by the planner, never lowered. Editing a plan invalidates its hash so an old approval cannot be replayed.
- Production sites are allowed once explicitly registered as `environment: production` and paired through a single-use code (plan §8.2). Default writes are drafts; publishing is an explicit R2 tool.
- Ownership is resolved owner-side (RLS + `site_metadata` security-barrier view); unknown targets fail closed.

## 4. The connector is the only WordPress transport; no arbitrary code
- **The connector is the only WordPress transport.** All site reads and writes go through the signed job queue (`/api/connector/jobs/claim`, `…/result`) and the plugin's allowlisted tool registry.
- **No arbitrary code**: no user-supplied PHP, SQL, shell, WP-CLI, file edits, plugin uploads or code injection. The cloud never invents a tool at runtime; unknown tool names are refused.
- No tool may be created dynamically from prompt or site content. Site content is untrusted input, wrapped and validated, never a source of privileges.
- The cloud never fetches arbitrary site URLs; only paired-site, signed paths are permitted (SSRF control).
- Read-only legacy API routes are for the local development workspace; the hosted product uses the connector.

## 5. Toolchain
- Standardize on PHP 8.2+ (CI `wordpress-plugin` job), Node.js 22 LTS, pnpm 12 via Corepack, Turborepo, TypeScript strict.
- LocalWP remains a valid *local* development target, but it is not the only target and LocalWP-specific assumptions must not leak into hosted code paths.
- `supabase/migrations/**` and `supabase/tests/database/rls.test.sql` are exercised by `supabase test db --local` on `main` pushes touching those paths.

## 6. Delivery
- Four gates before a PR (`pnpm typecheck`, `pnpm lint`, `pnpm test --force`, `pnpm build`) plus `git diff --check`; `pnpm lint` also runs the governance audit.
- PR → checks → merge to `main`; Vercel auto-deploys every merge. Never push directly to `main`.

## Approved restricted-editor workstream (2026-11-04)

The owner approved development of a **staging-only restricted file editor** for
exactly selected theme/plugin PHP, JS and CSS files, not full filesystem access.
The experimental engine may be developed and tested in isolated fixtures. It is
**not bootstrapped, not a shipped connector tool, and not available to prompts**.
The shipped no arbitrary code policy remains in force until a separately reviewed
R3 plan/approval, capability, UI and recovery integration is implemented.

Release requirements: explicit local operator opt-in, WordPress staging check,
exact file allowlist, admin/edit capabilities, protected paths and secrets blocked,
immutable expiring approval, current-file hashes, encrypted verified backup before
write, private same-filesystem temporary workspace, atomic replacement and read-back.
A PHP parse check is not proof of safe runtime behaviour. SQL, shell, WP-CLI, core
files, uploads, unrestricted filesystem and production file editing remain blocked.
See `docs/restricted-file-editor.md` for scope, residual risks and release gates.

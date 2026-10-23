---
name: architecture-boundaries
description: Enforces provider-independent architecture, monorepo module boundaries, and read-only foundational constraints.
trigger: always_on
---

# Architecture Rules

## 1. Provider Independence
- Keep core domain models, prompt orchestration, and agent planning decoupled from specific AI provider SDKs (OpenAI, Anthropic, Gemini, local models).
- Use interface adapters and standardized tool contracts (`model-adapter-and-tool-contracts`) so providers can be swapped without affecting business logic.

## 2. Monorepo Structure & Boundaries
- Workspace managed with `pnpm` workspaces and `turbo`.
- Packages must declare explicit dependencies; circular imports between monorepo packages are strictly prohibited.
- Application code, agent runtime, and WordPress bridge plugins must live in dedicated subpackages with separate build and test lifecycles.

## 3. Read-Only Foundational Phase
- The foundational layer operates in read-only inspection mode.
- Read operations (fetching schema, querying post types, inspecting installed plugins) are permitted on designated LocalWP test sites.
- Mutating operations (writing files, updating options, inserting records, installing plugins) require explicit confirmation and authorization guards.

## 4. LocalWP Toolchain Compatibility
- Standardize on PHP 8.2+ bundled with LocalWP.
- Use LocalWP's bundled Composer 2 and WP-CLI binaries.
- Do not modify or replace LocalWP's system configurations or databases during workspace tasks.

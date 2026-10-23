# wp-agent — Workspace Agent Guidelines

`wp-agent` is a provider-independent AI WordPress agent monorepo designed with a security-first, read-only foundation before any mutating site-builder operations are enabled.

## Core Operational Constraints

1. **Security & Secrets**:
   - Never write, log, or commit credentials, API keys, database passwords, or auth salts.
   - Never target or connect to production WordPress environments.
   - Restrict all local WordPress interactions to isolated LocalWP test sites (e.g., `plugin-test.local`).
   - All tool-driven WordPress execution and site modifications remain **deny-by-default**.

2. **Monorepo & Toolchain**:
   - Package manager: `pnpm` (Corepack-managed, v12+).
   - Monorepo orchestrator: Turborepo (`turbo`).
   - PHP runtime & tooling: LocalWP bundled PHP 8.2 (`php.exe`), Composer 2 (`composer.phar`), and WP-CLI (`wp-cli.phar`).
   - Node runtime: Node.js 22 LTS.

3. **Implementation Discipline**:
   - Initial phase is strictly read-only and exploratory.
   - Do not scaffold code, create plugins, or generate ZIP packages until explicitly directed.
   - Do not alter LocalWP databases or core files during environment preparation.

4. **Token Efficiency & Workflow**:
   - Load only files and skills relevant to the active task.
   - Prefer targeted grep/ast searches over reading directory trees or full repository dumps.
   - Apply progressive disclosure: consult `.agents/rules/` for detailed constraints and `.agents/skills/<name>/SKILL.md` for specific runbooks.

5. **Evidence-Based Verification**:
   - Never report tests, builds, or commands as passing without explicit execution evidence in terminal output.
   - Report executed commands, stdout/stderr, changed files, and any remaining blockers honestly.

# Monorepo Testing Architecture

This repository adopts a tiered testing architecture adhering to the project testing rules (`.agents/rules/testing.md`):

## 1. Targeted Unit Tests (Level 1)
Run individual test suites during development without spinning up full builds:
```powershell
# Run a specific package test suite
pnpm --filter @wp-agent/agent-core test
pnpm --filter @wp-agent/wp-client test
pnpm --filter @wp-agent/contracts test
pnpm --filter @wp-agent/audit test
pnpm --filter @wp-agent/config test
pnpm --filter @wp-agent/api test
```

## 2. Monorepo Task Pipeline (Level 2 & 3)
Run checks through Turborepo — this is the supported path and what CI uses:
```powershell
# Typecheck all packages
pnpm typecheck

# Run all test suites (builds workspace dependencies first)
pnpm test

# Full production build
pnpm build
```

> [!IMPORTANT]
> Do not use `pnpm -r test` on a clean checkout. Recursive pnpm skips Turbo's
> `dependsOn: ["^build"]`, so tests import `@wp-agent/*` before `dist/` exists and
> fail with "Failed to resolve entry for package". If you must run a single
> package recursively, run `pnpm build` first. CI (`.github/workflows/ci.yml`)
> intentionally calls `pnpm test` for this reason.

## 3. WordPress Plugin Static Checks
Verify the WordPress companion bridge without altering LocalWP test databases:
```powershell
php -l wordpress/wp-agent-bridge/wp-agent-bridge.php
php wordpress/wp-agent-bridge/tests/test-plugin.php
```

## 4. Security & Safety Testing Guardrails
- **In-Memory Isolation**: Unit tests utilize `MockModelAdapter` and injectable HTTP transport (`mockTransport`). Zero real network or API calls are made during unit testing.
- **Zero Real Credentials**: Tests verify that missing credentials and configuration errors fail safely with structured `AgentError` exceptions.
- **Zero Database Modification**: Tests never run destructive mutations against LocalWP databases.

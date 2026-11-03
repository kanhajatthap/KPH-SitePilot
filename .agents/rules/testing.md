---
name: testing-standards
description: Enforces evidence-based testing, targeted-first execution, and test environment isolation.
trigger: always_on
phase: product-phase
---

# Testing Rules

## 1. Evidence-Based Reporting
- Never claim tests, linting, builds, or scripts passed without actual execution evidence.
- Include the exact command line executed, working directory, exit code, and summary of test passes/failures in task reports.
- If a test or command cannot be run, report it as unverified rather than assuming success.

## 2. Targeted-First Testing Order
- **Level 1 (Targeted)**: Run only the specific test file or suite affected by the recent changes (e.g., `pnpm test path/to/spec.ts` or `composer test -- --filter SpecificTest`).
- **Level 2 (Package-level)**: Run package-scoped test suite upon passing targeted tests.
- **Level 3 (Milestone/Monorepo)**: Run full monorepo checks (`pnpm test`, `turbo run test`) only at major milestones, pull requests, or completion reviews.

## 3. Test Isolation & Database Safety
- Do not run destructive integration tests against LocalWP databases without backup or transactional rollback.
- Hosted-product database tests use an isolated local Supabase stack (`supabase test db --local` on `main` pushes touching migrations/tests), never the production project.
- Prefer in-memory mocks, isolated SQLite fixtures, or ephemeral test containers for unit testing.
- When running WordPress integration tests, verify the test environment uses an isolated test database prefix (`wptests_`) and mock fixtures.

## 4. Linting & Static Analysis
- Enforce TypeScript type-checking (`tsc --noEmit`) and `pnpm lint` before declaring frontend work complete.
- Enforce PHP CodeSniffer (`phpcs`) with WordPress Coding Standards and PHPStan/Psalm for PHP code before release.

## 5. Hosted Product Gates
- Four gates before any PR: `pnpm typecheck`, `pnpm lint`, `pnpm test --force`, `pnpm build`, plus `git diff --check`.
- `pnpm lint` includes PHP parsing (`scripts/php-lint.mjs`), Edge typecheck and the governance audit (`scripts/governance-audit.mjs`).
- CI runs a real PHP 8.2 connector job; no PHP binary is available in the sandbox, so report local PHP verification honestly.
- PR → checks → merge to `main`; Vercel auto-deploys every merge. Verify the deployed commit with `/api/health?v=<n>`.

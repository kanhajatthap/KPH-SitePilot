# Architecture Decision Records (ADRs)

## ADR-001: Provider-Independent AI Architecture
- **Status**: Accepted
- **Context**: The `wp-agent` system requires flexibility to support diverse LLM providers (e.g., Gemini, OpenAI, Anthropic, Ollama, open weights) without rewriting domain agents, planning engines, or tool invocations.
- **Decision**: Define a standardized model adapter interface and strict tool contract schema (`model-adapter-and-tool-contracts`). The agent runtime interacts exclusively with the adapter interface, allowing seamless switching and multi-model fallbacks.
- **Consequences**: Adding new LLM providers requires writing only a provider adapter satisfying the standard contract; zero changes to agent reasoning workflows.

---

## ADR-002: LocalWP Toolchain & Development Environment
- **Status**: Accepted
- **Context**: The development workstation uses LocalWP for local WordPress development. Duplicating PHP, Composer, and MySQL installations causes version mismatches and clutter.
- **Decision**: Bind project PHP CLI tooling to the 64-bit PHP 8.2 executable bundled with LocalWP (`lightning-services/php-8.2.29+0/bin/win64/php.exe`), along with LocalWP's bundled Composer 2.8 (`composer.phar`) and WP-CLI (`wp-cli.phar`).
- **Consequences**: Consistent runtime compatibility with test WordPress sites (e.g., `plugin-test.local`), zero redundant global runtime installations, and native Xdebug integration when required.

---

## ADR-003: Security-First Read-Only Foundation
- **Status**: Accepted
- **Context**: Automated agent tools operating on WordPress can cause irreversible data corruption, unauthorized file changes, or broken site states if mutating tools are unleashed without validation.
- **Decision**: The initial foundation is strictly read-only and deny-by-default. The agent may only query site status, inspect file schemas, list post types, and read public documentation. Mutating tools (file editing, database updates, plugin activation) remain locked behind explicit verification guards.
- **Consequences**: Prevents premature or accidental modification of local WordPress test sites and guarantees safe evaluation of agent capabilities.

---

## ADR-004: Monorepo Orchestration with pnpm and Turborepo
- **Status**: Accepted
- **Context**: The repository will contain frontend interfaces, agent orchestration engines, shared schemas, and WordPress companion plugins.
- **Decision**: Structure the project as a pnpm workspace orchestrated by Turborepo (`turbo`), utilizing Corepack for deterministic pnpm version management.
- **Consequences**: Fast cached builds, explicit dependency boundaries, and unified linting and test runs across TypeScript and PHP packages.

---

## ADR-005: Phase 1 Package Boundaries and Dependency Direction
- **Status**: Accepted
- **Context**: Cross-package entanglement and circular dependencies degrade maintainability and break modularity.
- **Decision**: Enforce a unidirectional dependency hierarchy:
  - `@wp-agent/contracts` sits at the foundational layer with zero internal package dependencies.
  - `@wp-agent/model-adapters`, `@wp-agent/audit`, and `@wp-agent/wp-client` depend strictly on `@wp-agent/contracts`.
  - `@wp-agent/config` validates environment variables using Zod without application entanglement.
  - `@wp-agent/agent-core` integrates contracts, model-adapters, audit, and wp-client.
  - `apps/api` depends on config, contracts, and audit.
- **Consequences**: Packages remain decoupled, easily testable in isolation, and independent of specific backend frameworks.

---

## ADR-006: Local WordPress Target Whitelisting & Injectable Transport
- **Status**: Accepted
- **Context**: LLM tools interacting with HTTP endpoints present Server-Side Request Forgery (SSRF) and credential leakage risks if unconstrained.
- **Decision**: Restrict all WordPress REST interactions to approved local development targets (`*.local`, `localhost`, `127.0.0.1`). Block cloud metadata IPs (`169.254.169.254`) and arbitrary public origins. Provide an injectable `HttpTransport` interface to ensure zero real network calls occur during automated unit tests.
- **Consequences**: Secure isolation from production environments, robust protection against SSRF, and reliable in-memory test execution.


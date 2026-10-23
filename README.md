# KPH SitePilot (`wp-agent`)

`KPH SitePilot` is a provider-independent AI WordPress agent monorepo designed with a security-first, read-only foundation before any mutating site-builder operations are enabled.

---

## 1. Project Purpose & Current Scope (Phase 1 & Phase 2A)

The monorepo establishes a security-first, read-only foundation with provider-independent AI orchestration:
- **Provider-Independent Model Adapters**: Standardized interfaces allowing interchangeable AI models (`GeminiModelAdapter`, `MockModelAdapter`, OpenAI, Anthropic, Ollama, and local models).
- **Secure Gemini Provider Integration (Phase 2A)**: Official `@google/genai` SDK integration supporting `gemini-3.8-flash` (configurable via `GEMINI_MODEL`) with bounded input length (32KB cap), timeout handling (30s), error normalization, and zero client-side credential exposure.
- **Server-Side Localhost AI Chat Endpoint**: Minimal, secure `POST /api/chat` endpoint on `apps/api` bound strictly to `127.0.0.1` (localhost only).
- **Deny-by-Default Tool Registry**: Only strictly read-only tools (`site.inspect` and `page.read`) can be executed. Any tool attempting state mutation or unknown invocations is denied and audited.
- **Read-Only Local WordPress REST Client**: Restricts connections exclusively to local test environments (e.g. `*.local`, `localhost`, `127.0.0.1`), strictly mitigating SSRF and external network leakage.
- **Redacted Structured Audit Engine**: Comprehensive audit logging that automatically strips passwords, application passwords, bearer tokens, API keys, and sensitive headers.
- **WordPress Companion Bridge**: Minimal, secure WordPress plugin skeleton (`wp-agent-bridge`) with capability guards (`manage_options`) and zero dynamic code execution endpoints.
- **Dashboard Workspace**: Documented future workspace in `apps/dashboard/` reserved for frontend integration.

---

## 2. Prerequisites

The toolchain is verified on Windows 11 with PowerShell:
- **Node.js**: `v22.23.2` LTS (managed via NVM for Windows)
- **pnpm**: `v12.14.0` (Corepack-managed)
- **LocalWP**: LocalWP `10.1.2` with bundled PHP 8.2 (`php.exe`), Composer 2 (`composer.phar`), and WP-CLI (`wp-cli.phar`)
- **Git**: Git for Windows `2.54.0+`

---

## 3. Installation & Setup

### A. Clone & Install Dependencies
Run in Windows PowerShell:
```powershell
# Verify pnpm is enabled
corepack enable pnpm

# Install monorepo dependencies and link workspace packages
pnpm install
```

### B. Environment Configuration
Copy the template to `.env.local` for local development:
```powershell
Copy-Item .env.example .env.local
```

Configure your credentials in `.env.local`:
```env
# Application Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# WordPress Local Test Target
WP_SITE_URL=http://plugin-test.local

# Google AI Studio / Gemini Integration (Phase 2A)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
```

> [!IMPORTANT]
> - `.env.local` is git-ignored and must NEVER be committed or logged.
> - The API key remains strictly server-side in Node.js processes; browser clients never handle credentials.

---

## 4. Development & Running the Local API

### A. Build the Monorepo
```powershell
# Build all TypeScript packages and applications
pnpm build
```

### B. Start the Local API Server (Terminal 1)
Start the backend API server (bound strictly to `127.0.0.1:3001`):
```powershell
pnpm start:api
```

### C. Start the Lovable-Style Dashboard (Terminal 2)
Start the Next.js web workspace (bound to `http://localhost:3002`):
```powershell
# Development mode:
pnpm dev:dashboard

# Or production build & start:
pnpm start:dashboard
```
Open `http://localhost:3002` in your browser.

### D. Test the Endpoints with PowerShell

**1. Health Check (`GET /health`)**:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3001/health" -Method Get | ConvertTo-Json
```

Expected Response:
```json
{
  "status": "ok",
  "service": "kph-sitepilot-api",
  "version": "0.1.0",
  "timestamp": "2026-10-22T..."
}
```

**2. Local AI Chat Endpoint (`POST /api/chat`)**:
```powershell
$body = @{
    prompt = "Respond with 'Hello from KPH SitePilot'"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/chat" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json
```

**3. Read-Only WordPress Agent Endpoint (`POST /api/agent`)**:
```powershell
$body = @{
    prompt = "Read and summarize sample-page from the local site"
    targetSite = "http://plugin-test.local"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/agent" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 10
```

---

## 5. Testing & Quality Verification

All tasks are orchestrated locally via Turborepo and Vitest:

```powershell
# Run full automated unit test suite (70 tests across 7 packages; 0 quota consumed)
pnpm test

# Typecheck all packages with strict compiler checks
pnpm typecheck

# Run code style & static analysis checks
pnpm lint

# Run the optional live Gemini integration test (executes exactly 1 minimal request)
pnpm test:live

# Run the live WordPress read-only integration test against LocalWP (auto-skips safely if site is stopped)
pnpm test:wp:live

# Or target a specific running site for live integration:
$env:WP_SITE_URL = "http://test.local"; pnpm test:wp:live; Remove-Item Env:WP_SITE_URL

# Run targeted package unit tests
pnpm --filter @wp-agent/agent-core test
pnpm --filter @wp-agent/model-adapters test
pnpm --filter @wp-agent/api test
pnpm --filter @wp-agent/contracts test
pnpm --filter @wp-agent/wp-client test
pnpm --filter @wp-agent/audit test
pnpm --filter @wp-agent/config test

# Validate WordPress companion bridge plugin
php -l wordpress/wp-agent-bridge/wp-agent-bridge.php
php wordpress/wp-agent-bridge/tests/test-plugin.php
```

---

## 6. Repository Structure

## Optional Phase 7 — Supabase SaaS Foundation

The dashboard remains in local mode when `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset. When both are configured, the dashboard
requires a Supabase-authenticated session and exposes signup, login, logout, and
password-reset flows. Do not put service-role, model-provider, vault, or WordPress
secrets in `NEXT_PUBLIC_*` variables.

Database migrations, local Edge Function development, RLS tests, and deployment
prerequisites are documented in [environment-setup.md](./docs/environment-setup.md)
and [deployment-guide.md](./docs/deployment-guide.md). Hosted operations remain
fail-closed until a secure per-connection agent bridge is available; the legacy
local API is never used as a SaaS fallback. See the measured implementation status
in [phase-7-acceptance.md](./docs/phase-7-acceptance.md).

## 7. Repository Structure

```text
wp-agent/
├── AGENTS.md                   # Always-active workspace agent rules
├── package.json                # Monorepo root scripts & devDependencies
├── pnpm-workspace.yaml         # Workspace definition & supply-chain config
├── pnpm-lock.yaml              # Deterministic dependency lockfile
├── turbo.json                  # Turborepo task pipeline
├── tsconfig.base.json          # Shared strict TypeScript configuration
├── .gitignore                  # VCS exclusion rules (.env.local ignored)
├── .env.example                # Safe environment variable template
├── README.md                   # Project documentation & runbooks
├── apps/
│   ├── dashboard/              # Documented future frontend workspace
│   │   └── README.md
│   └── api/                    # Server-side API & /api/chat endpoint
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/index.ts
│       └── tests/
│           ├── health.test.ts
│           └── chat.test.ts
├── packages/
│   ├── contracts/              # Shared types, Zod schemas, structured errors
│   ├── model-adapters/         # GeminiModelAdapter & MockModelAdapter
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── gemini-adapter.ts
│   │   └── tests/
│   │       ├── mock-adapter.test.ts
│   │       ├── gemini-adapter.test.ts
│   │       └── gemini-live.integration.test.ts
│   ├── agent-core/             # Deny-by-default orchestration boundary
│   ├── wp-client/              # Read-only WordPress REST client & SSRF guard
│   ├── audit/                  # Redacted structured audit logger
│   └── config/                 # Validated environment configuration (.env.local)
├── wordpress/
│   └── wp-agent-bridge/        # WordPress companion plugin skeleton
│       ├── wp-agent-bridge.php
│       ├── readme.txt
│       └── tests/test-plugin.php
├── tests/
│   └── README.md               # Tiered testing architecture runbook
└── docs/
    ├── architecture-decisions.md # Architecture Decision Records (ADRs)
    ├── environment-setup.md      # Workstation toolchain audit record
    └── phase-1-acceptance.md     # Phase 1 verification and acceptance checklist
```

---

## 7. Security Guarantees & Next Phase Boundary

- **Server-Side Only**: Gemini API calls occur strictly within Node.js processes. No client-side browser code or public endpoints receive the API key.
- **Deny-by-Default Execution**: Tools are strictly read-only (`site.inspect`, `page.read`). No mutating operations, database modifications, or dynamic file executions exist.
- **Quota & Cost Protection**: Standard unit tests (`pnpm test`) use `MockModelAdapter` with zero live network calls and zero quota consumption. The live integration test (`pnpm test:live`) is explicitly distinguished, runs at most 1 minimal call, and skips safely when unconfigured.
- **Next Phase Boundary**: Phase 2B will introduce tool integration into the agent loop with human authorization checkpoints before any WordPress mutating action is enabled.

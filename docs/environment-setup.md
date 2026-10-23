# Development Environment Setup & Audit Record

**Date**: October 2026  
**Host OS**: Windows 11 64-bit  
**Workspace**: `c:\AI\KPH SitePilot` (`wp-agent`)

---

## 1. Verified Toolchain Inventory

| Tool | Version | Executable Path / Management | Status |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v22.23.2` (LTS) | `C:\nvm4w\nodejs\node.exe` (via NVM for Windows) | Verified |
| **npm** | `10.9.8` | `C:\nvm4w\nodejs\npm.cmd` | Verified |
| **pnpm** | `12.14.0` | Managed via Corepack (`corepack enable pnpm`) | Verified |
| **Git** | `2.54.0.windows.1` | `C:\Program Files\Git\cmd\git.exe` | Verified |
| **PHP CLI** | `8.2.29` (cli, x64) | `C:\Users\india\AppData\Roaming\Local\lightning-services\php-8.2.29+0\bin\win64\php.exe` | Verified |
| **Composer** | `2.8.6` | `C:\Program Files (x86)\Local\resources\extraResources\bin\composer\win32\composer.bat` | Verified |
| **WP-CLI** | `2.12.0` | `C:\Program Files (x86)\Local\resources\extraResources\bin\wp-cli\win32\wp.bat` | Verified |
| **LocalWP** | `10.1.2` | `C:\Program Files (x86)\Local\Local.exe` | Verified |
| **Turborepo** | N/A (scaffold) | To be installed as monorepo root devDependency (`pnpm add -D turbo`) | Pending monorepo init |
| **Docker Desktop** | Not Installed | Docker & Compose not detected; not needed for initial read-only phase | Optional (Audit DB) |

---

## 2. LocalWP Test Environments

The following test sites exist locally under `C:\Users\india\Local Sites`:

| Site Name | Local Domain | Path | PHP | Web Server | MySQL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **plugin-test** | `plugin-test.local` | `~\Local Sites\plugin-test` | 8.2.29 | Nginx 1.26.1 | MySQL 8.4.0 |
| **test** | `test.local` | `~\Local Sites\test` | 8.2.29 | Nginx 1.26.1 | MySQL 8.4.0 |
| **batchdata** | `batchdata.local` | `~\Local Sites\batchdata` | 8.2.29 | Nginx 1.26.1 | MySQL 8.4.0 |
| **batchdata-db-live** | `batchdata-db-live...` | `~\Local Sites\batchdata-db-live-20-aug-2026` | 8.2.29 | Nginx 1.26.1 | MySQL 8.4.0 |
| **fastlayer** | `fastlayer.local` | `~\Local Sites\fastlayer` | 7.4.30 | Nginx 1.26.1 | MySQL 8.4.0 |
| **hd-cover** | `hd-cover.local` | `~\Local Sites\hd-cover` | 8.2.29 | Nginx 1.26.1 | MySQL 8.4.0 |

*Primary Target for agent testing*: `plugin-test.local` (`C:\Users\india\Local Sites\plugin-test`).

---

## 3. Environment Variable Configuration

To allow seamless command execution across all PowerShell shells without duplicate software installations, user environment variables were registered:

1. **User `Path`** updated with:
   - `C:\Users\india\AppData\Roaming\Local\lightning-services\php-8.2.29+0\bin\win64`
   - `C:\Program Files (x86)\Local\resources\extraResources\bin\composer\win32`
   - `C:\Program Files (x86)\Local\resources\extraResources\bin\wp-cli\win32`

2. **User `PHPRC`** configured to:
   - `C:\Users\india\Local Sites\plugin-test\conf\php`
   - Enables standard extensions: `curl`, `mbstring`, `mysqli`, `openssl`, `pdo_mysql`, `zip`, `zlib`, `gd`, and `xdebug`.

---

## 4. Docker / PostgreSQL Audit Persistence (Future Phase)

- **Current Status**: Docker Desktop is not installed on the system.
- **Action for Future Phase**: When PostgreSQL audit persistence is required in later phases, Docker Desktop can be installed via `winget install Docker.DockerDesktop` (requires Windows administrator elevation and WSL 2 virtualization backend). LocalWP's internal MySQL database is kept separate and will not be altered or replaced.

## 5. Optional Supabase SaaS Development (Phase 7)

The existing dashboard and API keep working in local-only mode when the two public
Supabase settings are absent. To exercise hosted-mode login, configure these
placeholders in `.env.local` with values from a Supabase project you are authorized
to use:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public-anon-key>
NEXT_PUBLIC_SITE_URL=http://localhost:3002
```

The anon key is intentionally public; never configure a service-role key, WordPress
application password, vault key, Gemini key, or OpenRouter key under `NEXT_PUBLIC_*`.
Signup uses Supabase email confirmation. Configure the local dashboard URL and
`/auth/confirm` callback in the project's Auth URL allow-list before testing signup
or password recovery.

### Local database and Edge Functions

Supabase CLI and Docker are prerequisites for a local Supabase stack. If available:

```powershell
supabase start
supabase migration up
supabase test db
supabase functions serve --env-file supabase/.env.local
```

Set local-only Edge Function secrets in the ignored `supabase/.env.local` file.
The vault key must decode from 64-character hex or base64 to exactly 32 random
bytes. `SUPABASE_SERVICE_ROLE_KEY` and `VAULT_MASTER_KEY` are Edge Function secrets;
never add them to dashboard environment variables or commit them. The credential
vault encrypts WordPress application credentials using AES-256-GCM with a random
96-bit IV and connection-bound associated data. Only non-secret connection
metadata is returned; there is no API to decrypt credentials into a browser.

The database test in `supabase/tests/database/rls.test.sql` exercises cross-tenant
project/connection visibility and verifies that users cannot read encrypted
credentials or forge proposals, usage, or rate-limit data. Run `supabase test db`
before using any hosted Supabase project. This workspace has not run that test
because Docker and Supabase CLI are unavailable.

The dashboard's legacy `/api/*` proxies are denied in configured SaaS mode after
authentication; they cannot fall back to the shared local API. The `agent-proxy`
Edge Function validates identity, project and connection ownership, request bounds,
read-only mode, and rate limits, but deliberately returns
`AGENT_BRIDGE_NOT_CONFIGURED` until a per-connection bridge can keep WordPress
credentials separate from model-provider requests. No real WordPress operation is
performed by this foundation.

# Development Environment Setup & Audit Record

**Date**: October 2026  
**Host OS**: Windows 10 Pro 64-bit (build 19045)
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
| **Docker Desktop** | `4.96.3` | Installed via winget; engine is not running because firmware virtualization is disabled | Blocked (Local Supabase) |

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

- **Current Status**: Docker Desktop `4.96.3` and Docker CLI `29.9.2` are installed. The Docker service is stopped and the engine pipe is unavailable. This host reports Intel firmware virtualization disabled; the Docker CLI was also absent from the current VS Code process `PATH` (it was discoverable after adding its installed directory for a one-off check).
- **Next Action**: Enable Intel VT-x in BIOS/UEFI, enable/update WSL 2 and `VirtualMachinePlatform` with administrator privileges, and restart Windows. Reopen VS Code so its process inherits the updated Docker `PATH`, start Docker Desktop, and verify `docker info` before starting the isolated Supabase stack. Do not reinstall Docker Desktop unless a later diagnostic shows the installation is damaged. LocalWP's internal MySQL database is separate and must not be altered or replaced.

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

To keep Supabase authentication configured but store chat history only in this
browser's local storage, set `NEXT_PUBLIC_CHAT_HISTORY_MODE=local` in the dashboard
environment and restart the dashboard. This disables the remote chat-history
endpoint for the dashboard; it does not change the authentication settings or
delete history already stored in Supabase.

### Local database and Edge Functions

Supabase CLI and Docker are prerequisites for a local Supabase stack. If available:

```powershell
pnpm dlx supabase@2.122.0 start
pnpm dlx supabase@2.122.0 migration up --local
pnpm dlx supabase@2.122.0 test db --local
pnpm dlx supabase@2.122.0 functions serve --env-file supabase/.env.local
```

Set local-only Edge Function secrets in the ignored `supabase/.env.local` file.
The vault key must decode from 64-character hex or base64 to exactly 32 random
bytes. `SUPABASE_SERVICE_ROLE_KEY` and `VAULT_MASTER_KEY` are Edge Function secrets;
never add them to dashboard environment variables or commit them. The credential
vault encrypts WordPress application credentials using AES-256-GCM with a random
96-bit IV and connection-bound associated data. Only non-secret connection
metadata is returned; there is no API to decrypt credentials into a browser.

The database test in `supabase/tests/database/rls.test.sql` exercises cross-tenant
project, connection, and chat-history visibility and verifies that users cannot
read encrypted credentials or forge proposals, usage, or rate-limit data. Run
`supabase test db` against the local stack before using any hosted Supabase
project. The CLI was verified through `pnpm dlx supabase@2.122.0`. To run these
checks without configuring Docker on a developer PC, push a change to the
workflow, a Supabase migration, or a database test to `main`, or open the
repository's **Actions** tab, select **Local Supabase Database Tests**, and
choose **Run workflow**. The workflow starts the repository's isolated local
stack on a GitHub-hosted runner, applies migrations, runs database/RLS tests,
and stops the stack. It does not use Supabase project secrets or connect to a
hosted Supabase database. The test passed all 14 pgTAP assertions in GitHub
Actions workflow run
[40459112930](https://github.com/kanhajatthap/KPH-SitePilot/actions/runs/40459112930),
including migration application and stack cleanup. The developer PC does not
need Docker for this verification path.

The follow-up migration that changes single-thread history into a bounded
conversation archive is still under development and has not yet been applied or
tested by the GitHub workflow.

The dashboard's legacy `/api/*` proxies are denied in configured SaaS mode after
authentication; they cannot fall back to the shared local API. The `agent-proxy`
Edge Function validates identity, project and connection ownership, request bounds,
read-only mode, and rate limits, but deliberately returns
`AGENT_BRIDGE_NOT_CONFIGURED` until a per-connection bridge can keep WordPress
credentials separate from model-provider requests. No real WordPress operation is
performed by this foundation.

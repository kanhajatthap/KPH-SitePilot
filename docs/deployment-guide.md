# KPH SitePilot — Production Deployment Guide

This guide details the deployment procedures, environment variables, security configurations, and operational runbooks for hosting KPH SitePilot across production, staging, and local environments.

---

## 1. System Architecture Overview

```text
  [ Client Browser ]
         │ (HTTPS / TLS 1.3)
         ▼
  [ Reverse Proxy / CDN (Cloudflare / Nginx / Caddy) ]
   ├── /               ──> [ Dashboard (Next.js 15 SSR/Static) - Port 3000 ]
   ├── /api/proxy/*    ──> [ Supabase Edge Functions (Deno Runtime) ]
   └── /api/*          ──> [ KPH SitePilot Backend API (Node.js 22 LTS) - Port 3001 ]
                                 │
                                 ├──> Google Gemini 1.5 / 2.0 / Flash (LLM Provider)
                                 └──> WordPress Target (REST API over HTTPS)
```

---

## 2. Environment Variables Matrix

| Variable | Target Service | Secret? | Default / Example | Purpose |
|---|---|---|---|---|
| `PORT` | API | No | `3001` | HTTP listening port for backend API |
| `NODE_ENV` | API & Dashboard | No | `production` | Node execution environment |
| `WP_SITE_URL` | API | No | `http://plugin-test.local` | Target WordPress base URL |
| `WP_APPLICATION_USERNAME` | API | Yes | `admin` | WordPress Application Password username |
| `WP_APPLICATION_PASSWORD` | API | Yes | `**** **** **** ****` | WordPress Application Password credentials |
| `GEMINI_API_KEY` | API | Yes | `AIzaSy...` | Google Gemini API key for model orchestration |
| `GEMINI_MODEL` | API | No | `gemini-3.8-flash` | Selected Gemini model |
| `VAULT_MASTER_KEY` | Edge Functions only | Yes | 32-byte hex/base64 placeholder | AES-256-GCM master key for encrypted WordPress credentials |
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard | No | `https://[ref].supabase.co` | Supabase API endpoint URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard | Public | `<public anon key>` | Supabase Auth session and RLS client |
| `SUPABASE_URL` | Edge Functions only | No | `https://[ref].supabase.co` | Supabase API endpoint URL |
| `SUPABASE_ANON_KEY` | Edge Functions only | Public | `<public anon key>` | Verifies caller session with Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Yes | `eyJhb...` | Administrative key for privileged edge operations |

> [!CAUTION]
> Never store plain credentials in git, Dockerfiles, or browser-accessible client bundles. All production secrets must be injected via secure secret managers (e.g. AWS Secrets Manager, Doppler, GCP Secret Manager, or Vercel Environment Variables).

---

## 3. Component Deployment Procedures

### 3.1 Backend API (`apps/api`)

#### Option A: Docker Container
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
COPY --from=builder /app .
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
```

Build and run:
```bash
docker build -t kph-sitepilot-api:latest .
docker run -d \
  --name kph-sitepilot-api \
  -p 127.0.0.1:3001:3001 \
  --env-file .env.production \
  --restart unless-stopped \
  kph-sitepilot-api:latest
```

#### Option B: Systemd Service (Linux VM)
Create `/etc/systemd/system/sitepilot-api.service`:
```ini
[Unit]
Description=KPH SitePilot Backend API
After=network.target

[Service]
Type=simple
User=sitepilot
WorkingDirectory=/opt/kph-sitepilot
EnvironmentFile=/opt/kph-sitepilot/.env.production
ExecStart=/usr/bin/node /opt/kph-sitepilot/apps/api/dist/index.js
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sitepilot-api
sudo systemctl status sitepilot-api
```

---

### 3.2 Dashboard (`apps/dashboard`)

#### Vercel Deployment
1. Set Root Directory to `apps/dashboard`.
2. Framework Preset: Next.js.
3. Build Command: `pnpm build`.
4. Output Directory: `.next`.
5. Configure Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `AGENT_API_URL`.

#### Self-Hosted Node.js Server
```bash
cd apps/dashboard
pnpm build
PORT=3000 node .next/standalone/server.js
```

---

### 3.3 Supabase Edge Functions & Database Migrations

This repository's Phase 7 migrations and Edge Functions are version controlled.
Local development requires Supabase CLI and Docker. Configure the dashboard's
public URL/anon key separately from Edge Function secrets. Use the local CLI and
the Supabase Auth redirect allow-list before testing signup/recovery. RLS tests:

```powershell
supabase start
supabase migration up
supabase test db
supabase functions serve --env-file supabase/.env.local
```

The Edge Function environment requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `VAULT_MASTER_KEY`, and `DASHBOARD_ORIGIN`. Store these
with the Supabase CLI secret manager or an approved secret manager; never in the
dashboard bundle. Keep the vault key backed up and restrict access because its loss
makes stored WordPress credentials unrecoverable.

Hosted deployment must be separately authorized. Do not run `supabase link`,
`supabase db push`, `supabase functions deploy`, or purchase a hosted plan as part
of local development. Before any authorized deployment, run the RLS integration
tests and review the migration and Edge Function changes. The agent Edge Function
intentionally fails closed until the per-connection agent bridge is implemented;
the legacy local API is not a SaaS fallback.

#### Database Migrations
Deploy SQL schema and RLS policies using Supabase CLI:
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

#### Edge Functions Deployment
Set the credentials vault master key and deploy functions:
```bash
supabase secrets set VAULT_MASTER_KEY="your-256-bit-hex-master-key"
supabase secrets set AGENT_UPSTREAM_API_URL="https://api.yourdomain.com/api/chat"

supabase functions deploy credentials-vault
supabase functions deploy agent-proxy
```

---

## 4. Production Reverse Proxy Configuration (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name sitepilot.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/sitepilot.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sitepilot.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:;" always;

    # Dashboard Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API Routes
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for streaming LLM responses
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

---

## 5. Health Monitoring & Alerting

- **Liveness & Readiness**: Query `GET https://api.yourdomain.com/health` every 30 seconds.
- **Expected Response**:
  ```json
  {
    "status": "ok",
    "service": "kph-sitepilot-api",
    "version": "0.1.0",
    "timestamp": "2026-10-22T08:35:00.000Z"
  }
  ```
- **Alert Conditions**:
  - HTTP status != 200 for 2 consecutive checks.
  - Response time > 3000ms.
  - Process restart count > 3 in 15 minutes.

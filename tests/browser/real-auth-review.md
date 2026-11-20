# Real-auth review acceptance (UNRUN in this sandbox)

This runner uses actual dashboard login/server actions, local Supabase Auth,
PostgREST, RLS and signed connector HTTP ingestion. It does not stub auth or API
responses. One test forwards the actual review POST and deliberately drops its
response to test reconciliation. It creates two random users/project/site and
cleans up only those generated IDs. Do not use it against shared or production data.

Prerequisites on an isolated Docker host:
1. Start local Supabase and apply repository migrations locally (see database CI).
2. Provision a private environment file from **local** Supabase status. Do not print
   or commit keys. Set NEXT_PUBLIC_SUPABASE_URL to its loopback HTTP URL,
   NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and a newly generated
   32-byte hex SITEPILOT_ENCRYPTION_KEY. No production credentials.
3. Build/start the dashboard with that environment. The runner and dashboard must
   share the same local config. Clear demo-account variables. Use loopback URL for
   these tests; production secure-cookie hosting requires separate HTTPS acceptance.
4. Install the external browser runtime and run:
   ```sh
   npm install --prefix /tmp/review-browser --ignore-scripts --no-audit --no-fund playwright-core@1.65.1 @sparticuz/chromium@153.0.0
   DISPOSABLE_AUTH_TEST=1 node tests/browser/real-auth-review.mjs /tmp/review-browser/node_modules http://127.0.0.1:3002
   ```

The runner rejects non-loopback URLs. Local URLs alone do not prove a database is
disposable: operator must use a new local stack. No dashboard service is started or
reconfigured by the runner. No tokens, cookies, passwords or source payloads are
logged. Avoid debug request tracing and screenshots of secret-bearing setup.

Coverage implemented: owner/non-owner login and source isolation, signed ingest
and nonce replay, concurrent authenticated tabs, dropped real POST response,
receipt reconciliation, revocation after opening, lost cookies, and no dispatch.
Not covered by this runner: timed JWT expiry/refresh rotation, TLS production
cookies, slow backend under load, hosting outage, WordPress admin authentication.
These remain separate acceptance gates. Syntax checking is not execution evidence.

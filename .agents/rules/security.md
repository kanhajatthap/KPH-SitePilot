---
name: security-protocols
description: Mandatory security standards for the hosted product phase — production writes with gating, connector-only transport, no arbitrary code, deny-by-default, secrets zero-tolerance.
trigger: always_on
phase: product-phase
---

# Security Rules

## 1. Secrets & Credentials Zero-Tolerance
- Never hardcode, commit, print or log credentials, API keys, service-role keys, encryption keys, auth salts, site tokens/secrets, pairing codes, bearer tokens or signed URLs.
- Use environment variables via `.env.local` or OS-level secret stores. `.env` files containing secrets must be listed in `.gitignore`.
- Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `SITEPILOT_ENCRYPTION_KEY`, `PAIRING_PEPPER`, `CRON_SECRET`, `RESEND_API_KEY`. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be client-visible.
- BYOK keys are encrypted at rest, decrypted only in the model call path, never returned and never re-displayed.
- Error copy is secret-safe: one typed code + one next action, never stack frames or key material.
- Sanitize terminal output and log files before displaying or summarizing.

## 2. Environment Isolation & Target Boundaries (product phase, plan §8.2)
- **Production sites are allowed** — the earlier blanket production ban is retired — but only when the site is explicitly registered as `environment: production`, paired with a single-use code, and owned by the authenticated caller.
- LocalWP instances remain a valid local development target; they are no longer the only permitted target.
- Ownership is proven owner-side: RLS on every table, the `site_metadata` security-barrier view, and an ownership check in every handler. Unknown/unauthorised targets fail closed with 400/401/403/404.
- Never bypass TLS certificate validation (`--insecure`, `curl -k`, `NODE_TLS_REJECT_UNAUTHORIZED=0` are strictly forbidden).
- The service-role client is server-only and confined to connector paths.

## 3. Deny-by-Default Tool Execution & Approval
- Every mutating action requires an approved, immutable, SHA-256-hashed plan. Editing a plan invalidates its hash so an old approval cannot be replayed.
- Default write mode is **draft / private**; `content.publish` is an explicit **R2** tool. **R2** needs the typed word `CONFIRM`; **R3** needs a fresh snapshot plus the plan-id confirmation.
- The risk floor from `WP_TOOL_SPECS` can only be raised by the model planner, never lowered.
- Every non-read tool takes a before **snapshot**, applies the write, then performs a **read-back verification** (reads the same resource again). A failed verification is reported as unverified, never as success; one-click **undo** restores the snapshot through the same signed queue.
- Tool arguments must pass strict Zod schema validation, the connector allowlist, and the site's scopes/capability graph before execution.

## 4. The connector is the only WordPress transport; no arbitrary code
- **The connector is the only WordPress transport.** All site interaction goes through the signed job queue (HMAC-SHA256 + nonce + ±300 s timestamp, per-site secret, lease and job state machine) and the plugin's allowlist.
- **No arbitrary code**: never execute user-supplied PHP, SQL, shell, WP-CLI, file edits, plugin uploads or code injection on a site. No runtime tool invention — unknown tool names are refused.
- Site content is untrusted input: wrap it, never let it create tools, raise privileges or lower a risk floor.
- The cloud never fetches arbitrary site URLs; only paired-site, signed paths are allowed (SSRF control). Cloud metadata endpoints stay blocked.
- Per-site secrets are encrypted at rest, decrypted per request, and rotatable; revocation and pause are honoured before any job is issued.

## 5. WordPress Defensive Coding Mandates
- **Input Sanitization**: Sanitize all incoming user and external input (`sanitize_text_field()`, `sanitize_key()`, `absint()`).
- **Output Escaping**: Escape late at point of output (`esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses_post()`).
- **Authorization & Nonces**: Verify capabilities (`current_user_can()`) and validate nonces (`wp_verify_nonce()` or `check_ajax_referer()`) on every endpoint.
- **Direct Access Prevention**: Every PHP file must begin with `defined( 'ABSPATH' ) || exit;`.
- **Database Safety**: Always use `$wpdb->prepare()` for dynamic queries. Never concatenate SQL strings.

## 6. Script, Dependency & CI Safety
- Do not execute uninspected remote scripts or install unverified packages; review licenses, integrity and changelogs before adding dependencies.
- `pnpm lint` runs the PHP parser, Edge typecheck and `scripts/governance-audit.mjs`; CI adds `pnpm audit --prod`, a real PHP 8.2 connector job and `supabase test db --local` on migration changes.
- Never commit `.env` files; the CI secret-leak check enforces this.

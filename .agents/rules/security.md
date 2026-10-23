---
name: security-protocols
description: Mandatory security standards covering credential handling, local-only execution, deny-by-default policies, and WordPress defense-in-depth.
trigger: always_on
---

# Security Rules

## 1. Secrets & Credentials Zero-Tolerance
- Never hardcode, commit, print, or log credentials, API keys, database passwords, auth salts, or bearer tokens.
- Use environment variables via `.env.local` or OS-level secret stores. `.env` files containing secrets must be listed in `.gitignore`.
- Sanitize terminal command outputs and log files before displaying or summarizing.

## 2. Environment Isolation & Target Boundaries
- Never point tooling, CLI calls, or agent bridges to production or staging WordPress environments.
- Permitted target environments are strictly limited to local, non-sensitive LocalWP instances (e.g., `plugin-test.local`).
- Do not bypass TLS certificate validation (`--insecure`, `curl -k`, or `NODE_TLS_REJECT_UNAUTHORIZED=0` are strictly forbidden).

## 3. Deny-by-Default Tool Execution
- Any tool invocation that can mutate local state, write files, alter WordPress options, run SQL queries, or invoke WP-CLI mutation commands (`wp plugin install`, `wp option update`, `wp db query`) requires explicit pre-flight validation.
- Tool arguments must undergo strict schema validation and parameter type-checking prior to execution.

## 4. WordPress Defensive Coding Mandates
- **Input Sanitization**: Sanitize all incoming user and external input (`sanitize_text_field()`, `sanitize_key()`, `absint()`).
- **Output Escaping**: Escape late at point of output (`esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses_post()`).
- **Authorization & Nonces**: Verify capabilities (`current_user_can()`) and validate nonces (`wp_verify_nonce()` or `check_ajax_referer()`) on every endpoint.
- **Direct Access Prevention**: Every PHP file must begin with `defined( 'ABSPATH' ) || exit;`.
- **Database Safety**: Always use `$wpdb->prepare()` for dynamic queries. Never concatenate SQL strings.

## 5. Script & Dependency Safety
- Do not execute uninspected remote scripts or install unverified packages.
- Review licenses, package integrity, and changelogs before adding dependencies.

---
name: safe-code-review-and-release
description: >-
  Provides comprehensive pre-release checklists, security audits, WordPress.org compliance rules,
  and packaging procedures. Use when reviewing pull requests, preparing releases, or packaging plugins for distribution.
---

# Safe Code Review and Release

This skill governs the quality gate, security audit, and packaging process for WordPress plugins and packages following the [WordPress.org Plugin Guidelines](https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/).

## Pre-Release Verification Checklist

Every pull request or release tag must pass this multi-stage gate:

### 1. Security & Secrets Audit
- [ ] No hardcoded passwords, API keys, tokens, or local site paths.
- [ ] All inputs sanitized with appropriate `sanitize_*()` functions.
- [ ] All outputs escaped late with `esc_html()`, `esc_attr()`, `esc_url()`, or `wp_kses_post()`.
- [ ] Direct file access blocked with `defined( 'ABSPATH' ) || exit;`.
- [ ] Capabilities verified (`current_user_can()`) and nonces checked for all state mutations.
- [ ] Prepared SQL statements (`$wpdb->prepare()`) used exclusively.

### 2. Code Quality & Standards
- [ ] PHP CodeSniffer passes with WordPress Coding Standards (`composer lint`).
- [ ] PHPStan / Psalm passes at level 8 (`composer phpstan`).
- [ ] TypeScript compilation passes with zero errors (`pnpm typecheck`).
- [ ] ESLint passes with zero warnings (`pnpm lint`).

### 3. Automated Test Evidence
- [ ] Unit tests pass with 100% success (`composer test:unit` and `pnpm test:unit`).
- [ ] Integration tests pass in isolated test environment (`composer test:integration`).
- [ ] All execution commands and terminal outputs recorded.

### 4. WordPress.org Guidelines Compliance
- [ ] Valid GPLv2 or later compatible license declared.
- [ ] Standard `readme.txt` validated against WordPress.org specifications.
- [ ] No remote code execution (`eval()`, unvetted remote scripts).
- [ ] No hijacking of WordPress admin menus or misleading notifications.

## Release Packaging & Asset Exclusion

When generating production distribution ZIP files, strictly exclude development files:

```powershell
# Excluded patterns for production zip:
# - .git/ and .github/
# - tests/ and phpunit.xml
# - node_modules/ and composer.lock (dev deps)
# - .env, .env.*
# - phpcs.xml.dist, phpstan.neon.dist, tsconfig.json
# - package.json, pnpm-lock.yaml (if purely build tooling)
```

## Evidence & Sign-Off Reporting

A release sign-off report must enumerate:
1. Git commit hash and release tag.
2. Verified test execution logs.
3. Static analysis summary.
4. Changed files manifest.
5. Known limitations or required manual actions.

## Official References

- [Detailed WordPress.org Plugin Guidelines](https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/)
- [WordPress Plugin Readme Validator](https://wordpress.org/plugins/developers/readme-validator/)
- [Semantic Versioning 2.0.0](https://semver.org/)

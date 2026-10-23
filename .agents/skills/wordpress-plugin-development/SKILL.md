---
name: wordpress-plugin-development
description: >-
  Provides guidelines, file structures, lifecycle hooks, and architectural standards for developing modern,
  secure WordPress plugins. Use when creating, modifying, or refactoring WordPress plugins, registering hooks,
  or implementing admin settings.
---

# WordPress Plugin Development

This skill defines standards for authoring production-grade WordPress plugins following the [WordPress Plugin Developer Handbook](https://developer.wordpress.org/plugins/).

## Architecture & Directory Layout

Structure plugins cleanly with separation of concerns:

```text
wp-content/plugins/<plugin-slug>/
├── <plugin-slug>.php        # Main entrypoint with plugin header
├── uninstall.php            # Dedicated cleanup when deleted
├── composer.json            # PSR-4 autoloading and dependencies
├── src/                     # Namespaced PHP classes
│   ├── Plugin.php           # Service container / bootstrap
│   ├── Admin/               # Admin pages, notices, settings
│   ├── Api/                 # REST API endpoints & controllers
│   └── Integrations/        # Third-party integrations
├── templates/               # Presentation markup (PHP)
├── assets/                  # Compiled JS, CSS, and images
└── tests/                   # Pest / PHPUnit test suites
```

## Mandatory Plugin Header

Every plugin entry file must start with:

```php
<?php
/**
 * Plugin Name:       WP Agent Bridge
 * Plugin URI:        https://github.com/wp-agent/bridge
 * Description:       Secure read-only companion bridge for WP Agent.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.2
 * Author:            WP Agent Team
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-agent-bridge
 */

defined( 'ABSPATH' ) || exit;
```

## Lifecycle Management

1. **Activation (`register_activation_hook`)**:
   - Check minimum PHP and WordPress versions.
   - Set up default options if not already present.
   - Do **not** execute heavy data migrations inside activation.
2. **Deactivation (`register_deactivation_hook`)**:
   - Clear scheduled cron jobs (`wp_clear_scheduled_hook`).
   - Flush rewrite rules only if custom post types/endpoints were registered.
   - Never drop database tables or delete options on deactivation.
3. **Uninstall (`uninstall.php`)**:
   - Verify `defined( 'WP_UNINSTALL_PLUGIN' )` before execution.
   - Delete plugin options, custom tables, and transients.

## Hook Registration Best Practices

- Use object-oriented hook registration inside a service container or main bootstrap class:
  ```php
  add_action( 'init', [ $this, 'register_post_types' ] );
  add_filter( 'the_content', [ $this, 'filter_content' ], 10, 1 );
  ```
- Use single responsibility: each class should register and manage its own hooks.
- Never declare global functions unless acting as a backwards-compatibility wrapper.

## Official References

- [WordPress Plugin Handbook](https://developer.wordpress.org/plugins/)
- [Plugin Header Requirements](https://developer.wordpress.org/plugins/plugin-basics/header-requirements/)
- [Settings API](https://developer.wordpress.org/plugins/settings/settings-api/)

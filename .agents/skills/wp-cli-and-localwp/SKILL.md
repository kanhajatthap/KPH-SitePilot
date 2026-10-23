---
name: wp-cli-and-localwp
description: >-
  Provides runbooks, commands, and environment flags for interacting with LocalWP sites and executing WP-CLI
  commands on Windows. Use when inspecting local WordPress sites, listing plugins/themes, querying options, or debugging LocalWP services.
---

# WP-CLI and LocalWP Workflows

This skill provides operational procedures for interacting with LocalWP instances using WP-CLI on Windows following the [WP-CLI Command Reference](https://developer.wordpress.org/cli/commands/).

## LocalWP Toolchain & Environment

When executing WP-CLI commands against a LocalWP site:

```powershell
# Set environment variables for the site
$env:PHPRC = "C:\Users\india\Local Sites\plugin-test\conf\php"
$env:WP_CLI_DISABLE_AUTO_CHECK_UPDATE = "1"
$sitePath = "C:\Users\india\Local Sites\plugin-test\app\public"
```

## Read-Only Inspection Commands (Allowed)

Always format outputs as JSON or tabular data for clean, token-efficient parsing:

```powershell
# Check WordPress version and status
wp core version --path=$sitePath

# List all installed plugins with status and update availability
wp plugin list --path=$sitePath --format=json

# List active themes
wp theme list --path=$sitePath --status=active --format=json

# Check specific site options without printing secrets
wp option get blogname --path=$sitePath
wp option get siteurl --path=$sitePath

# Inspect registered post types
wp post-type list --path=$sitePath --format=table

# Inspect REST routes
wp rest route list --path=$sitePath --format=table
```

## Deny-by-Default Mutating Commands (Guarded)

The following commands modify site state and **require explicit authorization** during early phases:
- `wp plugin install / activate / deactivate / delete`
- `wp theme install / activate`
- `wp core update`
- `wp db query / import / reset`
- `wp option update / delete`

## LocalWP Directory Architecture Reference

```text
C:\Users\india\Local Sites\<site-name>/
├── app/
│   ├── public/          # WordPress root (wp-config.php, wp-content)
│   └── sql/             # Local database dumps
├── conf/                # Active service configs
│   ├── nginx/           # site.conf.hbs, nginx.conf.hbs
│   ├── php/             # php.ini, php-fpm.conf
│   └── mysql/           # my.cnf.hbs
└── logs/                # Real-time service logs
    ├── nginx/error.log
    ├── php/error.log
    └── mysql/error.log
```

## Official References

- [WP-CLI Command Reference](https://developer.wordpress.org/cli/commands/)
- [WP-CLI Configuration](https://developer.wordpress.org/cli/commands/config/)
- [LocalWP Documentation](https://localwp.com/help-docs/)

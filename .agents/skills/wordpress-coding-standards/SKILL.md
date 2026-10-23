---
name: wordpress-coding-standards
description: >-
  Enforces WordPress Coding Standards (WPCS), PHP CodeSniffer configuration, PHP 8.2+ modern syntax conventions,
  naming standards, and automated linting. Use when formatting, linting, or reviewing PHP code in WordPress projects.
---

# WordPress Coding Standards (WPCS)

This skill outlines syntax rules, automated linting, and style conventions adhering to the [WordPress PHP Coding Standards](https://developer.wordpress.org/coding-standards/wordpress-coding-standards/php/).

## Core PHP Style Rules

1. **PHP Opening Tags**: Always use `<?php`. Never use short tags `<?`.
2. **Indentation**: Real tabs for indentation; spaces for mid-line alignment.
3. **Space Inside Parentheses**: Put spaces inside parentheses for all control structures and function calls:
   ```php
   if ( $user_id > 0 ) {
       process_user( $user_id, true );
   }
   ```
4. **Yoda Conditions**: When comparing variables against constants or literals, put the literal on the left:
   ```php
   if ( true === $is_active ) { /* ... */ }
   if ( null !== $post_object ) { /* ... */ }
   ```
5. **Naming Conventions**:
   - **Functions & Methods**: lowercase snake_case (`wp_agent_get_status()`).
   - **Classes & Traits**: PascalCase / CamelCaps (`SiteInfoController`).
   - **Constants**: UPPERCASE_SNAKE_CASE (`WP_AGENT_VERSION`).
   - **Files**: Lowercase hyphenated (`class-site-info-controller.php` or PSR-4 `SiteInfoController.php`).

## Modern PHP 8.2+ Compatibility

While following WPCS, leverage modern PHP features:
- Strict return types (`public function get_id(): int`)
- Typed class properties (`protected string $namespace;`)
- Union and intersection types (`string|int`, `Countable&Traversable`)
- Named arguments (use with care where API signatures are stable)
- Readonly properties and enums where supported

## `phpcs.xml.dist` Configuration

Example standard ruleset for WordPress packages:

```xml
<?xml version="1.0"?>
<ruleset name="WPAgentCodingStandards">
    <description>WP Agent WordPress Coding Standards Ruleset</description>

    <file>./src</file>
    <file>./tests</file>

    <arg name="extensions" value="php"/>
    <arg name="colors"/>
    <arg value="sp"/>

    <rule ref="WordPress-Core"/>
    <rule ref="WordPress-Docs"/>
    <rule ref="WordPress-Extra"/>

    <!-- Allow modern PSR-4 class filenames -->
    <rule ref="WordPress.Files.FileName">
        <properties>
            <property name="strict_class_file_names" value="false"/>
        </properties>
    </rule>

    <!-- Configure minimum PHP support -->
    <config name="testVersion" value="8.2-"/>
    <rule ref="PHPCompatibilityWP"/>
</ruleset>
```

## Running Linting

```powershell
# Run code sniffer
composer lint

# Automatically fix violations
composer format
```

## Official References

- [WordPress PHP Coding Standards](https://developer.wordpress.org/coding-standards/wordpress-coding-standards/php/)
- [WordPress-Coding-Standards (WPCS) on GitHub](https://github.com/WordPress/WordPress-Coding-Standards)
- [PHPCompatibilityWP](https://github.com/PHPCompatibility/PHPCompatibilityWP)

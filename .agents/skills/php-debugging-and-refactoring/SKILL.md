---
name: php-debugging-and-refactoring
description: >-
  Provides runbooks for Xdebug 3 setup, WordPress debug log analysis, PHPStan static analysis,
  and clean architecture refactoring for PHP 8.2+. Use when diagnosing PHP runtime errors, analyzing stack traces,
  or modernizing legacy WordPress code.
---

# PHP Debugging and Refactoring

This skill guides diagnosing errors and refactoring WordPress PHP code adhering to [PHPStan Documentation](https://phpstan.org/) and modern PHP standards.

## WordPress Debug Configuration

Enable logging in `wp-config.php` while keeping errors suppressed from public responses:

```php
// Enable WP_DEBUG mode
define( 'WP_DEBUG', true );

// Write errors to /wp-content/debug.log
define( 'WP_DEBUG_LOG', true );

// Prevent displaying errors on screen
define( 'WP_DEBUG_DISPLAY', false );
@ini_set( 'display_errors', '0' );

// Save database queries for performance analysis
define( 'SAVEQUERIES', true );
```

## LocalWP PHP Logs Inspection

Read real-time error logs efficiently without loading entire files:

```powershell
# View the last 30 lines of LocalWP PHP error log
Get-Content -Path "C:\Users\india\Local Sites\plugin-test\logs\php\error.log" -Tail 30

# Inspect WordPress debug.log if generated
Get-Content -Path "C:\Users\india\Local Sites\plugin-test\app\public\wp-content\debug.log" -Tail 30 -ErrorAction SilentlyContinue
```

## PHPStan Static Analysis

Use PHPStan configured with WordPress stubs (`szepeviktor/phpstan-wordpress`):

```neon
# phpstan.neon.dist
parameters:
    level: 8
    paths:
        - src/
    excludePaths:
        - vendor/
    checkMissingIterableValueType: false
    checkGenericClassInNonGenericObjectType: false
```

Run static analysis:
```powershell
composer phpstan
```

## PHP 8.2+ Refactoring Checklist

1. **Dynamic Properties Deprecation**:
   - In PHP 8.2+, assigning to undeclared properties is deprecated.
   - Refactor: Declare all properties explicitly on the class or implement getter/setter maps.
2. **Nullable Types**:
   - Explicitly declare nullable parameters: `?string $param = null` instead of implicit `string $param = null`.
3. **String Interpolation**:
   - Replace `${var}` with `{$var}` or `"$var"`.
4. **Decouple from Global State**:
   - Replace direct references to `$wpdb`, `$post`, `$current_user` with injected dependencies or dedicated service wrappers.

## Official References

- [Debugging in WordPress](https://developer.wordpress.org/advanced-administration/debug/debug-wordpress/)
- [PHPStan Documentation](https://phpstan.org/)
- [PHP 8.2 Migration Guide](https://www.php.net/manual/en/migration82.php)

---
name: wordpress-testing
description: >-
  Covers unit testing, integration testing, and mocking for WordPress PHP plugins and themes using PHPUnit,
  Pest PHP, and Brain Monkey. Use when writing, running, or debugging WordPress tests.
---

# WordPress Testing

This skill provides testing patterns for WordPress packages, separating fast in-memory unit tests from full integration tests following the [WordPress Automated Testing Guide](https://developer.wordpress.org/advanced-administration/wordpress/testing/automated-testing/).

## Testing Strategy Pyramid

1. **Unit Tests (Fast, Isolated)**:
   - Run without loading the full WordPress database or core files.
   - Use **Brain Monkey** or **Mockery** to mock core functions (`add_action`, `get_option`, `apply_filters`).
   - Run in milliseconds on every change.
2. **Integration Tests (Full WordPress Lifecycle)**:
   - Run against a designated local test database (`wptests_`).
   - Extend `WP_UnitTestCase` to test real hooks, database queries, and REST routes.
   - Utilize transactional rollbacks to preserve database state.

## Unit Testing with Brain Monkey

```php
use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;

class SiteInfoTest extends TestCase {
    protected function setUp(): void {
        parent::setUp();
        Monkey\setUp();
    }

    protected function tearDown(): void {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_it_formats_site_status(): void {
        Functions\expect( 'get_bloginfo' )
            ->once()
            ->with( 'version' )
            ->andReturn( '6.7' );

        $version = get_bloginfo( 'version' );
        $this->assertSame( '6.7', $version );
    }
}
```

## Integration Testing with `WP_UnitTestCase`

```php
class RestApiEndpointTest extends WP_UnitTestCase {
    protected $server;

    public function setUp(): void {
        parent::setUp();
        global $wp_rest_server;
        $this->server = $wp_rest_server = new WP_REST_Server();
        do_action( 'rest_api_init' );
    }

    public function test_site_info_requires_manage_options(): void {
        $request = new WP_REST_Request( 'GET', '/wp-agent/v1/site-info' );
        $response = $this->server->dispatch( $request );

        $this->assertSame( 401, $response->get_status() );
    }
}
```

## Targeted Test Execution Commands

```powershell
# Run only unit test suite
composer test:unit

# Run a single test file
composer test -- tests/Unit/SiteInfoTest.php

# Filter by specific test method name
composer test -- --filter test_site_info_requires_manage_options
```

## Official References

- [WordPress Automated Testing](https://developer.wordpress.org/advanced-administration/wordpress/testing/automated-testing/)
- [Brain Monkey Documentation](https://brain-wp.github.io/BrainMonkey/)
- [PHPUnit Official Manual](https://phpunit.de/documentation.html)

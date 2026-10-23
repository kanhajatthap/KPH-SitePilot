---
name: wordpress-performance
description: >-
  Provides profiling techniques, database query optimization, Object Cache & Transients strategies,
  and asset minimization for WordPress. Use when optimizing page speed, analyzing slow queries, or resolving high memory usage.
---

# WordPress Performance Optimization

This skill guides optimization of WordPress plugins, themes, and server interactions based on the [WordPress Core Performance Guidelines](https://make.wordpress.org/core/handbook/tutorials/measuring-page-performance/).

## Database Query Optimization

1. **Avoid Unbounded Queries**:
   - Never pass `'posts_per_page' => -1` in production. Always enforce reasonable limits (e.g. `50`).
2. **Omit SQL Pagination When Not Needed**:
   - Set `'no_found_rows' => true` when total page counts are not required. This avoids the expensive `SQL_CALC_FOUND_ROWS` query.
3. **Select Only Required Fields**:
   - Use `'fields' => 'ids'` when you only need post IDs, then leverage standard object caches.
4. **Avoid Expensive Sorting**:
   - Never use `'orderby' => 'RAND()'`. Implement application-level random offset selection if random items are needed.

```php
// High-performance WP_Query
$query = new \WP_Query( [
    'post_type'      => 'post',
    'post_status'    => 'publish',
    'posts_per_page' => 20,
    'no_found_rows'  => true,
    'update_post_meta_cache' => false,
    'update_post_term_cache' => false,
    'fields'         => 'ids',
] );
```

## Caching Strategy

### Transients API (Persistent or Ephemeral)
Use for caching expensive external API responses or complex aggregations:

```php
$cache_key = 'wp_agent_site_stats';
$stats = get_transient( $cache_key );

if ( false === $stats ) {
    $stats = $this->calculate_expensive_stats();
    set_transient( $cache_key, $stats, HOUR_IN_SECONDS * 6 );
}
```

### Object Cache (`wp_cache_*`)
Use for in-memory, request-scoped caching:

```php
$cache_group = 'wp_agent';
$data = wp_cache_get( 'key', $cache_group );
if ( false === $data ) {
    $data = fetch_computation();
    wp_cache_set( 'key', $data, $cache_group, 3600 );
}
```

## Autoloaded Options Guard
- In `wp_options`, large transient or configuration blobs must **never** be set to autoload (`autoload = 'no'`).
- Bloated autoloaded options degrade TTFB on every single request.

## Modern Asset Loading (WP 6.3+)
Utilize modern script strategies:

```php
wp_enqueue_script(
    'wp-agent-dashboard',
    plugins_url( 'assets/dashboard.js', __FILE__ ),
    [ 'wp-element' ],
    '1.0.0',
    [
        'strategy'  => 'defer',
        'in_footer' => true,
    ]
);
```

## Official References

- [WordPress Performance Team Tutorials](https://make.wordpress.org/core/handbook/tutorials/measuring-page-performance/)
- [Transients API](https://developer.wordpress.org/plugins/introductory-topics/transients/)
- [Class: WP_Query Reference](https://developer.wordpress.org/reference/classes/wp_query/)

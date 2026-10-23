---
name: acf-integration
description: >-
  Provides patterns for programmatic field group registration, JSON synchronization, secure field retrieval,
  and ACF Block creation with Advanced Custom Fields (ACF). Use when working with custom metadata, ACF field definitions, or ACF Blocks.
---

# Advanced Custom Fields (ACF) Integration

This skill outlines best practices for integrating with Advanced Custom Fields (ACF Pro) following the [ACF Documentation](https://www.advancedcustomfields.com/resources/).

## Programmatic Field Group Registration

Use `acf_add_local_field_group` for version-controlled, code-first field configurations:

```php
add_action( 'acf/init', function() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'      => 'group_wp_agent_metadata',
        'title'    => 'WP Agent Metadata',
        'fields'   => [
            [
                'key'   => 'field_agent_notes',
                'label' => 'Agent Notes',
                'name'  => 'wp_agent_notes',
                'type'  => 'textarea',
                'rows'  => 4,
            ],
            [
                'key'           => 'field_agent_status',
                'label'         => 'Review Status',
                'name'          => 'wp_agent_status',
                'type'          => 'select',
                'choices'       => [
                    'pending'  => 'Pending',
                    'reviewed' => 'Reviewed',
                ],
                'default_value' => 'pending',
            ],
        ],
        'location' => [
            [
                [
                    'param'    => 'post_type',
                    'operator' => '==',
                    'value'    => 'post',
                ],
            ],
        ],
    ] );
} );
```

## JSON Synchronization (`acf-json`)

Enable automatic local JSON synchronization in source control:

```php
// Save path
add_filter( 'acf/settings/save_json', function( $path ) {
    return get_stylesheet_directory() . '/acf-json';
} );

// Load paths
add_filter( 'acf/settings/load_json', function( $paths ) {
    $paths[] = get_stylesheet_directory() . '/acf-json';
    return $paths;
} );
```

## Safe Field Retrieval & Performance

Always specify post IDs and sanitize retrieved values:

```php
// Safe retrieval
$raw_status = get_field( 'wp_agent_status', $post_id );
$safe_status = sanitize_text_field( $raw_status );

// Repeater loop
if ( have_rows( 'my_repeater_field', $post_id ) ) {
    while ( have_rows( 'my_repeater_field', $post_id ) ) {
        the_row();
        $sub_val = get_sub_field( 'sub_text' );
        echo esc_html( $sub_val );
    }
}
```

## Performance Rule
- `get_field()` triggers database queries for field objects and formatting. For high-volume read operations (e.g. loops over 100+ posts), prefer `get_post_meta()` directly or batch prefetch metadata to avoid N+1 queries.

## Official References

- [ACF Official Documentation](https://www.advancedcustomfields.com/resources/)
- [Registering Local Fields via PHP](https://www.advancedcustomfields.com/resources/register-fields-via-php/)
- [ACF JSON Synchronization](https://www.advancedcustomfields.com/resources/local-json/)

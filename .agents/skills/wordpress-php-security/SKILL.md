---
name: wordpress-php-security
description: >-
  Provides core WordPress defense-in-depth security patterns including sanitization, output escaping,
  nonce verification, capability checks, SQL injection prevention, and SSRF mitigation. Use when reviewing,
  writing, or auditing PHP code for WordPress security vulnerabilities.
---

# WordPress PHP Security

This skill enforces secure coding patterns based on the [WordPress Security Handbook](https://developer.wordpress.org/plugins/security/) and OWASP Top 10.

## 1. Input Sanitization (Clean Early)

Always sanitize raw inputs (`$_GET`, `$_POST`, `$_REQUEST`, `php://input`):

| Context | Function | Example |
| :--- | :--- | :--- |
| Single-line text | `sanitize_text_field( $val )` | Form text fields, titles |
| HTML textarea | `wp_kses_post( $val )` | Rich text inputs |
| Integer / ID | `absint( $val )` | Record IDs, pagination |
| Slug / Key | `sanitize_key( $val )` | Meta keys, post names |
| Email | `sanitize_email( $val )` | Contact emails |
| URL | `esc_url_raw( $val )` | Stored URLs, webhook links |
| File name | `sanitize_file_name( $val )` | Uploaded attachments |

## 2. Output Escaping (Escape Late)

Always escape immediately prior to rendering into HTML:

- `esc_html( $text )`: For content between HTML tags (`<p><?php echo esc_html( $msg ); ?></p>`).
- `esc_attr( $text )`: For inside HTML attributes (`value="<?php echo esc_attr( $val ); ?>"`).
- `esc_url( $url )`: For `href`, `src`, `action` URLs.
- `esc_js( $code )`: Inline JavaScript strings.
- `wp_json_encode( $data )`: Outputting data into inline `<script>` tags.

## 3. CSRF & Nonce Verification

- Generate: `wp_create_nonce( 'action_name' )`
- Form field: `wp_nonce_field( 'save_settings', 'settings_nonce' )`
- Verify form:
  ```php
  if ( ! isset( $_POST['settings_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['settings_nonce'] ), 'save_settings' ) ) {
      wp_die( esc_html__( 'Security check failed.', 'wp-agent' ), 403 );
  }
  ```
- Verify AJAX: `check_ajax_referer( 'ajax_action', 'nonce' );`

## 4. Authorization & Capability Checks

Nonces verify intent, NOT authorization. Always check capabilities:

```php
if ( ! current_user_can( 'manage_options' ) ) {
    wp_die( esc_html__( 'Unauthorized access.', 'wp-agent' ), 403 );
}
```

For custom post actions, check object-level capabilities: `current_user_can( 'edit_post', $post_id )`.

## 5. SQL Injection Prevention

Never concatenate dynamic values into `$wpdb->query()` or `$wpdb->get_results()`. Always use `$wpdb->prepare()`:

```php
// Good:
$results = $wpdb->get_results(
    $wpdb->prepare(
        "SELECT * FROM {$wpdb->prefix}custom_table WHERE post_id = %d AND status = %s",
        $post_id,
        $status
    )
);

// For table and column identifiers (not supported by %s placeholders):
$table_name = esc_sql( $wpdb->prefix . 'my_table' );
```

## 6. SSRF (Server-Side Request Forgery) Mitigation

When making outbound HTTP requests to user-provided URLs:

- Use `wp_safe_remote_get()` and `wp_safe_remote_post()` instead of `wp_remote_get()` or raw cURL.
- Validate destination: `wp_http_validate_url( $target_url )`.
- WordPress automatically blocks requests to local loopbacks (`127.0.0.1`, `localhost`, RFC 1918 private IPs) unless explicitly filtered in test environments.

## Official References

- [WordPress Plugin Security Handbook](https://developer.wordpress.org/plugins/security/)
- [Data Sanitization and Validation](https://developer.wordpress.org/plugins/security/securing-input/)
- [Securing Output (Escaping)](https://developer.wordpress.org/plugins/security/securing-output/)

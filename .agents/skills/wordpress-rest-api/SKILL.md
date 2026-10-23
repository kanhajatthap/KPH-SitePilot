---
name: wordpress-rest-api
description: >-
  Provides standards and best practices for creating custom WordPress REST API endpoints, controllers,
  permission checks, schema validation, and authentication. Use when building, debugging, or reviewing
  WordPress REST API routes and bridge endpoints.
---

# WordPress REST API Development

This skill governs the implementation of custom REST API endpoints using the [WordPress REST API Handbook](https://developer.wordpress.org/rest-api/).

## Route Registration Pattern

Register all routes on `rest_api_init` using standard versioned namespaces:

```php
add_action( 'rest_api_init', function () {
    register_rest_route( 'wp-agent/v1', '/site-info', [
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => [ SiteInfoController::class, 'get_item' ],
        'permission_callback' => [ SiteInfoController::class, 'get_item_permissions_check' ],
        'args'                => [
            'include_plugins' => [
                'description'       => 'Whether to list active plugins.',
                'type'              => 'boolean',
                'default'           => false,
                'sanitize_callback' => 'rest_sanitize_boolean',
                'validate_callback' => 'rest_validate_request_arg',
            ],
        ],
    ] );
} );
```

## Mandatory Permission Callbacks

Every endpoint **MUST** define a `permission_callback`. Never omit this argument or rely on default behavior:

```php
public static function get_item_permissions_check( WP_REST_Request $request ): bool|WP_Error {
    if ( ! current_user_can( 'manage_options' ) ) {
        return new WP_Error(
            'rest_forbidden',
            __( 'You do not have permission to access site information.', 'wp-agent' ),
            [ 'status' => rest_authorization_required_code() ]
        );
    }
    return true;
}
```

## Custom Controller Architecture

Extend `WP_REST_Controller` for resource-based APIs:

```php
namespace WpAgent\Bridge\Api;

use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WP_Error;

class PostInspectionController extends WP_REST_Controller {
    protected $namespace = 'wp-agent/v1';
    protected $rest_base = 'inspections';

    public function register_routes(): void {
        register_rest_route( $this->namespace, '/' . $this->rest_base, [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'get_items' ],
                'permission_callback' => [ $this, 'get_items_permissions_check' ],
                'schema'              => [ $this, 'get_item_schema' ],
            ],
        ] );
    }

    public function get_items( $request ): WP_REST_Response|WP_Error {
        $data = [ /* ... */ ];
        return rest_ensure_response( $data );
    }
}
```

## Authentication Guidelines

1. **Local & Browser Client**: Authenticate via standard WordPress session cookies with the `X-WP-Nonce` header set to `wp_create_nonce( 'wp_rest' )`.
2. **External CLI / Agent**: Use WordPress Application Passwords via Basic Authentication over HTTPS (`Authorization: Basic base64(user:app_password)`).
3. **Status Codes**: Return proper HTTP statuses (200 for OK, 201 for Created, 400 for Bad Request, 401 for Unauthorized, 403 for Forbidden, 404 for Not Found).

## Official References

- [Extending the REST API](https://developer.wordpress.org/rest-api/extending-the-rest-api/)
- [Adding Custom Endpoints](https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/)
- [Controller Classes](https://developer.wordpress.org/rest-api/extending-the-rest-api/controller-classes/)

<?php
/**
 * Plugin Name:       WP Agent Bridge
 * Plugin URI:        https://github.com/wp-agent/bridge
 * Description:       Secure read-only companion bridge for WP Agent / KPH SitePilot.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.2
 * Author:            WP Agent Team
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-agent-bridge
 */

defined( 'ABSPATH' ) || exit;

final class WP_Agent_Bridge {
	const VERSION = '0.1.0';
	const REST_NAMESPACE = 'wp-agent-bridge/v1';

	public static function init(): void {
		add_action( 'rest_api_init', [ __CLASS__, 'register_rest_routes' ] );
	}

	/**
	 * Registers strictly read-only REST endpoints.
	 * Mutating operations (POST, PUT, DELETE, PATCH) are forbidden by design.
	 */
	public static function register_rest_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/status',
			[
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => [ __CLASS__, 'get_status' ],
				'permission_callback' => [ __CLASS__, 'check_admin_permissions' ],
			]
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/inspect',
			[
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => [ __CLASS__, 'inspect_site' ],
				'permission_callback' => [ __CLASS__, 'check_admin_permissions' ],
				'args'                => [
					'include_plugins' => [
						'type'              => 'boolean',
						'default'           => false,
						'sanitize_callback' => 'rest_sanitize_boolean',
					],
				],
			]
		);
	}

	/**
	 * Permission check: Requires manage_options capability.
	 */
	public static function check_admin_permissions(): bool|WP_Error {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'You do not have permission to inspect this site.', 'wp-agent-bridge' ),
				[ 'status' => rest_authorization_required_code() ]
			);
		}
		return true;
	}

	/**
	 * Returns basic bridge health and status.
	 */
	public static function get_status( WP_REST_Request $request ): WP_REST_Response {
		return rest_ensure_response(
			[
				'status'     => 'ok',
				'bridge'     => 'wp-agent-bridge',
				'version'    => self::VERSION,
				'phpVersion' => PHP_VERSION,
				'readOnly'   => true,
			]
		);
	}

	/**
	 * Returns sanitized, read-only site inspection metadata.
	 */
	public static function inspect_site( WP_REST_Request $request ): WP_REST_Response {
		$include_plugins = (bool) $request->get_param( 'include_plugins' );
		$theme           = wp_get_theme();

		$data = [
			'siteName'    => get_bloginfo( 'name' ),
			'siteUrl'     => get_bloginfo( 'url' ),
			'wpVersion'   => get_bloginfo( 'version' ),
			'activeTheme' => $theme->get( 'Name' ),
			'readOnly'    => true,
		];

		if ( $include_plugins && function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
			$all_plugins = get_plugins();
			$active_slugs = [];
			foreach ( $all_plugins as $plugin_file => $plugin_data ) {
				if ( is_plugin_active( $plugin_file ) ) {
					$active_slugs[] = sanitize_text_field( $plugin_data['Name'] );
				}
			}
			$data['plugins'] = $active_slugs;
		}

		return rest_ensure_response( $data );
	}
}

add_action( 'plugins_loaded', [ 'WP_Agent_Bridge', 'init' ] );

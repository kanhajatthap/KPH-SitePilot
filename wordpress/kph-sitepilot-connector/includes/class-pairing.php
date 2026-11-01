<?php
/**
 * Pairing endpoints for the connector.
 *
 * The WordPress administrator types a short-lived code generated in SitePilot.
 * This class exchanges that code for a site token and secret, stores them
 * (secret masked on screen, never returned by any endpoint) and exposes an
 * unpair action that clears the credentials locally.
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'KPH_SP_Pairing' ) ) {
	/**
	 * REST surface used by the admin screen.
	 */
	final class KPH_SP_Pairing {

		const REST_NAMESPACE = 'kph-sitepilot/v1';
		const CODE_LENGTH    = 8;

		/**
		 * Registers the connector routes.
		 */
		public static function register_routes() {
			register_rest_route(
				self::REST_NAMESPACE,
				'/pair',
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'handle_pair' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
					'args'                => array(
						'code'        => array(
							'required'          => true,
							'type'              => 'string',
							'sanitize_callback' => array( __CLASS__, 'sanitize_code' ),
						),
						'environment' => array(
							'required'          => false,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_key',
						),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/unpair',
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'handle_unpair' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/status',
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'handle_status' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				)
			);
		}

		/**
		 * Only administrators may pair or unpair this site.
		 *
		 * WordPress validates the REST nonce (X-WP-Nonce) for cookie-authenticated
		 * requests before this runs, so a third-party page cannot drive it.
		 *
		 * @return true|WP_Error
		 */
		public static function can_manage() {
			if ( ! is_user_logged_in() || ! current_user_can( 'manage_options' ) ) {
				return new WP_Error(
					'kph_sp_forbidden',
					__( 'Only a WordPress administrator can manage this connection.', 'kph-sitepilot-connector' ),
					array( 'status' => 403 )
				);
			}

			return true;
		}

		/**
		 * Normalizes a typed code: uppercase, no separators.
		 *
		 * @param string $code Raw code.
		 * @return string
		 */
		public static function sanitize_code( $code ) {
			$clean = strtoupper( preg_replace( '/[^A-Za-z0-9]/', '', (string) $code ) );

			// Fold characters that the platform alphabet deliberately omits.
			$clean = str_replace( array( 'I', 'L', '1', 'O', '0' ), array( 'J', 'J', 'J', 'Q', 'Q' ), $clean );

			return $clean;
		}

		/**
		 * True when a normalized code has the expected shape.
		 *
		 * @param string $code Normalized code.
		 * @return bool
		 */
		public static function is_valid_code( $code ) {
			return (bool) preg_match( '/^[A-HJKMNP-Z2-9]{8}$/', $code );
		}

		/**
		 * Returns the configured platform base URL without a trailing slash.
		 *
		 * @return string
		 */
		public static function platform_base_url() {
			$url = (string) KPH_SP_Settings::get( 'platform_url', '' );
			return untrailingslashit( esc_url_raw( $url ) );
		}

		/**
		 * POST /pair — exchanges a pairing code for site credentials.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response|WP_Error
		 */
		public static function handle_pair( $request ) {
			$code = self::sanitize_code( $request->get_param( 'code' ) );

			if ( ! self::is_valid_code( $code ) ) {
				return new WP_Error(
					'kph_sp_invalid_code',
					__( 'Pairing codes are 8 characters, for example ABCD-EFGH.', 'kph-sitepilot-connector' ),
					array( 'status' => 400 )
				);
			}

			$base = self::platform_base_url();
			if ( '' === $base ) {
				return new WP_Error(
					'kph_sp_missing_platform',
					__( 'Set the SitePilot platform URL before connecting.', 'kph-sitepilot-connector' ),
					array( 'status' => 400 )
				);
			}

			$environment = $request->get_param( 'environment' );
			$environment = in_array( $environment, array( 'local', 'staging', 'production' ), true )
				? $environment
				: (string) KPH_SP_Settings::get( 'environment', 'production' );

			$response = wp_remote_post(
				$base . '/api/connector/pair',
				array(
					'timeout'     => 20,
					'redirection' => 0,
					'headers'     => array(
						'Content-Type' => 'application/json',
						'Accept'       => 'application/json',
					),
					'body'        => wp_json_encode(
						array(
							'code'          => $code,
							'siteUrl'       => home_url( '/' ),
							'siteName'      => get_bloginfo( 'name' ),
							'environment'   => $environment,
							'pluginVersion' => KPH_SP_VERSION,
							'wpVersion'     => get_bloginfo( 'version' ),
							'phpVersion'    => PHP_VERSION,
							'capabilities'  => array(
								'filesystem' => defined( 'FS_METHOD' ) ? FS_METHOD : 'direct',
								'multisite'  => is_multisite(),
							),
						)
					),
				)
			);

			if ( is_wp_error( $response ) ) {
				return new WP_Error(
					'kph_sp_unreachable',
					sprintf(
						/* translators: %s: network error message. */
						__( 'Could not reach SitePilot: %s', 'kph-sitepilot-connector' ),
						$response->get_error_message()
					),
					array( 'status' => 502 )
				);
			}

			$status = (int) wp_remote_retrieve_response_code( $response );
			$body   = json_decode( (string) wp_remote_retrieve_body( $response ), true );

			if ( ! is_array( $body ) ) {
				return new WP_Error(
					'kph_sp_bad_response',
					__( 'SitePilot returned an unreadable response.', 'kph-sitepilot-connector' ),
					array( 'status' => 502 )
				);
			}

			if ( $status < 200 || $status >= 300 ) {
				$message = isset( $body['message'] ) ? (string) $body['message'] : __( 'Pairing was rejected.', 'kph-sitepilot-connector' );
				return new WP_Error( 'kph_sp_pair_rejected', $message, array( 'status' => $status ) );
			}

			$site        = isset( $body['site'] ) && is_array( $body['site'] ) ? $body['site'] : array();
			$credentials = isset( $body['credentials'] ) && is_array( $body['credentials'] ) ? $body['credentials'] : array();

			$site_id    = isset( $site['id'] ) ? (string) $site['id'] : '';
			$site_url   = isset( $site['url'] ) ? (string) $site['url'] : '';
			$token      = isset( $credentials['token'] ) ? (string) $credentials['token'] : '';
			$secret     = isset( $credentials['secret'] ) ? (string) $credentials['secret'] : '';
			$scopes     = isset( $site['scopes'] ) && is_array( $site['scopes'] ) ? $site['scopes'] : array();
			$env        = isset( $site['environment'] ) ? (string) $site['environment'] : $environment;

			if ( ! preg_match( '/^[a-f0-9-]{36}$/', $site_id ) || ! preg_match( '/^[a-f0-9]{64}$/', $token ) || ! preg_match( '/^[a-f0-9]{64}$/', $secret ) ) {
				return new WP_Error(
					'kph_sp_bad_credentials',
					__( 'SitePilot returned incomplete credentials. Nothing was saved.', 'kph-sitepilot-connector' ),
					array( 'status' => 502 )
				);
			}

			KPH_SP_Settings::update(
				array(
					'site_id'      => $site_id,
					'site_token'   => $token,
					'site_secret'  => $secret,
					'site_url'     => '' !== $site_url ? $site_url : home_url( '/' ),
					'environment'  => $env,
					'scopes'       => $scopes,
					'connected_at' => gmdate( 'c' ),
					'connected_by' => get_current_user_id(),
				)
			);

			// Prove the credentials immediately: the first heartbeat also uploads
			// the capability manifest, so the platform knows the site before the
			// first job arrives.
			KPH_SP_Job_Runner::heartbeat( true );
			wp_schedule_single_event( time() + 5, KPH_SP_CRON_HOOK );

			return rest_ensure_response(
				array(
					'status'  => 'connected',
					'site'    => array(
						'id'          => $site_id,
						'url'         => '' !== $site_url ? $site_url : home_url( '/' ),
						'environment' => $env,
						'scopes'      => KPH_SP_Settings::scopes(),
					),
					'message' => __( 'Site connected. You can return to SitePilot.', 'kph-sitepilot-connector' ),
				)
			);
		}

		/**
		 * POST /unpair — revokes the connection on both sides.
		 *
		 * The platform is told first (best effort, signed): if the call fails we
		 * still forget the credentials locally, because a site that keeps a secret
		 * it can no longer use is worse than one the platform must revoke by hand.
		 *
		 * @return WP_REST_Response
		 */
		public static function handle_unpair() {
			$revoked = false;

			if ( KPH_SP_Settings::is_connected() ) {
				$site_id = (string) KPH_SP_Settings::get( 'site_id' );
				$result  = KPH_SP_Job_Runner::request(
					'/api/connector/unpair',
					array( 'siteId' => $site_id )
				);

				$revoked = ! is_wp_error( $result );
			}

			KPH_SP_Job_Runner::disconnect();

			return rest_ensure_response(
				array(
					'status'  => 'disconnected',
					'revoked' => $revoked,
					'message' => $revoked
						? __( 'This site is disconnected on both sides.', 'kph-sitepilot-connector' )
						: __( 'Local credentials were removed. Revoke the connection in SitePilot as well.', 'kph-sitepilot-connector' ),
				)
			);
		}

		/**
		 * GET /status — connection state without any credential material.
		 *
		 * @return WP_REST_Response
		 */
		public static function handle_status() {
			$settings = KPH_SP_Settings::all();

			return rest_ensure_response(
				array(
					'connected'     => KPH_SP_Settings::is_connected(),
					'siteId'        => (string) $settings['site_id'],
					'environment'   => (string) $settings['environment'],
					'scopes'        => KPH_SP_Settings::scopes(),
					'pluginVersion' => KPH_SP_VERSION,
				)
			);
		}
	}
}

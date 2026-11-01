<?php
/**
 * Connector settings and access scopes.
 *
 * Connecting a site as a WordPress administrator enables the full scope set by
 * default (`read` … `files`, `code`). A scope only grants the *possibility* of a
 * tool: every write still requires a platform-side plan, human approval, a
 * before-snapshot and post-write verification.
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'KPH_SP_Settings' ) ) {
	/**
	 * Option-backed settings store.
	 */
	final class KPH_SP_Settings {

		/** Every scope the connector understands, in display order. */
		const SCOPES = array( 'read', 'content', 'media', 'site_ops', 'commerce', 'files', 'code' );

		/** Scopes that are not reversible by a simple snapshot. */
		const HIGH_RISK_SCOPES = array( 'files', 'code', 'commerce' );

		/**
		 * Default option values.
		 *
		 * @return array<string,mixed>
		 */
		public static function defaults() {
			return array(
				'site_id'      => '',
				'site_token'   => '',
				'site_secret'  => '',
				'platform_url' => 'https://kph-sitepilot.vercel.app',
				'site_url'     => home_url( '/' ),
				'site_name'    => get_bloginfo( 'name' ),
				'environment'  => 'production',
				'scopes'       => self::SCOPES,
				'poll_mode'    => 'standard',
				'connected_at' => '',
				'connected_by' => 0,
			);
		}

		/**
		 * Returns all settings merged over defaults.
		 *
		 * @return array<string,mixed>
		 */
		public static function all() {
			$stored = get_option( KPH_SP_OPTION, array() );
			if ( ! is_array( $stored ) ) {
				$stored = array();
			}

			$settings = wp_parse_args( $stored, self::defaults() );
			$settings['scopes'] = self::sanitize_scopes( $settings['scopes'] );

			return $settings;
		}

		/**
		 * Reads one setting.
		 *
		 * @param string $key     Setting key.
		 * @param mixed  $default Fallback when the key is absent.
		 * @return mixed
		 */
		public static function get( $key, $default = null ) {
			$settings = self::all();
			return array_key_exists( $key, $settings ) ? $settings[ $key ] : $default;
		}

		/**
		 * Merges and persists settings. Unknown keys are dropped.
		 *
		 * @param array<string,mixed> $values Values to persist.
		 * @return array<string,mixed> The stored settings.
		 */
		public static function update( array $values ) {
			$allowed  = array_keys( self::defaults() );
			$settings = self::all();

			foreach ( $values as $key => $value ) {
				if ( ! in_array( $key, $allowed, true ) ) {
					continue;
				}
				if ( 'scopes' === $key ) {
					$settings['scopes'] = self::sanitize_scopes( $value );
					continue;
				}
				if ( in_array( $key, array( 'site_id', 'site_token', 'site_secret', 'platform_url', 'site_url', 'site_name', 'environment', 'poll_mode', 'connected_at' ), true ) ) {
					$settings[ $key ] = is_string( $value ) ? sanitize_text_field( $value ) : $value;
					continue;
				}
				$settings[ $key ] = $value;
			}

			$settings['connected_by'] = isset( $settings['connected_by'] ) ? (int) $settings['connected_by'] : 0;

			update_option( KPH_SP_OPTION, $settings, false );

			return $settings;
		}

		/**
		 * True when the site holds pairing credentials.
		 *
		 * @return bool
		 */
		public static function is_connected() {
			$settings = self::all();
			return '' !== $settings['site_id'] && '' !== $settings['site_token'] && '' !== $settings['site_secret'];
		}

		/**
		 * Returns the enabled scopes.
		 *
		 * @return string[]
		 */
		public static function scopes() {
			return self::all()['scopes'];
		}

		/**
		 * Checks whether a scope is enabled.
		 *
		 * @param string $scope Scope name.
		 * @return bool
		 */
		public static function has_scope( $scope ) {
			return in_array( $scope, self::scopes(), true );
		}

		/**
		 * Keeps only known scope names, preserving canonical order.
		 *
		 * @param mixed $scopes Raw scope input.
		 * @return string[]
		 */
		public static function sanitize_scopes( $scopes ) {
			if ( ! is_array( $scopes ) ) {
				return self::SCOPES;
			}

			$clean = array();
			foreach ( self::SCOPES as $scope ) {
				if ( in_array( $scope, $scopes, true ) ) {
					$clean[] = $scope;
				}
			}

			// A connected site must be able to read; never allow an empty scope set.
			if ( empty( $clean ) ) {
				$clean = array( 'read' );
			}

			return $clean;
		}

		/**
		 * Deletes all connector options and scheduled events.
		 */
		public static function destroy() {
			delete_option( KPH_SP_OPTION );
			delete_option( 'kph_sp_version' );
			wp_clear_scheduled_hook( KPH_SP_CRON_HOOK );
		}
	}
}

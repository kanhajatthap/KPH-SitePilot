<?php
/**
 * Connector bootstrap.
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'KPH_SP_Plugin' ) ) {
	/**
	 * Wires the connector into WordPress.
	 */
	final class KPH_SP_Plugin {

		/**
		 * Singleton instance.
		 *
		 * @var KPH_SP_Plugin|null
		 */
		private static $instance = null;

		/**
		 * Returns the singleton instance.
		 *
		 * @return KPH_SP_Plugin
		 */
		public static function instance() {
			if ( null === self::$instance ) {
				self::$instance = new self();
			}

			return self::$instance;
		}

		/**
		 * Registers hooks.
		 */
		private function __construct() {
			add_action( 'init', array( $this, 'load_textdomain' ) );
			add_action( 'rest_api_init', array( 'KPH_SP_Pairing', 'register_routes' ) );
			add_filter( 'cron_schedules', array( $this, 'add_cron_schedule' ) );
			add_action( KPH_SP_CRON_HOOK, array( 'KPH_SP_Job_Runner', 'poll' ) );
			add_filter(
				'plugin_action_links_' . plugin_basename( KPH_SP_FILE ),
				array( $this, 'add_action_links' )
			);

			if ( is_admin() ) {
				require_once KPH_SP_DIR . 'admin/class-admin-page.php';
				new KPH_SP_Admin_Page();
			}
		}

		/**
		 * Adds a one-minute schedule for the connector poll.
		 *
		 * WP-Cron only fires while the site has traffic, which is fine: a job
		 * also triggers an immediate poll, and the platform retries on lease
		 * expiry if a poll is missed.
		 *
		 * @param array<string,array<string,mixed>> $schedules Existing schedules.
		 * @return array<string,array<string,mixed>>
		 */
		public function add_cron_schedule( $schedules ) {
			if ( ! is_array( $schedules ) ) {
				$schedules = array();
			}

			$schedules['kph_sp_minute'] = array(
				'interval' => 60,
				'display'  => __( 'Every minute (KPH SitePilot)', 'kph-sitepilot-connector' ),
			);

			return $schedules;
		}

		/**
		 * Loads translations.
		 */
		public function load_textdomain() {
			load_plugin_textdomain(
				'kph-sitepilot-connector',
				false,
				dirname( plugin_basename( KPH_SP_FILE ) ) . '/languages'
			);
		}

		/**
		 * Adds a settings shortcut on the Plugins screen.
		 *
		 * @param string[] $links Existing action links.
		 * @return string[]
		 */
		public function add_action_links( $links ) {
			$settings = sprintf(
				'<a href="%s">%s</a>',
				esc_url( admin_url( 'admin.php?page=kph-sitepilot' ) ),
				esc_html__( 'Settings', 'kph-sitepilot-connector' )
			);

			array_unshift( $links, $settings );

			return $links;
		}

		/**
		 * Activation: seed defaults once, record the plugin version.
		 */
		public static function activate() {
			if ( false === get_option( KPH_SP_OPTION, false ) ) {
				add_option( KPH_SP_OPTION, KPH_SP_Settings::defaults(), '', false );
			}

			update_option( 'kph_sp_version', KPH_SP_VERSION, false );

			if ( ! wp_next_scheduled( KPH_SP_CRON_HOOK ) ) {
				wp_schedule_event( time() + 60, 'kph_sp_minute', KPH_SP_CRON_HOOK );
			}
		}

		/**
		 * Deactivation: stop scheduled work. Stored settings are kept so a
		 * re-activated plugin can reconnect without re-pairing.
		 */
		public static function deactivate() {
			wp_clear_scheduled_hook( KPH_SP_CRON_HOOK );
		}
	}
}

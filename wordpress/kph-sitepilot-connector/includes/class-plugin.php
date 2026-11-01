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

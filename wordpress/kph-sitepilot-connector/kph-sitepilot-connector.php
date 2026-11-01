<?php
/**
 * Plugin Name:       KPH SitePilot Connector
 * Plugin URI:        https://github.com/kanhajatthap/KPH-SitePilot
 * Description:       Connects this WordPress site to KPH SitePilot so an administrator can manage content, media, menus, settings, plugins, themes, WooCommerce, files and code from prompts — with plans, approval, snapshots and undo.
 * Version:           0.3.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Author:            KPH SitePilot
 * Author URI:        https://github.com/kanhajatthap/KPH-SitePilot
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       kph-sitepilot-connector
 * Domain Path:       /languages
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

define( 'KPH_SP_VERSION', '0.3.0' );
define( 'KPH_SP_FILE', __FILE__ );
define( 'KPH_SP_DIR', plugin_dir_path( __FILE__ ) );
define( 'KPH_SP_URL', plugin_dir_url( __FILE__ ) );
define( 'KPH_SP_OPTION', 'kph_sp_settings' );
define( 'KPH_SP_CRON_HOOK', 'kph_sp_poll' );

require_once KPH_SP_DIR . 'includes/class-signature.php';
require_once KPH_SP_DIR . 'includes/class-settings.php';
require_once KPH_SP_DIR . 'includes/class-capabilities.php';
require_once KPH_SP_DIR . 'includes/class-tools.php';
require_once KPH_SP_DIR . 'includes/class-job-runner.php';
require_once KPH_SP_DIR . 'includes/class-pairing.php';
require_once KPH_SP_DIR . 'includes/class-plugin.php';

register_activation_hook( __FILE__, array( 'KPH_SP_Plugin', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'KPH_SP_Plugin', 'deactivate' ) );

add_action( 'plugins_loaded', array( 'KPH_SP_Plugin', 'instance' ) );

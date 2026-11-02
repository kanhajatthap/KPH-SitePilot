<?php
/**
 * Static checks for the connector plugin. No WordPress or database required.
 * Run with `php tests/test-plugin.php`.
 *
 * @package KPH_SitePilot_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

$plugin_dir  = dirname( __DIR__ );
$plugin_file = $plugin_dir . '/kph-sitepilot-connector.php';

if ( ! file_exists( $plugin_file ) ) {
	fwrite( STDERR, "Error: plugin bootstrap not found.\n" );
	exit( 1 );
}

$failures = 0;
$checks   = 0;

/**
 * Records an assertion.
 *
 * @param bool   $condition Assertion outcome.
 * @param string $label     Assertion label.
 */
function kph_sp_static_assert( $condition, $label ) {
	global $failures, $checks;
	$checks++;
	if ( ! $condition ) {
		$failures++;
		fwrite( STDERR, "FAIL: {$label}\n" );
	}
}

$bootstrap = file_get_contents( $plugin_file );

foreach ( array(
	'Plugin Name:       KPH SitePilot Connector',
	'Requires at least: 6.4',
	'Requires PHP:      7.4',
	'License:           GPL-2.0-or-later',
) as $header ) {
	kph_sp_static_assert( false !== strpos( $bootstrap, $header ), "bootstrap header: {$header}" );
}

kph_sp_static_assert( false !== strpos( $bootstrap, "defined( 'ABSPATH' ) || exit;" ), 'bootstrap ABSPATH guard' );
kph_sp_static_assert( false !== strpos( $bootstrap, 'register_activation_hook' ), 'activation hook registered' );
kph_sp_static_assert( false !== strpos( $bootstrap, 'register_deactivation_hook' ), 'deactivation hook registered' );

// Every PHP file must guard direct access and avoid dangerous execution.
$iterator = new RecursiveIteratorIterator(
	new RecursiveDirectoryIterator( $plugin_dir, FilesystemIterator::SKIP_DOTS )
);

$forbidden = array( 'eval(', 'create_function(', 'passthru(', 'shell_exec(', 'proc_open(', 'popen(', 'system(' );

foreach ( $iterator as $file ) {
	if ( 'php' !== strtolower( $file->getExtension() ) ) {
		continue;
	}

	$path     = $file->getPathname();
	$contents = file_get_contents( $path );
	$relative = str_replace( $plugin_dir . '/', '', $path );
	$is_test  = false !== strpos( $relative, 'tests/' );

	// Tests and uninstall.php legitimately run outside a full WordPress load.
	if ( ! $is_test && 'uninstall.php' !== $relative ) {
		kph_sp_static_assert(
			false !== strpos( $contents, "defined( 'ABSPATH' ) || exit;" ),
			"{$relative}: ABSPATH guard"
		);
	}

	// Production code must not use dynamic execution. Test helpers are exempt
	// because their own names/strings would trip the substring scan.
	if ( ! $is_test ) {
		foreach ( $forbidden as $function ) {
			kph_sp_static_assert( false === stripos( $contents, $function ), "{$relative}: no {$function}" );
		}
	}

	// Syntax is verified by `php -l` in CI and by scripts/php-lint.mjs locally;
	// raw bracket counting is too fragile (regexes and strings contain both).
}

// Scope model must include full access, including files and code.
require_once $plugin_dir . '/includes/class-signature.php';

$settings_source = file_get_contents( $plugin_dir . '/includes/class-settings.php' );
foreach ( array( "'read'", "'content'", "'media'", "'site_ops'", "'commerce'", "'files'", "'code'" ) as $scope ) {
	kph_sp_static_assert( false !== strpos( $settings_source, $scope ), "scope declared: {$scope}" );
}

// Signature class must exist and expose the protocol.
kph_sp_static_assert( class_exists( 'KPH_SP_Signature' ), 'signature class loaded' );
kph_sp_static_assert( method_exists( 'KPH_SP_Signature', 'sign' ), 'signature::sign exists' );
kph_sp_static_assert( method_exists( 'KPH_SP_Signature', 'verify' ), 'signature::verify exists' );

// Admin screen must not leak the stored secret and must show the real state.
$admin_source = file_get_contents( $plugin_dir . '/admin/class-admin-page.php' );
kph_sp_static_assert( false === strpos( $admin_source, 'esc_html( $secret )' ), 'admin screen never echoes the raw secret' );
kph_sp_static_assert( false !== strpos( $admin_source, '$masked' ), 'admin screen masks the stored secret' );
kph_sp_static_assert( false !== strpos( $admin_source, 'Not connected' ), 'honest disconnected state' );
kph_sp_static_assert( false !== strpos( $admin_source, 'id="kph-sp-pair"' ), 'pairing button is present and enabled' );
kph_sp_static_assert( false !== strpos( $admin_source, 'id="kph-sp-unpair"' ), 'disconnect action is present when connected' );
kph_sp_static_assert( false !== strpos( $admin_source, 'kph_sp_save_platform' ), 'platform URL can be configured' );
kph_sp_static_assert( false !== strpos( $admin_source, 'kph_sp_save_rotated' ), 'rotated credentials form is wired' );
kph_sp_static_assert( false !== strpos( $admin_source, 'Recent activity (last 20 jobs)' ), 'admin screen shows recent job activity' );
kph_sp_static_assert( false !== strpos( $admin_source, 'Diagnostic bundle' ), 'admin screen exposes safe diagnostic bundle' );
kph_sp_static_assert( false === strpos( $admin_source, "'siteSecret'" ), 'diagnostic bundle omits secret fields' );
kph_sp_static_assert( false === strpos( $admin_source, "'siteToken'" ), 'diagnostic bundle omits token fields' );
kph_sp_static_assert( false !== strpos( $admin_source, 'wp_localize_script' ), 'admin script receives REST endpoint + nonce' );

// Admin script must use the REST nonce and never hold a site secret.
$admin_js = file_get_contents( $plugin_dir . '/assets/admin.js' );
kph_sp_static_assert( false !== strpos( $admin_js, 'X-WP-Nonce' ), 'admin script sends the REST nonce' );
kph_sp_static_assert( false !== strpos( $admin_js, "request('pair'" ), 'admin script calls the pair route' );
kph_sp_static_assert( false === strpos( $admin_js, 'site_secret' ), 'admin script never reads the stored secret' );
kph_sp_static_assert( false === strpos( $admin_js, 'site_token' ), 'admin script never handles the site token' );

// Capability manifest: bounded, secret-free, and honest about the host.
$capabilities_source = file_get_contents( $plugin_dir . '/includes/class-capabilities.php' );
kph_sp_static_assert( false !== strpos( $capabilities_source, 'public static function manifest' ), 'capabilities::manifest exists' );
kph_sp_static_assert( false !== strpos( $capabilities_source, 'MAX_PLUGINS' ), 'plugin list is capped' );
kph_sp_static_assert( false !== strpos( $capabilities_source, 'wp_is_block_theme' ), 'block theme detection present' );
kph_sp_static_assert( false === strpos( $capabilities_source, 'user_email' ), 'manifest never collects emails' );
kph_sp_static_assert( false === strpos( $capabilities_source, 'site_secret' ), 'manifest never reads credentials' );

// Tool registry: deny by default, scope-gated, allowlisted writes + snapshots.
$tools_source = file_get_contents( $plugin_dir . '/includes/class-tools.php' );
kph_sp_static_assert( false !== strpos( $tools_source, "'site.info'" ), 'site.info tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "kph_sp_unknown_tool" ), 'unknown tools are rejected' );
kph_sp_static_assert( false !== strpos( $tools_source, 'has_scope' ), 'tools check the site scope' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function allowed_seo_meta_keys' ), 'post-meta writes enforce SEO allowlist' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function update_allowlisted_post_meta' ), 'post-meta writes route through single allowlist guard' );
kph_sp_static_assert( 1 === substr_count( $tools_source, 'update_post_meta(' ), 'update_post_meta called only inside update_allowlisted_post_meta' );
kph_sp_static_assert( false === strpos( $tools_source, 'wp_remote_' ), 'tools never make their own HTTP calls' );

// Write tools (0.4.0): declared, scoped, snapshotted, verified, and reversible.
kph_sp_static_assert( false !== strpos( $tools_source, "'content.update'" ), 'content.update tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'content.create'" ), 'content.create tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'content.restore'" ), 'content.restore tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'content' =>" ), 'write tools map to the content scope' );
kph_sp_static_assert( false !== strpos( $tools_source, "'plugins.list'" ), 'plugins.list tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'theme.info'" ), 'theme.info tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'users.list'" ), 'users.list tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'media.list'" ), 'media.list tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'terms.list'" ), 'terms.list tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'site.search'" ), 'site.search tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'terms.create'" ), 'terms.create tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'terms.assign'" ), 'terms.assign tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'terms.restore'" ), 'terms.restore tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, 'wp_set_object_terms' ), 'terms.assign uses wp_set_object_terms' );
kph_sp_static_assert( false === strpos( $tools_source, "user_email" ), 'users.list never returns email addresses' );
kph_sp_static_assert( false === strpos( $tools_source, "user_pass" ), 'users.list never returns password hashes' );
kph_sp_static_assert( 1 === preg_match( "/'media\\.list'\\s*=>\\s*'media'/", $tools_source ), 'media reads require the media scope' );
kph_sp_static_assert( false !== strpos( $tools_source, 'get_taxonomies' ), 'terms.list is limited to public taxonomies' );
kph_sp_static_assert( false !== strpos( $tools_source, "'menus.list'" ), 'menus.list tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, 'wp_get_nav_menu_items' ), 'menus.list reads real menu items' );
kph_sp_static_assert( false !== strpos( $tools_source, "'settings.get'" ), 'settings.get tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'settings.update'" ), 'settings.update tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'settings.restore'" ), 'settings.restore tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function writable_settings_keys' ), 'settings.update enforces a dedicated write allowlist' );
kph_sp_static_assert( 1 === preg_match( "/'settings\\.update'\\s*=>\\s*'site_ops'/", $tools_source ), 'settings.update requires site_ops scope' );
kph_sp_static_assert( false !== strpos( $tools_source, "'blocks.parse'" ), 'blocks.parse tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'blocks.replace'" ), 'blocks.replace tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, 'serialize_blocks' ), 'blocks.replace re-serialises the whole document' );
kph_sp_static_assert( false !== strpos( $tools_source, 'kph_sp_block_not_found' ), 'blocks.replace refuses a missing index' );
kph_sp_static_assert( false !== strpos( $tools_source, 'kph_sp_verification_failed' ) && false !== strpos( $tools_source, 'actualBlocks' ), 'blocks.replace verifies the block structure' );
kph_sp_static_assert( false !== strpos( $tools_source, "'content.publish'" ), 'content.publish tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'content.unpublish'" ), 'content.unpublish tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function load_writable_post' ), 'content reads share one post guard' );kph_sp_static_assert( false !== strpos( $tools_source, 'kph_sp_option_not_allowed' ), 'settings.get refuses options outside its allowlist' );
kph_sp_static_assert( false === strpos( $tools_source, "'auth_key'" ), 'settings.get never exposes salts' );
kph_sp_static_assert( false === strpos( $tools_source, 'db_password' ), 'settings.get never exposes database credentials' );
kph_sp_static_assert( false !== strpos( $tools_source, 'esc_url_raw' ), 'menu item URLs are sanitised' );
kph_sp_static_assert( false !== strpos( $tools_source, 'is_writable_type' ), 'write tools refuse unsupported post types' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function snapshot' ), 'write tools take a before-snapshot' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function read_back' ), 'write tools read the post back' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function verify' ), 'write tools verify the result' );
kph_sp_static_assert( false !== strpos( $tools_source, 'kph_sp_verification_failed' ), 'verification failures are reported by code' );
kph_sp_static_assert( false !== strpos( $tools_source, 'wp_slash' ), 'content is slashed before wp_update_post' );
kph_sp_static_assert( false !== strpos( $tools_source, 'wp_kses_post' ), 'write tools sanitise content' );
kph_sp_static_assert( false !== strpos( $tools_source, "'draft' =>" ) || false !== strpos( $tools_source, "'draft'," ), 'create defaults to draft' );
kph_sp_static_assert( false === strpos( $tools_source, "'content.delete'" ), 'no content.delete tool exists' );
kph_sp_static_assert( 1 === substr_count( $tools_source, 'wp_delete_post(' ) && false !== strpos( $tools_source, "'nav_menu_item' === get_post_type" ), 'wp_delete_post is restricted solely to nav_menu_item replacement' );
kph_sp_static_assert( false === strpos( $tools_source, 'unfiltered_html' ), 'write tools never grant unfiltered HTML' );
kph_sp_static_assert( false !== strpos( $tools_source, "'site.logs'" ), 'site.logs tool registered (E4-05)' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function redact_log_line' ), 'site.logs redacts paths, emails, and tokens' );
kph_sp_static_assert( false !== strpos( $tools_source, "'seo.meta.get'" ), 'seo.meta.get tool registered (E7-01)' );
kph_sp_static_assert( false !== strpos( $tools_source, "'seo.meta.update'" ), 'seo.meta.update tool registered (E7-02)' );
kph_sp_static_assert( false !== strpos( $tools_source, "'seo.meta.restore'" ), 'seo.meta.restore tool registered (E7-02)' );
kph_sp_static_assert( false !== strpos( $tools_source, "'media.update'" ), 'media.update tool registered (E5-10)' );
kph_sp_static_assert( false !== strpos( $tools_source, "'media.restore'" ), 'media.restore tool registered (E5-10)' );
kph_sp_static_assert( false !== strpos( $tools_source, "'media.set_featured'" ), 'media.set_featured tool registered (E5-10)' );
kph_sp_static_assert( false !== strpos( $tools_source, "'media.restore_featured'" ), 'media.restore_featured tool registered (E5-10)' );
kph_sp_static_assert( false !== strpos( $tools_source, "'menus.save'" ), 'menus.save tool registered (E5-13)' );
kph_sp_static_assert( false !== strpos( $tools_source, "'menus.restore'" ), 'menus.restore tool registered (E5-13)' );
kph_sp_static_assert( false !== strpos( $tools_source, 'preventDuplicateSlug' ), 'content.create guards duplicate slugs (E5-02)' );
kph_sp_static_assert( false !== strpos( $tools_source, 'uploadsFreeBytes' ), 'site.health reports uploads disk stats (E4-03)' );

// Job runner: signed, outbound-only, lease-safe.
$runner_source = file_get_contents( $plugin_dir . '/includes/class-job-runner.php' );
kph_sp_static_assert( false !== strpos( $runner_source, 'KPH_SP_Signature::sign' ), 'runner signs every request' );
kph_sp_static_assert( false !== strpos( $runner_source, 'X-SitePilot-Signature' ), 'runner sends the signature header' );
kph_sp_static_assert( false !== strpos( $runner_source, "random_bytes( 16 )" ), 'runner nonce has 128 bits of entropy' );
kph_sp_static_assert( false !== strpos( $runner_source, 'LOCK_TRANSIENT' ), 'runner prevents overlapping polls' );
kph_sp_static_assert( false !== strpos( $runner_source, 'is_connected' ), 'runner refuses to run while unpaired' );
kph_sp_static_assert( false === strpos( $runner_source, 'error_log' ), 'runner never logs payloads' );
kph_sp_static_assert( false === strpos( $runner_source, "'secret' =>" ), 'runner never puts the secret in a payload' );
kph_sp_static_assert( false === strpos( $runner_source, 'print_r' ), 'runner never dumps request data' );
kph_sp_static_assert( false !== strpos( $runner_source, "'retryable'" ), 'runner classifies retryable failures' );
kph_sp_static_assert( false !== strpos( $runner_source, "'snapshot'" ), 'runner forwards the before-snapshot for undo' );
kph_sp_static_assert( false !== strpos( $runner_source, 'SITE_REVOKED' ), 'runner reacts to a revoked connection' );
kph_sp_static_assert( false !== strpos( $runner_source, 'function disconnect' ), 'runner can forget dead credentials' );
kph_sp_static_assert( false !== strpos( $runner_source, 'wp_schedule_single_event' ), 'live polls are scheduled as single events' );
kph_sp_static_assert( false !== strpos( $runner_source, 'LIVE_POLL_SECONDS' ), 'live mode polls every five seconds' );
kph_sp_static_assert( false !== strpos( $runner_source, 'IDLE_BACKOFF_AFTER' ), 'idle sites back off after an hour' );
kph_sp_static_assert( false !== strpos( $runner_source, 'function current_job' ), 'the fatal handler can see the running job' );
kph_sp_static_assert( false !== strpos( $runner_source, 'function report_failure' ), 'a failure can be reported outside the normal path' );
kph_sp_static_assert( false !== strpos( $runner_source, 'RECENT_JOBS_OPTION' ), 'runner stores bounded recent job activity' );
kph_sp_static_assert( false !== strpos( $runner_source, 'snapshotResource' ), 'runner forwards settings snapshots as well as post snapshots' );

// Fatal capture: a tool that dies must still produce a result.
$fatal_source = file_get_contents( $plugin_dir . '/includes/class-fatal.php' );
kph_sp_static_assert( false !== strpos( $fatal_source, 'register_shutdown_function' ), 'fatal handler runs at shutdown' );
kph_sp_static_assert( false !== strpos( $fatal_source, 'error_get_last' ), 'fatal handler reads the real error' );
kph_sp_static_assert( false !== strpos( $fatal_source, 'redact_paths' ), 'fatal messages are redacted before leaving the site' );
kph_sp_static_assert( false !== strpos( $fatal_source, 'kph_sp_fatal_error' ), 'fatals are reported as a typed job failure' );
kph_sp_static_assert( false === strpos( $fatal_source, 'error_log' ), 'fatal handler never writes to the PHP error log' );
kph_sp_static_assert( false === strpos( $fatal_source, 'var_dump' ), 'fatal handler never dumps data' );

// Cron wiring: one-minute poll scheduled on activation, cleared on deactivate.
$plugin_source_wiring = file_get_contents( $plugin_dir . '/includes/class-plugin.php' );
kph_sp_static_assert( false !== strpos( $plugin_source_wiring, 'kph_sp_minute' ), 'one-minute cron schedule registered' );
kph_sp_static_assert( false !== strpos( $plugin_source_wiring, "wp_schedule_event" ), 'poll scheduled on activation' );
kph_sp_static_assert( false !== strpos( $plugin_source_wiring, 'KPH_SP_Job_Runner' ), 'cron invokes the runner' );

// Pairing endpoints: admin-only, HTTPS-aware, and never return credentials.
$pairing_source = file_get_contents( $plugin_dir . '/includes/class-pairing.php' );
kph_sp_static_assert( false !== strpos( $pairing_source, 'register_rest_route' ), 'pairing routes registered' );
kph_sp_static_assert( false !== strpos( $pairing_source, "current_user_can( 'manage_options' )" ), 'pairing requires an administrator' );
kph_sp_static_assert( false !== strpos( $pairing_source, 'wp_remote_post' ), 'pairing calls the platform over HTTP' );
kph_sp_static_assert( false !== strpos( $pairing_source, "'/api/connector/pair'" ), 'pairing targets the documented endpoint' );
kph_sp_static_assert( false !== strpos( $pairing_source, "'/api/connector/unpair'" ), 'unpair is reported to the platform' );
kph_sp_static_assert( false !== strpos( $pairing_source, 'KPH_SP_Job_Runner::disconnect' ), 'unpair clears credentials through one code path' );
kph_sp_static_assert( false !== strpos( $pairing_source, "'revoked' =>" ), 'the admin sees whether the platform accepted the revoke' );
kph_sp_static_assert( false === strpos( $pairing_source, 'error_log' ), 'pairing never logs request or response bodies' );
kph_sp_static_assert( false === strpos( $pairing_source, "'secret'" . ' =>' ), 'pairing response never returns the secret' );
kph_sp_static_assert( false === strpos( $pairing_source, "'token'" . ' =>' ), 'pairing response never returns the token' );
kph_sp_static_assert( false !== strpos( $pairing_source, "'token' :" ) || false !== strpos( $pairing_source, "credentials['token']" ), 'pairing reads credentials from the platform response' );

if ( $failures > 0 ) {
	fwrite( STDERR, "\nConnector static checks FAILED: {$failures} of {$checks} assertions.\n" );
	exit( 1 );
}

echo "Connector static checks PASSED ({$checks} assertions).\n";
exit( 0 );

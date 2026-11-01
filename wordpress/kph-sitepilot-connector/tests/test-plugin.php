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

// Tool registry: deny by default, scope-gated, read-only in this build.
$tools_source = file_get_contents( $plugin_dir . '/includes/class-tools.php' );
kph_sp_static_assert( false !== strpos( $tools_source, "'site.info'" ), 'site.info tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "kph_sp_unknown_tool" ), 'unknown tools are rejected' );
kph_sp_static_assert( false !== strpos( $tools_source, 'has_scope' ), 'tools check the site scope' );
kph_sp_static_assert( false === strpos( $tools_source, 'update_post_meta' ), 'tools never touch post meta' );
kph_sp_static_assert( false === strpos( $tools_source, 'wp_remote_' ), 'tools never make their own HTTP calls' );

// Write tools (0.4.0): declared, scoped, snapshotted, verified, and reversible.
kph_sp_static_assert( false !== strpos( $tools_source, "'content.update'" ), 'content.update tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'content.create'" ), 'content.create tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'content.restore'" ), 'content.restore tool registered' );
kph_sp_static_assert( false !== strpos( $tools_source, "'content' =>" ), 'write tools map to the content scope' );
kph_sp_static_assert( false !== strpos( $tools_source, 'is_writable_type' ), 'write tools refuse unsupported post types' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function snapshot' ), 'write tools take a before-snapshot' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function read_back' ), 'write tools read the post back' );
kph_sp_static_assert( false !== strpos( $tools_source, 'function verify' ), 'write tools verify the result' );
kph_sp_static_assert( false !== strpos( $tools_source, 'kph_sp_verification_failed' ), 'verification failures are reported by code' );
kph_sp_static_assert( false !== strpos( $tools_source, 'wp_slash' ), 'content is slashed before wp_update_post' );
kph_sp_static_assert( false !== strpos( $tools_source, 'wp_kses_post' ), 'write tools sanitise content' );
kph_sp_static_assert( false !== strpos( $tools_source, "'draft' =>" ) || false !== strpos( $tools_source, "'draft'," ), 'create defaults to draft' );
kph_sp_static_assert( false === strpos( $tools_source, 'delete_post' ), 'write tools never delete content' );
kph_sp_static_assert( false === strpos( $tools_source, 'unfiltered_html' ), 'write tools never grant unfiltered HTML' );

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

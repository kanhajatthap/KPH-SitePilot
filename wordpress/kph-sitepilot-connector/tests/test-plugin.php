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

// Admin screen must not leak the stored secret and must not fake a connection.
$admin_source = file_get_contents( $plugin_dir . '/admin/class-admin-page.php' );
kph_sp_static_assert( false === strpos( $admin_source, 'esc_html( $secret )' ), 'admin screen never echoes the raw secret' );
kph_sp_static_assert( false !== strpos( $admin_source, '$masked' ), 'admin screen masks the stored secret' );
kph_sp_static_assert( false !== strpos( $admin_source, 'disabled' ), 'pairing controls disabled until M2' );
kph_sp_static_assert( false !== strpos( $admin_source, 'Not connected' ), 'honest disconnected state' );

if ( $failures > 0 ) {
	fwrite( STDERR, "\nConnector static checks FAILED: {$failures} of {$checks} assertions.\n" );
	exit( 1 );
}

echo "Connector static checks PASSED ({$checks} assertions).\n";
exit( 0 );

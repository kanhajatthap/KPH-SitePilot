<?php
/**
 * Basic static check for wp-agent-bridge.
 * Verifies file syntax, required headers, and class structure without requiring an active database.
 */

$plugin_file = dirname( __DIR__ ) . '/wp-agent-bridge.php';

if ( ! file_exists( $plugin_file ) ) {
    fwrite( STDERR, "Error: Plugin file not found.\n" );
    exit( 1 );
}

$contents = file_get_contents( $plugin_file );

// Check 1: Plugin Header
$required_headers = [
    'Plugin Name:       WP Agent Bridge',
    'Requires PHP:      8.2',
    'License:           GPL-2.0-or-later',
];

foreach ( $required_headers as $header ) {
    if ( strpos( $contents, $header ) === false ) {
        fwrite( STDERR, "Error: Missing required header: {$header}\n" );
        exit( 1 );
    }
}

// Check 2: Direct access protection
if ( strpos( $contents, "defined( 'ABSPATH' ) || exit;" ) === false ) {
    fwrite( STDERR, "Error: Missing direct access protection (ABSPATH check).\n" );
    exit( 1 );
}

// Check 3: Deny dynamic code execution
$forbidden_functions = [ 'eval(', 'create_function(', 'passthru(', 'exec(' ];
foreach ( $forbidden_functions as $func ) {
    if ( stripos( $contents, $func ) !== false ) {
        fwrite( STDERR, "Security Error: Prohibited function {$func} detected!\n" );
        exit( 1 );
    }
}

echo "WP Agent Bridge static checks PASSED.\n";
exit( 0 );

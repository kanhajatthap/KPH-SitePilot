<?php
/**
 * Cross-language protocol test: the PHP signer must match the TypeScript signer
 * for every shared fixture. Run with `php tests/test-protocol.php`.
 *
 * @package KPH_SitePilot_Connector
 */

define( 'ABSPATH', __DIR__ . '/' );

require_once dirname( __DIR__ ) . '/includes/class-signature.php';

$repo_root    = dirname( __DIR__, 3 );
$fixture_path = $repo_root . '/packages/connector-protocol/tests/fixtures/signature-cases.json';

if ( ! is_readable( $fixture_path ) ) {
	fwrite( STDERR, "Error: shared fixtures not found at {$fixture_path}\n" );
	exit( 1 );
}

$fixtures = json_decode( file_get_contents( $fixture_path ), true );

if ( ! is_array( $fixtures ) || ! isset( $fixtures['cases'] ) || ! is_array( $fixtures['cases'] ) ) {
	fwrite( STDERR, "Error: fixtures are malformed.\n" );
	exit( 1 );
}

$failures = 0;
$checks   = 0;

/**
 * Records an assertion result.
 *
 * @param bool   $condition Assertion outcome.
 * @param string $label     Human-readable assertion label.
 */
function kph_sp_assert( $condition, $label ) {
	global $failures, $checks;
	$checks++;
	if ( ! $condition ) {
		$failures++;
		fwrite( STDERR, "FAIL: {$label}\n" );
	}
}

foreach ( $fixtures['cases'] as $case ) {
	$name = isset( $case['name'] ) ? $case['name'] : 'unnamed';

	$canonical = KPH_SP_Signature::canonical( $case['timestamp'], $case['nonce'], $case['body'] );
	kph_sp_assert( $canonical === $case['expectedCanonical'], "{$name}: canonical string" );

	$signature = KPH_SP_Signature::sign( $case['secret'], $case['timestamp'], $case['nonce'], $case['body'] );
	kph_sp_assert( $signature === $case['expectedSignature'], "{$name}: signature matches TS" );

	$valid = KPH_SP_Signature::verify(
		$case['secret'],
		$case['timestamp'],
		$case['nonce'],
		$case['expectedSignature'],
		$case['body'],
		(int) $case['timestamp']
	);
	kph_sp_assert( true === $valid['ok'], "{$name}: valid signature accepted" );

	$tampered = KPH_SP_Signature::verify(
		$case['secret'],
		$case['timestamp'],
		$case['nonce'],
		$case['expectedSignature'],
		$case['body'] . ' ',
		(int) $case['timestamp']
	);
	kph_sp_assert( false === $tampered['ok'] && 'invalid_signature' === $tampered['code'], "{$name}: tampered body rejected" );

	$wrong_secret = KPH_SP_Signature::verify(
		'not-the-right-secret-value',
		$case['timestamp'],
		$case['nonce'],
		$case['expectedSignature'],
		$case['body'],
		(int) $case['timestamp']
	);
	kph_sp_assert( false === $wrong_secret['ok'], "{$name}: wrong secret rejected" );

	$stale = KPH_SP_Signature::verify(
		$case['secret'],
		$case['timestamp'],
		$case['nonce'],
		$case['expectedSignature'],
		$case['body'],
		(int) $case['timestamp'] + 301
	);
	kph_sp_assert( false === $stale['ok'] && 'timestamp_out_of_window' === $stale['code'], "{$name}: stale timestamp rejected" );
}

// Boundary: exactly +300s must still pass.
$first = $fixtures['cases'][0];
$boundary = KPH_SP_Signature::verify(
	$first['secret'],
	$first['timestamp'],
	$first['nonce'],
	$first['expectedSignature'],
	$first['body'],
	(int) $first['timestamp'] + 300
);
kph_sp_assert( true === $boundary['ok'], 'boundary: +300s accepted' );

// Malformed inputs.
$bad_nonce = KPH_SP_Signature::verify(
	$first['secret'],
	$first['timestamp'],
	strtoupper( $first['nonce'] ),
	$first['expectedSignature'],
	$first['body'],
	(int) $first['timestamp']
);
kph_sp_assert( false === $bad_nonce['ok'] && 'invalid_nonce' === $bad_nonce['code'], 'uppercase nonce rejected' );

$bad_timestamp = KPH_SP_Signature::verify(
	$first['secret'],
	'12.5',
	$first['nonce'],
	$first['expectedSignature'],
	$first['body'],
	(int) $first['timestamp']
);
kph_sp_assert( false === $bad_timestamp['ok'] && 'invalid_timestamp' === $bad_timestamp['code'], 'non-integer timestamp rejected' );

if ( $failures > 0 ) {
	fwrite( STDERR, "\nProtocol checks FAILED: {$failures} of {$checks} assertions.\n" );
	exit( 1 );
}

echo "Connector protocol checks PASSED ({$checks} assertions across " . count( $fixtures['cases'] ) . " fixtures).\n";
exit( 0 );

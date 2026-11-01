<?php
/**
 * Signed request protocol (PHP side).
 *
 * This file MUST stay byte-identical in behaviour to
 * `packages/connector-protocol/src/index.ts`. Shared fixtures live in
 * `packages/connector-protocol/tests/fixtures/signature-cases.json` and are
 * executed by both test suites.
 *
 * Canonical string: <timestamp>.<nonce>.<sha256hex(rawBody)>
 * Signature:        hex(HMAC-SHA256(secret, canonicalString))
 *
 * The raw request body is signed. Never re-encode a decoded JSON payload
 * before verifying: key order and unicode escaping change the digest.
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'KPH_SP_Signature' ) ) {
	/**
	 * Builds and verifies connector request signatures.
	 */
	final class KPH_SP_Signature {

		const TIMESTAMP_WINDOW = 300;
		const MAX_BODY_BYTES   = 262144;

		/**
		 * Returns the canonical string that gets signed.
		 *
		 * @param string|int $timestamp Unix seconds.
		 * @param string     $nonce     32 lowercase hex characters.
		 * @param string     $body      Raw request body.
		 * @return string
		 */
		public static function canonical( $timestamp, $nonce, $body ) {
			return (string) $timestamp . '.' . (string) $nonce . '.' . hash( 'sha256', (string) $body );
		}

		/**
		 * Signs a request body.
		 *
		 * @param string     $secret    Per-site secret (min 16 chars).
		 * @param string|int $timestamp Unix seconds.
		 * @param string     $nonce     32 lowercase hex characters.
		 * @param string     $body      Raw request body.
		 * @return string 64 lowercase hex characters.
		 * @throws InvalidArgumentException When the secret is too short.
		 */
		public static function sign( $secret, $timestamp, $nonce, $body ) {
			if ( ! is_string( $secret ) || strlen( $secret ) < 16 ) {
				throw new InvalidArgumentException( 'Connector secret must be at least 16 characters.' );
			}

			return hash_hmac( 'sha256', self::canonical( $timestamp, $nonce, $body ), $secret );
		}

		/**
		 * Verifies a signed request.
		 *
		 * @param string     $secret    Per-site secret.
		 * @param string|int $timestamp Unix seconds from the header.
		 * @param string     $nonce     Nonce from the header.
		 * @param string     $signature Signature from the header.
		 * @param string     $body      Raw request body.
		 * @param int|null   $now       Injectable clock (tests).
		 * @param int        $window    Allowed clock skew in seconds.
		 * @return array{ok:bool,code:?string,message:string}
		 */
		public static function verify( $secret, $timestamp, $nonce, $signature, $body, $now = null, $window = self::TIMESTAMP_WINDOW ) {
			$now = null === $now ? time() : (int) $now;

			if ( ! preg_match( '/^\d{1,12}$/', (string) $timestamp ) ) {
				return self::failure( 'invalid_timestamp', 'Timestamp header must be unix seconds.' );
			}

			if ( ! preg_match( '/^[a-f0-9]{32}$/', (string) $nonce ) ) {
				return self::failure( 'invalid_nonce', 'Nonce must be 32 lowercase hex characters.' );
			}

			if ( ! preg_match( '/^[a-f0-9]{64}$/', (string) $signature ) ) {
				return self::failure( 'invalid_signature', 'Signature must be 64 lowercase hex characters.' );
			}

			if ( strlen( (string) $body ) > self::MAX_BODY_BYTES ) {
				return self::failure( 'body_too_large', 'Request body exceeds the connector limit.' );
			}

			if ( abs( $now - (int) $timestamp ) > (int) $window ) {
				return self::failure( 'timestamp_out_of_window', 'Timestamp is outside the allowed window.' );
			}

			$expected = self::sign( $secret, $timestamp, $nonce, $body );

			if ( ! hash_equals( $expected, (string) $signature ) ) {
				return self::failure( 'invalid_signature', 'Signature does not match the request body.' );
			}

			return array(
				'ok'      => true,
				'code'    => null,
				'message' => '',
			);
		}

		/**
		 * Builds the failure shape shared with the TypeScript implementation.
		 *
		 * @param string $code    Error code.
		 * @param string $message Human-readable message.
		 * @return array{ok:bool,code:string,message:string}
		 */
		private static function failure( $code, $message ) {
			return array(
				'ok'      => false,
				'code'    => $code,
				'message' => $message,
			);
		}
	}
}

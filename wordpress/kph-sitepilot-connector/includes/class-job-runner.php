<?php
/**
 * Outbound job runner.
 *
 * The site never accepts inbound connections: it signs a request, asks the
 * platform for work, executes at most one allowlisted job, and reports the
 * result. Every request is a fresh HMAC over the exact JSON body.
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'KPH_SP_Job_Runner' ) ) {
	/**
	 * Polls the platform and reports results.
	 */
	final class KPH_SP_Job_Runner {

		const LOCK_TRANSIENT          = 'kph_sp_poll_lock';
		const CONTACT_TRANSIENT       = 'kph_sp_last_heartbeat';
		const HEARTBEAT_INTERVAL      = 300; // seconds
		const REQUEST_TIMEOUT         = 20;
		const MAX_RESPONSE_BYTES      = 1048576;

		/**
		 * Connector endpoints, signed with the site secret.
		 */
		const PATH_CLAIM    = '/api/connector/jobs/claim';
		const PATH_HEARTBEAT = '/api/connector/heartbeat';
		const PATH_RESULT   = '/api/connector/jobs/%s/result';

		/**
		 * Sends a signed request to the platform.
		 *
		 * @param string              $path    Endpoint path beginning with /.
		 * @param array<string,mixed> $payload JSON payload.
		 * @return array<string,mixed>|WP_Error
		 */
		public static function request( $path, $payload = array() ) {
			if ( ! KPH_SP_Settings::is_connected() ) {
				return new WP_Error( 'kph_sp_not_connected', 'This site is not connected to SitePilot.' );
			}

			$settings = KPH_SP_Settings::all();
			$base     = KPH_SP_Pairing::platform_base_url();

			if ( '' === $base ) {
				return new WP_Error( 'kph_sp_missing_platform', 'The SitePilot platform URL is not set.' );
			}

			$body      = (string) wp_json_encode( $payload );
			$timestamp = time();
			$nonce     = bin2hex( random_bytes( 16 ) );
			$signature = KPH_SP_Signature::sign( (string) $settings['site_secret'], $timestamp, $nonce, $body );

			$response = wp_remote_post(
				$base . $path,
				array(
					'timeout'     => self::REQUEST_TIMEOUT,
					'redirection' => 0,
					'headers'     => array(
						'Content-Type'         => 'application/json',
						'Accept'               => 'application/json',
						'X-SitePilot-Site'      => (string) $settings['site_id'],
						'X-SitePilot-Timestamp' => (string) $timestamp,
						'X-SitePilot-Nonce'     => $nonce,
						'X-SitePilot-Signature' => $signature,
					),
					'body'        => $body,
				)
			);

			if ( is_wp_error( $response ) ) {
				return $response;
			}

			$status = (int) wp_remote_retrieve_response_code( $response );
			$raw     = (string) wp_remote_retrieve_body( $response );

			if ( strlen( $raw ) > self::MAX_RESPONSE_BYTES ) {
				return new WP_Error( 'kph_sp_response_too_large', 'The platform response was too large.' );
			}

			$decoded = json_decode( $raw, true );

			if ( $status < 200 || $status >= 300 ) {
				$message = is_array( $decoded ) && isset( $decoded['message'] )
					? (string) $decoded['message']
					: sprintf( 'SitePilot returned HTTP %d.', $status );

				if ( 401 === $status || 403 === $status ) {
					self::record_contact( 'unauthorised', $message );
				}

				return new WP_Error( 'kph_sp_platform_error', $message, array( 'status' => $status ) );
			}

			return is_array( $decoded ) ? $decoded : array();
		}

		/**
		 * Sends a heartbeat with the capability manifest (throttled).
		 *
		 * @param bool $force Send even when the last heartbeat was recent.
		 * @return bool True when the platform acknowledged.
		 */
		public static function heartbeat( $force = false ) {
			$last = (int) get_transient( self::CONTACT_TRANSIENT );
			if ( ! $force && $last > 0 && ( time() - $last ) < self::HEARTBEAT_INTERVAL ) {
				return true;
			}

			$manifest = KPH_SP_Capabilities::manifest();
			$result   = self::request(
				self::PATH_HEARTBEAT,
				array(
					'pluginVersion' => KPH_SP_VERSION,
					'wpVersion'     => get_bloginfo( 'version' ),
					'phpVersion'    => PHP_VERSION,
					'capabilities'  => $manifest,
				)
			);

			if ( is_wp_error( $result ) ) {
				return false;
			}

			set_transient( self::CONTACT_TRANSIENT, time(), 6 * HOUR_IN_SECONDS );

			return true;
		}

		/**
		 * Claims and executes at most one job.
		 *
		 * Overlapping cron runs are prevented with a transient lock, because a
		 * slow host can easily take longer than the cron interval.
		 *
		 * @return array<string,mixed> Summary for logs/tests.
		 */
		public static function poll() {
			$summary = array(
				'polled'   => false,
				'jobId'    => '',
				'tool'     => '',
				'ok'       => false,
				'skipped'  => '',
			);

			if ( ! KPH_SP_Settings::is_connected() ) {
				$summary['skipped'] = 'not_connected';
				return $summary;
			}

			if ( get_transient( self::LOCK_TRANSIENT ) ) {
				$summary['skipped'] = 'locked';
				return $summary;
			}

			set_transient( self::LOCK_TRANSIENT, 1, self::REQUEST_TIMEOUT * 3 );

			$claim = self::request( self::PATH_CLAIM, array() );
			if ( is_wp_error( $claim ) ) {
				delete_transient( self::LOCK_TRANSIENT );
				$summary['skipped'] = 'claim_failed';
				return $summary;
			}

			$summary['polled'] = true;
			$job               = isset( $claim['job'] ) && is_array( $claim['job'] ) ? $claim['job'] : null;

			if ( ! $job ) {
				self::heartbeat();
				delete_transient( self::LOCK_TRANSIENT );
				$summary['skipped'] = 'idle';
				return $summary;
			}

			$job_id = isset( $job['id'] ) ? (string) $job['id'] : '';
			$tool   = isset( $job['tool'] ) ? (string) $job['tool'] : '';
			$args   = isset( $job['args'] ) && is_array( $job['args'] ) ? $job['args'] : array();

			$summary['jobId'] = $job_id;
			$summary['tool']  = $tool;

			$started = microtime( true );
			$result  = KPH_SP_Tools::execute( $tool, $args );
			$elapsed = (int) round( ( microtime( true ) - $started ) * 1000 );

			if ( is_wp_error( $result ) ) {
				$payload = array(
					'jobId'     => $job_id,
					'ok'        => false,
					'error'     => array(
						'code'    => (string) $result->get_error_code(),
						'message' => (string) $result->get_error_message(),
					),
					// Unknown tool / missing scope will not fix themselves.
					'retryable' => ! in_array( $result->get_error_code(), array( 'kph_sp_unknown_tool', 'kph_sp_scope_missing' ), true ),
					'durationMs' => $elapsed,
				);
			} else {
				$payload = array(
					'jobId'      => $job_id,
					'ok'         => true,
					'result'     => $result,
					'durationMs' => $elapsed,
				);
				$summary['ok'] = true;
			}

			$report = self::request( sprintf( self::PATH_RESULT, rawurlencode( $job_id ) ), $payload );

			delete_transient( self::LOCK_TRANSIENT );

			if ( is_wp_error( $report ) ) {
				$summary['ok'] = false;
				// The lease expires on the platform, so the job is retried safely.
				update_option( 'kph_sp_last_job_error', (string) $report->get_error_message(), false );
			} else {
				delete_option( 'kph_sp_last_job_error' );
			}

			return $summary;
		}

		/**
		 * Records the last contact attempt for the admin screen.
		 *
		 * @param string $state   Short machine state.
		 * @param string $message Human message.
		 */
		public static function record_contact( $state, $message = '' ) {
			update_option(
				'kph_sp_last_contact',
				array(
					'state'   => (string) $state,
					'message' => (string) $message,
					'at'      => gmdate( 'c' ),
				),
				false
			);
		}
	}
}

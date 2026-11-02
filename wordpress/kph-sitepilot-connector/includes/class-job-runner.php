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
		const LAST_JOB_OPTION         = 'kph_sp_last_job_at';
		const RECENT_JOBS_OPTION      = 'kph_sp_recent_jobs';
		const MAX_RECENT_JOBS         = 20;
		const HEARTBEAT_INTERVAL      = 300; // seconds
		const LIVE_POLL_SECONDS       = 5;
		const MINUTE_POLL_SECONDS     = 60;
		const IDLE_POLL_SECONDS       = 300;
		const IDLE_BACKOFF_AFTER      = 3600; // one hour without work
		const REQUEST_TIMEOUT         = 20;
		const MAX_RESPONSE_BYTES      = 1048576;

		/**
		 * The job currently executing, or null. Read by KPH_SP_Fatal so a fatal
		 * during a tool can still be reported as a job failure.
		 *
		 * @var array<string,mixed>|null
		 */
		private static $current_job = null;

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

				if ( 403 === $status && is_array( $decoded ) && isset( $decoded['error'] ) && 'SITE_REVOKED' === $decoded['error'] ) {
					// The owner revoked this connection in SitePilot. Drop the local
					// credentials so the site stops signing requests with a dead secret.
					self::disconnect();
					self::record_contact( 'revoked', $message );
				} elseif ( 401 === $status || 403 === $status ) {
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
		 * @param string $context 'live' for a short-delay poll, empty for cron.
		 * @return array<string,mixed> Summary for logs/tests.
		 */
		public static function poll( $context = '' ) {
			$summary = array(
				'polled'   => false,
				'jobId'    => '',
				'tool'     => '',
				'ok'       => false,
				'skipped'  => '',
				'context'  => (string) $context,
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
				self::schedule_next( self::idle_poll_seconds() );
				$summary['skipped'] = 'idle';
				return $summary;
			}

			$job_id = isset( $job['id'] ) ? (string) $job['id'] : '';
			$tool   = isset( $job['tool'] ) ? (string) $job['tool'] : '';
			$args   = isset( $job['args'] ) && is_array( $job['args'] ) ? $job['args'] : array();

			$summary['jobId'] = $job_id;
			$summary['tool']  = $tool;

			self::$current_job = array(
				'id'      => $job_id,
				'tool'    => $tool,
				'started' => microtime( true ),
			);

			$started = microtime( true );
			$result  = KPH_SP_Tools::execute( $tool, $args );
			$elapsed = (int) round( ( microtime( true ) - $started ) * 1000 );
			self::$current_job = null;

			if ( is_wp_error( $result ) ) {
				$error_code = (string) $result->get_error_code();
				$non_retry  = array(
					'kph_sp_unknown_tool',
					'kph_sp_scope_missing',
					'kph_sp_option_not_allowed',
					'kph_sp_invalid_taxonomy',
					'kph_sp_invalid_argument',
				);
				$payload    = array(
					'jobId'     => $job_id,
					'ok'        => false,
					'error'     => array(
						'code'    => $error_code,
						'message' => (string) $result->get_error_message(),
					),
					// Unknown tool / missing scope / disallowed option will not fix themselves.
					'retryable' => ! in_array( $error_code, $non_retry, true ),
					'durationMs' => $elapsed,
				);
				self::record_activity( $job_id, $tool, false, $elapsed, $error_code );
			} else {
				$payload = array(
					'jobId'      => $job_id,
					'ok'         => true,
					'result'     => $result,
					'durationMs' => $elapsed,
				);
				$summary['ok'] = true;

				// Mutation tools return the pre-write state; forward it so the
				// platform can offer a one-click undo even if the user closes the tab.
				if ( is_array( $result ) && isset( $result['snapshotResource'] ) && is_string( $result['snapshotResource'] ) && isset( $result['before'] ) && is_array( $result['before'] ) ) {
					$payload['snapshot'] = array(
						'resource' => $result['snapshotResource'],
						'before'   => $result['before'],
						'after'    => isset( $result['after'] ) && is_array( $result['after'] ) ? $result['after'] : null,
					);
				} elseif ( is_array( $result ) && isset( $result['before'] ) && is_array( $result['before'] ) && ! empty( $result['id'] ) ) {
					$payload['snapshot'] = array(
						'resource' => 'post:' . (int) $result['id'],
						'before'   => $result['before'],
						'after'    => isset( $result['after'] ) && is_array( $result['after'] ) ? $result['after'] : null,
					);
				}

				self::record_activity( $job_id, $tool, true, $elapsed, '' );
			}

			$report = self::request( sprintf( self::PATH_RESULT, rawurlencode( $job_id ) ), $payload );

			delete_transient( self::LOCK_TRANSIENT );

			if ( is_wp_error( $report ) ) {
				$summary['ok'] = false;
				// The lease expires on the platform, so the job is retried safely.
				update_option( 'kph_sp_last_job_error', (string) $report->get_error_message(), false );
			} else {
				delete_option( 'kph_sp_last_job_error' );
				update_option( self::LAST_JOB_OPTION, time(), false );
			}

			// A job just ran, so more work may be queued behind it: poll again in
			// five seconds instead of waiting for the next minute.
			self::schedule_next( self::LIVE_POLL_SECONDS );

			return $summary;
		}

		/**
		 * Schedules one extra poll, replacing any pending one.
		 *
		 * The recurring cron stays as the floor; this only shortens the gap while
		 * the platform is actively sending work. The single event carries an
		 * argument so clearing it never touches the recurring schedule.
		 *
		 * @param int $seconds Delay in seconds; 0 clears the pending poll.
		 */
		public static function schedule_next( $seconds ) {
			$args = array( 'live' );
			wp_clear_scheduled_hook( KPH_SP_CRON_HOOK, $args );

			$seconds = (int) $seconds;
			if ( $seconds <= 0 ) {
				return;
			}

			wp_schedule_single_event( time() + $seconds, KPH_SP_CRON_HOOK, $args );
		}

		/**
		 * How long to wait before the next poll.
		 *
		 * 5 s right after work, one minute while the site looks active, and five
		 * minutes once nothing has happened for an hour — the platform gets a
		 * cheap, predictable heartbeat instead of a busy loop.
		 *
		 * @return int
		 */
		public static function idle_poll_seconds() {
			$last = (int) get_option( self::LAST_JOB_OPTION, 0 );

			if ( $last > 0 && ( time() - $last ) > self::IDLE_BACKOFF_AFTER ) {
				return self::IDLE_POLL_SECONDS;
			}

			return self::MINUTE_POLL_SECONDS;
		}

		/**
		 * The job currently executing (for the fatal handler).
		 *
		 * @return array<string,mixed>|null
		 */
		public static function current_job() {
			return is_array( self::$current_job ) ? self::$current_job : null;
		}

		/**
		 * Reports a failure for a job the site could not finish itself.
		 *
		 * @param string $job_id    Job identifier.
		 * @param string $code      Error code reported to the platform.
		 * @param string $message   Human-readable message (already redacted).
		 * @param bool   $retryable Whether the platform may run it again.
		 * @param int    $duration  Milliseconds the job ran for.
		 * @return bool
		 */
		public static function report_failure( $job_id, $code, $message, $retryable = true, $duration = 0 ) {
			if ( '' === (string) $job_id ) {
				return false;
			}

			$payload = array(
				'jobId'      => (string) $job_id,
				'ok'         => false,
				'error'      => array(
					'code'    => (string) $code,
					'message' => (string) $message,
				),
				'retryable'  => (bool) $retryable,
				'durationMs' => (int) $duration,
			);

			$report = self::request( sprintf( self::PATH_RESULT, rawurlencode( (string) $job_id ) ), $payload );

			return ! is_wp_error( $report );
		}

		/**
		 * Records the last contact attempt for the admin screen.
		 *
		 * @param string $state   Short machine state.
		 * @param string $message Human message.
		 */
		/**
		 * Forgets every credential and stops the cron poll.
		 *
		 * Used by the admin "Disconnect" action and when the platform reports the
		 * connection as revoked.
		 */
		public static function disconnect() {
			KPH_SP_Settings::update(
				array(
					'site_id'      => '',
					'site_token'   => '',
					'site_secret'  => '',
					'connected_at' => '',
					'connected_by' => 0,
				)
			);

			wp_clear_scheduled_hook( KPH_SP_CRON_HOOK );
			wp_clear_scheduled_hook( KPH_SP_CRON_HOOK, array( 'live' ) );
			delete_transient( self::LOCK_TRANSIENT );
			delete_transient( self::CONTACT_TRANSIENT );
			delete_option( self::LAST_JOB_OPTION );
		}

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

		/**
		 * Appends a bounded, redacted activity entry (max 20) for the WP admin page.
		 *
		 * Never stores arguments, post bodies or credentials — only the tool name,
		 * status, duration, error code and job id prefix.
		 *
		 * @param string $job_id     Job UUID.
		 * @param string $tool       Tool name.
		 * @param bool   $ok         True on success.
		 * @param int    $elapsed_ms Duration in milliseconds.
		 * @param string $error_code Optional error code.
		 */
		public static function record_activity( $job_id, $tool, $ok, $elapsed_ms, $error_code = '' ) {
			$existing = self::recent_jobs();
			$entry    = array(
				'jobPrefix'  => substr( preg_replace( '/[^a-zA-Z0-9-]/', '', (string) $job_id ), 0, 8 ),
				'tool'       => sanitize_text_field( (string) $tool ),
				'status'     => $ok ? 'succeeded' : 'failed',
				'durationMs' => max( 0, (int) $elapsed_ms ),
				'errorCode'  => sanitize_key( (string) $error_code ),
				'at'         => gmdate( 'c' ),
			);

			array_unshift( $existing, $entry );
			$bounded = array_slice( $existing, 0, self::MAX_RECENT_JOBS );

			update_option( self::RECENT_JOBS_OPTION, $bounded, false );
		}

		/**
		 * Returns the bounded list of recent job executions (newest first).
		 *
		 * @return array<int,array<string,mixed>>
		 */
		public static function recent_jobs() {
			$stored = get_option( self::RECENT_JOBS_OPTION, array() );
			return is_array( $stored ) ? $stored : array();
		}
	}
}

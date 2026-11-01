<?php
/**
 * Fatal-error capture.
 *
 * A tool that runs out of memory or hits a PHP fatal never gets to report a
 * result, so the platform would only see an expired lease and retry forever.
 * This shutdown hook turns that silence into a normal failure report for the
 * job that was running, and remembers the last fatal for the admin screen.
 *
 * Nothing here logs payloads or filesystem paths: only the error type, a
 * basename and a truncated message leave the site.
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'KPH_SP_Fatal' ) ) {
	/**
	 * Shutdown-time fatal error reporter.
	 */
	final class KPH_SP_Fatal {

		/** Option holding the last fatal seen on this site (admin screen). */
		const OPTION = 'kph_sp_last_fatal';

		/** Fatal error types worth reporting. */
		const FATAL_TYPES = array( E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR );

		/** Guards against reporting twice if PHP calls the hook more than once. */
		private static $handled = false;

		/**
		 * Registers the shutdown hook. Called once from the plugin bootstrap.
		 */
		public static function register() {
			register_shutdown_function( array( __CLASS__, 'handle' ) );
		}

		/**
		 * Reports a fatal error if one happened during a connector job.
		 */
		public static function handle() {
			if ( self::$handled ) {
				return;
			}
			self::$handled = true;

			$error = error_get_last();
			if ( ! is_array( $error ) || ! isset( $error['type'] ) || ! in_array( (int) $error['type'], self::FATAL_TYPES, true ) ) {
				return;
			}

			$message = isset( $error['message'] ) ? (string) $error['message'] : '';
			$file    = isset( $error['file'] ) ? wp_basename( (string) $error['file'] ) : '';

			update_option(
				self::OPTION,
				array(
					'type'    => (int) $error['type'],
					'file'    => $file,
					'message' => self::redact_paths( $message ),
					'at'      => gmdate( 'c' ),
				),
				false
			);

			$job = KPH_SP_Job_Runner::current_job();
			if ( ! $job ) {
				return;
			}

			// The report itself must never cause another fatal to cascade.
			if ( ! KPH_SP_Settings::is_connected() ) {
				return;
			}

			KPH_SP_Job_Runner::report_failure(
				(string) $job['id'],
				'kph_sp_fatal_error',
				self::redact_paths( $message ),
				true,
				self::elapsed_ms( $job )
			);
		}

		/**
		 * Removes absolute paths from a message before it leaves the site.
		 *
		 * @param string $message Raw message.
		 * @return string
		 */
		private static function redact_paths( $message ) {
			$message = (string) preg_replace( '#(/[^\s:"]+)+/#', '', (string) $message );
			$message = trim( $message );

			if ( function_exists( 'mb_substr' ) ) {
				return mb_substr( $message, 0, 300 );
			}

			return substr( $message, 0, 300 );
		}

		/**
		 * Milliseconds since the job started.
		 *
		 * @param array<string,mixed> $job Current job record.
		 * @return int
		 */
		private static function elapsed_ms( $job ) {
			if ( ! isset( $job['started'] ) ) {
				return 0;
			}

			return max( 0, (int) round( ( microtime( true ) - (float) $job['started'] ) * 1000 ) );
		}
	}
}

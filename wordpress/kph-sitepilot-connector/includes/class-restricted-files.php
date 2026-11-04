<?php
/**
 * Experimental staging-only editor engine. NOT bootstrapped or job-allowlisted.
 * Explicit operator file allowlist, immutable approvals and encrypted backups.
 * No PHP evaluation, SQL execution, shell or WP-CLI transport.
 * @package KPH_SitePilot_Connector
 */
defined( 'ABSPATH' ) || exit;

final class KPH_SP_Restricted_Files {
	const MAX_BYTES = 65536;
	const TTL = 600;

	private static function fail( $code ) {
		throw new RuntimeException( $code );
	}

	private static function gate() {
		if ( ! function_exists( 'wp_get_environment_type' ) || 'staging' !== wp_get_environment_type() ) {
			self::fail( 'FILE_EDITOR_STAGING_REQUIRED' );
		}
		if ( ! defined( 'KPH_SP_RESTRICTED_FILES_ENABLED' ) || true !== KPH_SP_RESTRICTED_FILES_ENABLED ) {
			self::fail( 'FILE_EDITOR_DISABLED' );
		}
		if ( ! current_user_can( 'manage_options' ) || is_multisite() ||
			( defined( 'DISALLOW_FILE_EDIT' ) && DISALLOW_FILE_EDIT ) ||
			( defined( 'DISALLOW_FILE_MODS' ) && DISALLOW_FILE_MODS ) ) {
			self::fail( 'FILE_EDITOR_FORBIDDEN' );
		}
	}

	/** Only exact operator-selected files under one theme/plugin are eligible. */
	private static function resolve( $relative ) {
		self::gate();
		if ( ! is_string( $relative ) || strlen( $relative ) > 240 ||
			! preg_match( '#^(themes|plugins)/[a-zA-Z0-9_-]+/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+\.(php|js|css)$#D', $relative ) ) {
			self::fail( 'FILE_PATH_DENIED' );
		}
		if ( ! defined( 'KPH_SP_RESTRICTED_FILE_PATHS' ) || ! is_array( KPH_SP_RESTRICTED_FILE_PATHS ) ||
			! in_array( $relative, KPH_SP_RESTRICTED_FILE_PATHS, true ) ) {
			self::fail( 'FILE_NOT_ALLOWLISTED' );
		}
		if ( preg_match( '#(?:config|secret|credential|password|private|vendor|node_modules|kph-sitepilot|wp-agent-bridge)#i', $relative ) ) {
			self::fail( 'FILE_PATH_DENIED' );
		}
		$scope = 0 === strpos( $relative, 'themes/' ) ? 'edit_themes' : 'edit_plugins';
		if ( ! current_user_can( $scope ) ) {
			self::fail( 'FILE_EDITOR_FORBIDDEN' );
		}
		$root = realpath( WP_CONTENT_DIR );
		if ( false === $root || is_link( WP_CONTENT_DIR ) ) {
			self::fail( 'FILE_PATH_DENIED' );
		}
		$walk = $root;
		foreach ( explode( '/', $relative ) as $part ) {
			$walk .= DIRECTORY_SEPARATOR . $part;
			$permissions = @fileperms( $walk );
			if ( is_link( $walk ) || false === $permissions || ( $permissions & 0002 ) ) {
				self::fail( 'FILE_PATH_DENIED' );
			}
		}
		$real = realpath( $walk );
		if ( false === $real || $real !== $walk || ! is_file( $real ) ) {
			self::fail( 'FILE_PATH_DENIED' );
		}
		$stat = stat( $real );
		if ( false === $stat || 1 !== $stat['nlink'] || $stat['size'] > self::MAX_BYTES ) {
			self::fail( 'FILE_UNSUPPORTED' );
		}
		return $real;
	}

	private static function inspect( $text ) {
		if ( ! is_string( $text ) || strlen( $text ) > self::MAX_BYTES || false !== strpos( $text, "\0" ) || ! preg_match( '//u', $text ) ) {
			self::fail( 'FILE_CONTENT_UNSUPPORTED' );
		}
		// Conservative refusal, not a guarantee that arbitrary code contains no secrets.
		if ( preg_match( '/(?:password|api[_-]?key|client[_-]?secret|DB_(?:USER|PASSWORD|HOST)|BEGIN .*PRIVATE KEY|[a-z]+:\/\/[^\s]+:[^\s]+@)/i', $text ) ) {
			self::fail( 'FILE_SENSITIVE_CONTENT' );
		}
	}

	public static function read( $relative ) {
		$path = self::resolve( $relative );
		$text = @file_get_contents( $path );
		self::inspect( $text );
		return array( 'path' => $relative, 'content' => $text, 'sha256' => hash( 'sha256', $text ) );
	}

	private static function key() {
		if ( ! function_exists( 'openssl_encrypt' ) || ! function_exists( 'openssl_decrypt' ) ) {
			self::fail( 'FILE_ENCRYPTION_UNAVAILABLE' );
		}
		return hash( 'sha256', wp_salt( 'auth' ), true );
	}

	private static function seal( $data ) {
		$iv = random_bytes( 12 );
		$tag = '';
		$encrypted = openssl_encrypt( wp_json_encode( $data ), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag, 'kph-restricted-files-v1' );
		if ( false === $encrypted ) {
			self::fail( 'FILE_ENCRYPTION_UNAVAILABLE' );
		}
		return base64_encode( $iv . $tag . $encrypted );
	}

	private static function open( $value ) {
		$raw = is_string( $value ) ? base64_decode( $value, true ) : false;
		if ( false === $raw || strlen( $raw ) < 29 ) {
			self::fail( 'FILE_RECORD_UNUSABLE' );
		}
		$text = openssl_decrypt( substr( $raw, 28 ), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, substr( $raw, 0, 12 ), substr( $raw, 12, 16 ), 'kph-restricted-files-v1' );
		$data = is_string( $text ) ? json_decode( $text, true ) : null;
		if ( ! is_array( $data ) ) {
			self::fail( 'FILE_RECORD_UNUSABLE' );
		}
		return $data;
	}

	/** Candidate is persisted encrypted and cannot be replaced by apply arguments. */
	public static function propose( $relative, $candidate, $expected_hash ) {
		$before = self::read( $relative );
		self::inspect( $candidate );
		if ( ! is_string( $expected_hash ) || ! hash_equals( $before['sha256'], $expected_hash ) ) {
			self::fail( 'FILE_CHANGED' );
		}
		if ( '.php' === substr( $relative, -4 ) ) {
			try {
				token_get_all( $candidate, TOKEN_PARSE );
			} catch ( Throwable $error ) {
				self::fail( 'FILE_PHP_SYNTAX_INVALID' );
			}
		}
		$id = bin2hex( random_bytes( 16 ) );
		$record = array( 'id' => $id, 'path' => $relative, 'before' => $before['content'], 'after' => $candidate,
			'beforeHash' => $before['sha256'], 'afterHash' => hash( 'sha256', $candidate ),
			'owner' => get_current_user_id(), 'expiresAt' => time() + self::TTL );
		if ( ! add_option( 'kph_sp_file_plan_' . $id, self::seal( $record ), '', false ) ) {
			self::fail( 'FILE_PLAN_NOT_STORED' );
		}
		return array( 'id' => $id, 'risk' => 'R3', 'path' => $relative, 'before' => $record['before'],
			'after' => $candidate, 'beforeHash' => $record['beforeHash'], 'afterHash' => $record['afterHash'], 'expiresAt' => $record['expiresAt'] );
	}

	private static function record( $prefix, $id, $confirmation ) {
		self::gate();
		if ( ! is_string( $id ) || ! preg_match( '/^[a-f0-9]{32}$/D', $id ) || ! is_string( $confirmation ) || ! hash_equals( $id, $confirmation ) ) {
			self::fail( 'FILE_CONFIRMATION_REQUIRED' );
		}
		$record = self::open( get_option( $prefix . $id, null ) );
		if ( ! isset( $record['id'] ) || $record['id'] !== $id || $record['owner'] !== get_current_user_id() ) {
			self::fail( 'FILE_EDITOR_FORBIDDEN' );
		}
		return $record;
	}

	/** Operator-provided private workspace, on the same filesystem as the target. */
	private static function workspace( $path ) {
		if ( ! defined( 'KPH_SP_FILE_WORKSPACE' ) || ! is_string( KPH_SP_FILE_WORKSPACE ) ) { self::fail( 'FILE_WORKSPACE_REQUIRED' ); }
		$workspace = realpath( KPH_SP_FILE_WORKSPACE );
		if ( false === $workspace || $workspace !== rtrim( KPH_SP_FILE_WORKSPACE, DIRECTORY_SEPARATOR ) || ! is_dir( $workspace ) ) { self::fail( 'FILE_WORKSPACE_UNSAFE' ); }
		$walk = $workspace;
		while ( dirname( $walk ) !== $walk ) {
			if ( is_link( $walk ) ) { self::fail( 'FILE_WORKSPACE_UNSAFE' ); }
			$walk = dirname( $walk );
		}
		foreach ( array( ABSPATH, WP_CONTENT_DIR, isset( $_SERVER['DOCUMENT_ROOT'] ) ? $_SERVER['DOCUMENT_ROOT'] : '' ) as $public_root ) {
			$public = $public_root ? realpath( $public_root ) : false;
			if ( false !== $public && ( $workspace === $public || 0 === strpos( $workspace, rtrim( $public, DIRECTORY_SEPARATOR ) . DIRECTORY_SEPARATOR ) ) ) { self::fail( 'FILE_WORKSPACE_UNSAFE' ); }
		}
		$private_stat = stat( $workspace ); $target_stat = stat( $path );
		if ( ! $private_stat || ! $target_stat || ( $private_stat['mode'] & 0077 ) || $private_stat['dev'] !== $target_stat['dev'] ) { self::fail( 'FILE_WORKSPACE_UNSAFE' ); }
		return $workspace;
	}

	/** Private same-filesystem atomic replacement; never truncate a live file. */
	private static function replace( $record, $restore, $backup_id ) {
		$path = self::resolve( $record['path'] );
		$workspace = self::workspace( $path );
		$expected = $restore ? $record['afterHash'] : $record['beforeHash'];
		$target = $restore ? $record['before'] : $record['after'];
		$handle = @fopen( $path, 'rb' );
		if ( false === $handle ) { self::fail( 'FILE_LOCK_FAILED' ); }
		$tmp = null;
		try {
			if ( ! flock( $handle, LOCK_EX | LOCK_NB ) ) { self::fail( 'FILE_LOCK_FAILED' ); }
			clearstatcache( true, $path );
			$locked = fstat( $handle );
			$live = stat( $path );
			if ( ! $live || $locked['ino'] !== $live['ino'] || $locked['dev'] !== $live['dev'] ) { self::fail( 'FILE_CHANGED' ); }
			$current = self::read( $record['path'] );
			if ( ! hash_equals( $expected, $current['sha256'] ) ) { self::fail( 'FILE_CHANGED' ); }
			if ( ! $restore ) {
				if ( ! add_option( 'kph_sp_file_backup_' . $backup_id, self::seal( $record ), '', false ) ) { self::fail( 'FILE_BACKUP_FAILED' ); }
				$backup = self::open( get_option( 'kph_sp_file_backup_' . $backup_id, null ) );
				if ( $backup !== $record ) { self::fail( 'FILE_BACKUP_FAILED' ); }
			}
			$tmp = @tempnam( $workspace, '.kph-sp-' );
			if ( false === $tmp || dirname( $tmp ) !== $workspace ) { self::fail( 'FILE_WRITE_FAILED' ); }
			if ( @file_put_contents( $tmp, $target ) !== strlen( $target ) || ! @chmod( $tmp, $live['mode'] & 0777 ) ) { self::fail( 'FILE_WRITE_FAILED' ); }
			$live_hash = @hash_file( 'sha256', $path );
			if ( self::resolve( $record['path'] ) !== $path || ! is_string( $live_hash ) || ! hash_equals( $expected, $live_hash ) ) { self::fail( 'FILE_CHANGED' ); }
			if ( ! @rename( $tmp, $path ) ) { self::fail( 'FILE_WRITE_FAILED' ); }
			$tmp = null;
			if ( function_exists( 'opcache_invalidate' ) ) { opcache_invalidate( $path, true ); }
			$verified_hash = @hash_file( 'sha256', $path );
			if ( ! is_string( $verified_hash ) || ! hash_equals( hash( 'sha256', $target ), $verified_hash ) ) { self::fail( 'FILE_WRITE_UNVERIFIED' ); }
			return array( 'verified' => true, 'backupId' => $backup_id, 'sha256' => hash( 'sha256', $target ) );
		} finally {
			if ( is_string( $tmp ) && is_file( $tmp ) ) { unlink( $tmp ); }
			flock( $handle, LOCK_UN );
			fclose( $handle );
		}
	}

	public static function apply( $id, $confirmation ) {
		$record = self::record( 'kph_sp_file_plan_', $id, $confirmation );
		if ( $record['expiresAt'] <= time() ) { self::fail( 'FILE_PLAN_EXPIRED' ); }
		$result = self::replace( $record, false, $id );
		delete_option( 'kph_sp_file_plan_' . $id );
		return $result;
	}

	public static function restore( $id, $confirmation ) {
		$record = self::record( 'kph_sp_file_backup_', $id, $confirmation );
		return self::replace( $record, true, $id );
	}
}

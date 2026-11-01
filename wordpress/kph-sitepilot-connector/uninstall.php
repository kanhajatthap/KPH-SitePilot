<?php
/**
 * Uninstall cleanup. Runs only when the user deletes the plugin from wp-admin.
 *
 * @package KPH_SitePilot_Connector
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'kph_sp_settings' );
delete_option( 'kph_sp_version' );
delete_transient( 'kph_sp_last_heartbeat' );
delete_transient( 'kph_sp_poll_lock' );
delete_option( 'kph_sp_last_contact' );
delete_option( 'kph_sp_last_job_error' );

// Multisite: clean each site's options as well.
if ( is_multisite() ) {
	$sites = get_sites( array( 'fields' => 'ids' ) );
	foreach ( $sites as $site_id ) {
		switch_to_blog( (int) $site_id );
		delete_option( 'kph_sp_settings' );
		delete_option( 'kph_sp_version' );
		delete_transient( 'kph_sp_last_heartbeat' );
		delete_transient( 'kph_sp_poll_lock' );
		delete_option( 'kph_sp_last_contact' );
		delete_option( 'kph_sp_last_job_error' );
delete_transient( 'kph_sp_poll_lock' );
delete_option( 'kph_sp_last_contact' );
delete_option( 'kph_sp_last_job_error' );
		restore_current_blog();
	}
}

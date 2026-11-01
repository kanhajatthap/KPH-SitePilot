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

// Multisite: clean each site's options as well.
if ( is_multisite() ) {
	$sites = get_sites( array( 'fields' => 'ids' ) );
	foreach ( $sites as $site_id ) {
		switch_to_blog( (int) $site_id );
		delete_option( 'kph_sp_settings' );
		delete_option( 'kph_sp_version' );
		delete_transient( 'kph_sp_last_heartbeat' );
		restore_current_blog();
	}
}

<?php
/**
 * Allowlisted tool execution.
 *
 * Deny by default: a job whose tool is not in `supported()` is rejected before
 * any WordPress API is touched. Each tool also declares the scope it needs, so a
 * site that dropped the `files` scope can never receive a file job even if the
 * platform asked for one.
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'KPH_SP_Tools' ) ) {
	/**
	 * Read-only tool handlers available in this build.
	 */
	final class KPH_SP_Tools {

		/**
		 * Tools this build can execute.
		 *
		 * @return string[]
		 */
		public static function supported() {
			return array( 'site.info', 'site.health', 'content.list', 'content.get' );
		}

		/**
		 * Scope required by a tool.
		 *
		 * @param string $tool Tool name.
		 * @return string
		 */
		public static function scope_for( $tool ) {
			$map = array(
				'site.info'    => 'read',
				'site.health'  => 'read',
				'content.list' => 'read',
				'content.get'  => 'read',
			);

			return isset( $map[ $tool ] ) ? $map[ $tool ] : 'read';
		}

		/**
		 * Executes a tool, or explains why it refused.
		 *
		 * @param string              $tool Tool name.
		 * @param array<string,mixed> $args Tool arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		public static function execute( $tool, $args = array() ) {
			$tool = is_string( $tool ) ? $tool : '';

			if ( ! in_array( $tool, self::supported(), true ) ) {
				return new WP_Error(
					'kph_sp_unknown_tool',
					sprintf( 'Tool "%s" is not available on this connector build.', $tool )
				);
			}

			$scope = self::scope_for( $tool );
			if ( ! KPH_SP_Settings::has_scope( $scope ) ) {
				return new WP_Error(
					'kph_sp_scope_missing',
					sprintf( 'The "%s" scope is disabled for this site.', $scope )
				);
			}

			$args = is_array( $args ) ? $args : array();

			switch ( $tool ) {
				case 'site.info':
					return KPH_SP_Capabilities::manifest();
				case 'site.health':
					return self::site_health();
				case 'content.list':
					return self::content_list( $args );
				case 'content.get':
					return self::content_get( $args );
			}

			return new WP_Error( 'kph_sp_unknown_tool', 'Tool dispatch failed.' );
		}

		/**
		 * Cheap health probe: no writes, no heavy queries.
		 *
		 * @return array<string,mixed>
		 */
		private static function site_health() {
			$uploads = wp_get_upload_dir();

			return array(
				'ok'              => true,
				'wpVersion'       => get_bloginfo( 'version' ),
				'phpVersion'      => PHP_VERSION,
				'pluginVersion'   => KPH_SP_VERSION,
				'filesystem'      => defined( 'FS_METHOD' ) ? (string) FS_METHOD : 'direct',
				'uploadsWritable' => isset( $uploads['basedir'] ) ? (bool) wp_is_writable( $uploads['basedir'] ) : false,
				'permalink'       => (string) get_option( 'permalink_structure', '' ),
				'checkedAt'       => gmdate( 'c' ),
			);
		}

		/**
		 * Recent posts and pages, metadata only.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>
		 */
		private static function content_list( $args ) {
			$allowed_types = array_keys( get_post_types( array( 'public' => true ) ) );
			$requested     = isset( $args['postTypes'] ) && is_array( $args['postTypes'] ) ? $args['postTypes'] : $allowed_types;
			$post_types    = array_values( array_intersect( array_map( 'sanitize_key', $requested ), $allowed_types ) );

			if ( empty( $post_types ) ) {
				$post_types = array( 'post', 'page' );
			}

			$limit = isset( $args['limit'] ) ? (int) $args['limit'] : 10;
			$limit = max( 1, min( 20, $limit ) );

			$posts = get_posts(
				array(
					'post_type'        => $post_types,
					'post_status'      => array( 'publish', 'draft', 'pending' ),
					'numberposts'      => $limit,
					'orderby'          => 'modified',
					'order'            => 'DESC',
					'suppress_filters' => false,
				)
			);

			$items = array();
			foreach ( $posts as $post ) {
				$items[] = array(
					'id'        => (int) $post->ID,
					'title'     => (string) get_the_title( $post ),
					'type'      => (string) $post->post_type,
					'status'    => (string) $post->post_status,
					'slug'      => (string) $post->post_name,
					'modified'  => (string) $post->post_modified_gmt,
					'permalink' => (string) get_permalink( $post ),
				);
			}

			return array(
				'postTypes' => $post_types,
				'count'     => count( $items ),
				'items'     => $items,
			);
		}

		/**
		 * One post with raw content, for the read-then-edit loop.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function content_get( $args ) {
			$id = isset( $args['id'] ) ? (int) $args['id'] : 0;
			if ( $id <= 0 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'content.get requires a positive integer id.' );
			}

			$post = get_post( $id );
			if ( ! $post ) {
				return new WP_Error( 'kph_sp_not_found', sprintf( 'Post %d does not exist.', $id ) );
			}

			$allowed_types = array_keys( get_post_types( array( 'public' => true ) ) );
			if ( ! in_array( $post->post_type, $allowed_types, true ) ) {
				return new WP_Error( 'kph_sp_not_allowed', 'That post type is not publicly addressable.' );
			}

			return array(
				'id'        => (int) $post->ID,
				'title'     => (string) get_the_title( $post ),
				'type'      => (string) $post->post_type,
				'status'    => (string) $post->post_status,
				'slug'      => (string) $post->post_name,
				'content'   => (string) $post->post_content,
				'excerpt'   => (string) $post->post_excerpt,
				'modified'  => (string) $post->post_modified_gmt,
				'author'    => (int) $post->post_author,
				'permalink' => (string) get_permalink( $post ),
			);
		}
	}
}

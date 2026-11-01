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
			return array(
				// Read-only.
				'site.info',
				'site.health',
				'content.list',
				'content.get',
				// Mutations. Every one snapshots first, verifies after, and is
				// reversible through `content.restore`.
				'content.update',
				'content.create',
				'content.restore',
			);
		}

		/**
		 * Scope required by a tool.
		 *
		 * @param string $tool Tool name.
		 * @return string
		 */
		public static function scope_for( $tool ) {
			$map = array(
				'site.info'       => 'read',
				'site.health'     => 'read',
				'content.list'    => 'read',
				'content.get'     => 'read',
				'content.update'  => 'content',
				'content.create'  => 'content',
				'content.restore' => 'content',
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
				case 'content.update':
					return self::content_update( $args );
				case 'content.create':
					return self::content_create( $args );
				case 'content.restore':
					return self::content_restore( $args );
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
		 * True when a post type may be written by the connector.
		 *
		 * @param string $type Post type.
		 * @return bool
		 */
		private static function is_writable_type( $type ) {
			$allowed = array_keys( get_post_types( array( 'public' => true ) ) );
			return in_array( (string) $type, $allowed, true );
		}

		/**
		 * Snapshot of the fields the connector can change.
		 *
		 * @param WP_Post $post Post object.
		 * @return array<string,mixed>
		 */
		private static function snapshot( $post ) {
			return array(
				'id'       => (int) $post->ID,
				'title'    => (string) $post->post_title,
				'content'  => (string) $post->post_content,
				'excerpt'  => (string) $post->post_excerpt,
				'status'   => (string) $post->post_status,
				'modified' => (string) $post->post_modified_gmt,
			);
		}

		/**
		 * Reads a post and normalises it for comparison.
		 *
		 * @param int $id Post id.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function read_back( $id ) {
			$post = get_post( (int) $id );
			if ( ! $post ) {
				return new WP_Error( 'kph_sp_not_found', sprintf( 'Post %d does not exist after the write.', (int) $id ) );
			}

			$fields = self::snapshot( $post );
			$fields['permalink'] = (string) get_permalink( $post );

			return $fields;
		}

		/**
		 * Compares the requested fields with what WordPress actually stored.
		 *
		 * @param array<string,mixed> $expected Requested values.
		 * @param array<string,mixed> $actual   Read-back values.
		 * @return bool
		 */
		private static function verify( $expected, $actual ) {
			foreach ( array( 'title', 'status' ) as $key ) {
				if ( isset( $expected[ $key ] ) && (string) $expected[ $key ] !== (string) $actual[ $key ] ) {
					return false;
				}
			}

			if ( isset( $expected['content'] ) ) {
				// Compare normalised whitespace only: WordPress applies KSES and
				// may reorder attributes, so a byte comparison is too strict.
				$want = preg_replace( '/\s+/', ' ', trim( (string) $expected['content'] ) );
				$got  = preg_replace( '/\s+/', ' ', trim( (string) $actual['content'] ) );
				if ( $want !== $got ) {
					return false;
				}
			}

			return true;
		}

		/**
		 * Updates an existing post with snapshot + verification.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function content_update( $args ) {
			$id = isset( $args['id'] ) ? (int) $args['id'] : 0;
			if ( $id <= 0 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'content.update requires a positive integer id.' );
			}

			$post = get_post( $id );
			if ( ! $post ) {
				return new WP_Error( 'kph_sp_not_found', sprintf( 'Post %d does not exist.', $id ) );
			}
			if ( ! self::is_writable_type( $post->post_type ) ) {
				return new WP_Error( 'kph_sp_not_allowed', 'That post type is not publicly addressable.' );
			}

			return self::apply_update( $post, $args );
		}

		/**
		 * Restores a post from a snapshot produced by an earlier job.
		 *
		 * @param array<string,mixed> $args Snapshot fields.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function content_restore( $args ) {
			$before = isset( $args['before'] ) && is_array( $args['before'] ) ? $args['before'] : array();
			$id     = isset( $before['id'] ) ? (int) $before['id'] : ( isset( $args['id'] ) ? (int) $args['id'] : 0 );

			if ( $id <= 0 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'content.restore requires a snapshot with an id.' );
			}

			$post = get_post( $id );
			if ( ! $post ) {
				return new WP_Error( 'kph_sp_not_found', sprintf( 'Post %d no longer exists; undo needs a manual review.', $id ) );
			}

			return self::apply_update(
				$post,
				array(
					'title'   => isset( $before['title'] ) ? (string) $before['title'] : null,
					'content' => isset( $before['content'] ) ? (string) $before['content'] : null,
					'excerpt' => isset( $before['excerpt'] ) ? (string) $before['excerpt'] : null,
					'status'  => isset( $before['status'] ) ? (string) $before['status'] : null,
					'restore' => true,
				)
			);
		}

		/**
		 * Shared update path: snapshot → write → read back → verify.
		 *
		 * @param WP_Post             $post Post being changed.
		 * @param array<string,mixed> $args Requested fields.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function apply_update( $post, $args ) {
			$before  = self::snapshot( $post );
			$request = array( 'ID' => (int) $post->ID );
			$expect  = array();

			if ( isset( $args['title'] ) && null !== $args['title'] ) {
				$request['post_title'] = sanitize_text_field( (string) $args['title'] );
				$expect['title']       = $request['post_title'];
			}
			if ( isset( $args['content'] ) && null !== $args['content'] ) {
				$request['post_content'] = wp_kses_post( (string) $args['content'] );
				$expect['content']       = $request['post_content'];
			}
			if ( isset( $args['excerpt'] ) && null !== $args['excerpt'] ) {
				$request['post_excerpt'] = wp_kses_post( (string) $args['excerpt'] );
			}
			if ( isset( $args['status'] ) && null !== $args['status'] ) {
				$status = sanitize_key( (string) $args['status'] );
				if ( ! in_array( $status, array( 'draft', 'pending', 'publish', 'private' ), true ) ) {
					return new WP_Error( 'kph_sp_invalid_argument', 'Unsupported post status.' );
				}
				$request['post_status'] = $status;
				$expect['status']       = $status;
			}

			if ( count( $request ) < 2 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'Nothing to update: provide title, content, excerpt or status.' );
			}

			$result = wp_update_post( wp_slash( $request ), true );
			if ( is_wp_error( $result ) ) {
				return new WP_Error( 'kph_sp_write_failed', (string) $result->get_error_message() );
			}
			if ( 0 === (int) $result ) {
				return new WP_Error( 'kph_sp_write_failed', 'WordPress refused the update.' );
			}

			$after    = self::read_back( (int) $post->ID );
			if ( is_wp_error( $after ) ) {
				return $after;
			}
			$verified = self::verify( $expect, $after );

			if ( ! $verified ) {
				return new WP_Error(
					'kph_sp_verification_failed',
					'WordPress stored different values than requested; the change was not confirmed.',
					array(
						'before'   => $before,
						'after'    => $after,
						'expected' => $expect,
					)
				);
			}

			return array(
				'verified' => true,
				'id'       => (int) $post->ID,
				'before'   => $before,
				'after'    => $after,
				'changed'  => $before !== $after,
				'restore'  => ! empty( $args['restore'] ),
			);
		}

		/**
		 * Creates a post or page, then verifies it exists as requested.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function content_create( $args ) {
			$title = isset( $args['title'] ) ? sanitize_text_field( (string) $args['title'] ) : '';
			if ( '' === $title ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'content.create requires a title.' );
			}

			$type = isset( $args['type'] ) ? sanitize_key( (string) $args['type'] ) : 'page';
			if ( ! self::is_writable_type( $type ) ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'That post type is not writable.' );
			}

			$status = isset( $args['status'] ) ? sanitize_key( (string) $args['status'] ) : 'draft';
			if ( ! in_array( $status, array( 'draft', 'pending', 'publish' ), true ) ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'Unsupported post status for a new post.' );
			}

			$content = isset( $args['content'] ) ? wp_kses_post( (string) $args['content'] ) : '';
			$slug    = isset( $args['slug'] ) ? sanitize_title( (string) $args['slug'] ) : '';

			$insert = array(
				'post_title'   => $title,
				'post_content' => $content,
				'post_status'  => $status,
				'post_type'    => $type,
			);
			if ( '' !== $slug ) {
				$insert['post_name'] = $slug;
			}

			$id = wp_insert_post( wp_slash( $insert ), true );
			if ( is_wp_error( $id ) ) {
				return new WP_Error( 'kph_sp_write_failed', (string) $id->get_error_message() );
			}

			$after = self::read_back( (int) $id );
			if ( is_wp_error( $after ) ) {
				return $after;
			}

			$verified = self::verify(
				array(
					'title'   => $title,
					'content' => $content,
					'status'  => $status,
				),
				$after
			);

			if ( ! $verified ) {
				return new WP_Error(
					'kph_sp_verification_failed',
					'The new post could not be read back as requested.',
					array( 'after' => $after )
				);
			}

			return array(
				'verified' => true,
				'id'       => (int) $id,
				'before'   => null,
				'after'    => $after,
				'created'  => true,
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

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
				'site.logs',
				'site.search',
				'content.list',
				'content.get',
				// Mutations. Every one snapshots first, verifies after, and is
				// reversible through `content.restore`.
				'content.update',
				'content.create',
				'content.restore',
				// Inventory reads (E4-04): plugins, theme, users, media, terms.
				'plugins.list',
				'theme.info',
				'users.list',
				'media.list',
				'media.update',
				'media.restore',
				'media.set_featured',
				'media.restore_featured',
				'terms.list',
				'terms.create',
				'terms.assign',
				'terms.restore',
				'menus.list',
				'menus.save',
				'menus.restore',
				'settings.get',
				'seo.meta.get',
				'seo.meta.update',
				'seo.meta.restore',
				'blocks.parse',
				// Publishing is a distinct, auditable action even though it is a
				// status change underneath.
				'content.publish',
				'content.unpublish',
				'blocks.replace',
				// Allowlisted settings writes + undo (E6-01 / E3-09).
				'settings.update',
				'settings.restore',
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
				'site.info'              => 'read',
				'site.health'            => 'read',
				'site.logs'              => 'site_ops',
				'site.search'            => 'read',
				'content.list'           => 'read',
				'content.get'            => 'read',
				'content.update'         => 'content',
				'content.create'         => 'content',
				'content.restore'        => 'content',
				'plugins.list'           => 'site_ops',
				'theme.info'             => 'read',
				'users.list'             => 'site_ops',
				'media.list'             => 'media',
				'media.update'           => 'media',
				'media.restore'          => 'media',
				'media.set_featured'     => 'content',
				'media.restore_featured' => 'content',
				'terms.list'             => 'read',
				'terms.create'           => 'content',
				'terms.assign'           => 'content',
				'terms.restore'          => 'content',
				'menus.list'             => 'read',
				'menus.save'             => 'content',
				'menus.restore'          => 'content',
				'settings.get'           => 'read',
				'seo.meta.get'           => 'read',
				'seo.meta.update'        => 'content',
				'seo.meta.restore'       => 'content',
				'blocks.parse'           => 'read',
				'content.publish'        => 'content',
				'content.unpublish'      => 'content',
				'blocks.replace'         => 'content',
				'settings.update'        => 'site_ops',
				'settings.restore'       => 'site_ops',
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
				case 'site.logs':
					return self::site_logs( $args );
				case 'site.search':
					return self::site_search( $args );
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
				case 'plugins.list':
					return self::plugins_list();
				case 'theme.info':
					return self::theme_info();
				case 'users.list':
					return self::users_list( $args );
				case 'media.list':
					return self::media_list( $args );
				case 'media.update':
					return self::media_update( $args );
				case 'media.restore':
					return self::media_restore( $args );
				case 'media.set_featured':
					return self::media_set_featured( $args, false );
				case 'media.restore_featured':
					return self::media_set_featured( $args, true );
				case 'terms.list':
					return self::terms_list( $args );
				case 'terms.create':
					return self::terms_create( $args );
				case 'terms.assign':
					return self::terms_assign( $args );
				case 'terms.restore':
					return self::terms_restore( $args );
				case 'menus.list':
					return self::menus_list();
				case 'menus.save':
					return self::menus_save( $args );
				case 'menus.restore':
					return self::menus_restore( $args );
				case 'settings.get':
					return self::settings_get( $args );
				case 'seo.meta.get':
					return self::seo_meta_get( $args );
				case 'seo.meta.update':
					return self::seo_meta_update( $args );
				case 'seo.meta.restore':
					return self::seo_meta_restore( $args );
				case 'blocks.parse':
					return self::blocks_parse( $args );
				case 'content.publish':
					return self::content_publish( $args, 'publish' );
				case 'content.unpublish':
					return self::content_publish( $args, 'draft' );
				case 'blocks.replace':
					return self::blocks_replace( $args );
				case 'settings.update':
					return self::settings_update( $args );
				case 'settings.restore':
					return self::settings_restore( $args );
			}

			return new WP_Error( 'kph_sp_unknown_tool', 'Tool dispatch failed.' );
		}

		/**
		 * Cheap health probe: no writes, no heavy queries (E4-03).
		 *
		 * @return array<string,mixed>
		 */
		private static function site_health() {
			$uploads   = wp_get_upload_dir();
			$basedir   = isset( $uploads['basedir'] ) ? (string) $uploads['basedir'] : '';
			$free_disk = null;

			if ( '' !== $basedir && is_dir( $basedir ) && function_exists( 'disk_free_space' ) ) {
				$raw_free = @disk_free_space( $basedir );
				if ( false !== $raw_free && is_numeric( $raw_free ) ) {
					$free_disk = (float) $raw_free;
				}
			}

			return array(
				'ok'               => true,
				'wpVersion'        => get_bloginfo( 'version' ),
				'phpVersion'       => PHP_VERSION,
				'pluginVersion'    => KPH_SP_VERSION,
				'filesystem'       => defined( 'FS_METHOD' ) ? (string) FS_METHOD : 'direct',
				'uploadsWritable'  => '' !== $basedir ? (bool) wp_is_writable( $basedir ) : false,
				'uploadsFreeBytes' => $free_disk,
				'maxUploadBytes'   => (int) wp_max_upload_size(),
				'memoryLimit'      => (string) ini_get( 'memory_limit' ),
				'debugMode'        => defined( 'WP_DEBUG' ) && WP_DEBUG,
				'cronDisabled'     => defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON,
				'https'            => (bool) is_ssl(),
				'permalink'        => (string) get_option( 'permalink_structure', '' ),
				'checkedAt'        => gmdate( 'c' ),
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
		 * Installed plugins, active state included, with no file paths.
		 *
		 * @return array<string,mixed>
		 */
		private static function plugins_list() {
			if ( ! function_exists( 'get_plugins' ) ) {
				require_once ABSPATH . 'wp-admin/includes/plugin.php';
			}

			$all    = get_plugins();
			$items  = array();
			$budget = 100;

			foreach ( $all as $file => $plugin ) {
				if ( $budget <= 0 ) {
					break;
				}
				$budget--;

				$items[] = array(
					'slug'    => sanitize_key( dirname( (string) $file ) ),
					'name'    => isset( $plugin['Name'] ) ? (string) $plugin['Name'] : '',
					'version' => isset( $plugin['Version'] ) ? (string) $plugin['Version'] : '',
					'author'  => isset( $plugin['Author'] ) ? (string) wp_strip_all_tags( (string) $plugin['Author'] ) : '',
					'active'  => (bool) is_plugin_active( (string) $file ),
				);
			}

			return array(
				'count'     => count( $items ),
				'active'    => count( array_filter( $items, static function ( $item ) { return (bool) $item['active']; } ) ),
				'truncated' => count( $all ) > 100,
				'items'     => $items,
			);
		}

		/**
		 * Current theme: name, version, parent, and whether it is a block theme.
		 *
		 * @return array<string,mixed>
		 */
		private static function theme_info() {
			$theme  = wp_get_theme();
			$parent = $theme->parent();

			return array(
				'name'         => (string) $theme->get( 'Name' ),
				'version'      => (string) $theme->get( 'Version' ),
				'author'       => (string) wp_strip_all_tags( (string) $theme->get( 'Author' ) ),
				'stylesheet'   => (string) $theme->get_stylesheet(),
				'template'     => (string) $theme->get_template(),
				'parent'       => $parent ? (string) $parent->get( 'Name' ) : '',
				'isBlockTheme' => function_exists( 'wp_is_block_theme' ) ? (bool) wp_is_block_theme() : false,
				'hasMenus'     => (bool) get_registered_nav_menus(),
			);
		}

		/**
		 * Users with roles only — never an email address or a password hash.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>
		 */
		private static function users_list( $args ) {
			$limit = isset( $args['limit'] ) ? (int) $args['limit'] : 20;
			$limit = max( 1, min( 50, $limit ) );

			$users = get_users(
				array(
					'number'  => $limit,
					'orderby' => 'registered',
					'order'   => 'DESC',
					'fields'  => array( 'ID', 'user_login', 'display_name', 'user_registered' ),
				)
			);

			$items = array();
			foreach ( $users as $user ) {
				$data  = get_userdata( (int) $user->ID );
				$items[] = array(
					'id'         => (int) $user->ID,
					'login'      => (string) $user->user_login,
					'name'       => (string) $user->display_name,
					'roles'      => $data ? array_values( (array) $data->roles ) : array(),
					'registered' => (string) $user->user_registered,
				);
			}

			return array(
				'count' => count( $items ),
				'items' => $items,
			);
		}

		/**
		 * Media library page: ids, titles, mime types and URLs only.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>
		 */
		private static function media_list( $args ) {
			$limit = isset( $args['limit'] ) ? (int) $args['limit'] : 20;
			$limit = max( 1, min( 50, $limit ) );
			$page  = isset( $args['page'] ) ? max( 1, (int) $args['page'] ) : 1;
			$type  = isset( $args['mimeType'] ) ? sanitize_mime_type( (string) $args['mimeType'] ) : '';

			$query_args = array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'posts_per_page' => $limit,
				'paged'          => $page,
				'orderby'        => 'date',
				'order'          => 'DESC',
			);

			if ( '' !== $type ) {
				$query_args['post_mime_type'] = $type;
			}

			$query = new WP_Query( $query_args );
			$items = array();

			foreach ( $query->posts as $attachment ) {
				$items[] = array(
					'id'        => (int) $attachment->ID,
					'title'     => (string) get_the_title( $attachment ),
					'mime'      => (string) get_post_mime_type( $attachment ),
					'url'       => (string) wp_get_attachment_url( $attachment->ID ),
					'thumbnail' => (string) wp_get_attachment_thumb_url( $attachment->ID ),
					'date'      => (string) $attachment->post_date_gmt,
					'alt'       => (string) get_post_meta( $attachment->ID, '_wp_attachment_image_alt', true ),
				);
			}

			return array(
				'page'  => $page,
				'count' => count( $items ),
				'total' => (int) $query->found_posts,
				'items' => $items,
			);
		}

		/**
		 * Terms for one public taxonomy (defaults to categories).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function terms_list( $args ) {
			$taxonomy = isset( $args['taxonomy'] ) ? sanitize_key( (string) $args['taxonomy'] ) : 'category';
			$allowed  = get_taxonomies( array( 'public' => true ), 'names' );

			if ( ! in_array( $taxonomy, $allowed, true ) ) {
				return new WP_Error(
					'kph_sp_invalid_taxonomy',
					sprintf( 'Taxonomy "%s" is not public on this site.', $taxonomy )
				);
			}

			$limit = isset( $args['limit'] ) ? (int) $args['limit'] : 50;
			$limit = max( 1, min( 100, $limit ) );

			$terms = get_terms(
				array(
					'taxonomy'   => $taxonomy,
					'hide_empty' => false,
					'number'     => $limit,
				)
			);

			if ( is_wp_error( $terms ) ) {
				return $terms;
			}

			$items = array();
			foreach ( $terms as $term ) {
				$items[] = array(
					'id'     => (int) $term->term_id,
					'name'   => (string) $term->name,
					'slug'   => (string) $term->slug,
					'count'  => (int) $term->count,
					'parent' => (int) $term->parent,
				);
			}

			return array(
				'taxonomy' => $taxonomy,
				'count'    => count( $items ),
				'items'    => $items,
			);
		}

		/**
		 * Navigation menus with their locations and items (bounded).
		 *
		 * @return array<string,mixed>
		 */
		private static function menus_list() {
			$menus     = wp_get_nav_menus();
			$locations = get_nav_menu_locations();
			$items     = array();
			$budget    = 100;

			foreach ( array_slice( (array) $menus, 0, 20 ) as $menu ) {
				$assigned = array();
				foreach ( (array) $locations as $location => $menu_id ) {
					if ( (int) $menu_id === (int) $menu->term_id ) {
						$assigned[] = sanitize_key( (string) $location );
					}
				}

				$links = array();
				foreach ( (array) wp_get_nav_menu_items( $menu->term_id ) as $link ) {
					if ( $budget <= 0 ) {
						break;
					}
					$budget--;

					$links[] = array(
						'id'     => (int) $link->ID,
						'title'  => (string) $link->title,
						'url'    => (string) esc_url_raw( (string) $link->url ),
						'parent' => (int) $link->menu_item_parent,
						'order'  => (int) $link->menu_order,
					);
				}

				$items[] = array(
					'id'        => (int) $menu->term_id,
					'name'      => (string) $menu->name,
					'slug'      => (string) $menu->slug,
					'locations' => $assigned,
					'items'     => $links,
				);
			}

			return array(
				'count'      => count( $items ),
				'locations'  => array_keys( (array) $locations ),
				'items'      => $items,
				'truncated'  => $budget <= 0,
			);
		}

		/**
		 * A fixed set of harmless options. Unknown keys are refused, never
		 * forwarded to `get_option()`, so the tool cannot be used as a probe.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function settings_get( $args ) {
			$allowed = array(
				'blogname',
				'blogdescription',
				'siteurl',
				'home',
				'permalink_structure',
				'timezone_string',
				'date_format',
				'time_format',
				'posts_per_page',
				'show_on_front',
				'page_on_front',
				'page_for_posts',
				'default_comment_status',
				'default_ping_status',
			);

			$requested = isset( $args['keys'] ) && is_array( $args['keys'] )
				? array_map( 'sanitize_key', $args['keys'] )
				: $allowed;

			$unknown = array_values( array_diff( $requested, $allowed ) );
			if ( ! empty( $unknown ) ) {
				return new WP_Error(
					'kph_sp_option_not_allowed',
					sprintf( 'Option "%s" is not readable through the connector.', implode( ', ', $unknown ) )
				);
			}

			$values = array();
			foreach ( $requested as $key ) {
				$values[ $key ] = get_option( $key, null );
			}

			return array(
				'count'    => count( $values ),
				'readable' => $allowed,
				'values'   => $values,
			);
		}

		/**
		 * Options that may be mutated remotely (`siteurl` and `home` are excluded
		 * by design so a prompt can never rewrite the site origin).
		 *
		 * @return string[]
		 */
		private static function writable_settings_keys() {
			return array(
				'blogname',
				'blogdescription',
				'timezone_string',
				'date_format',
				'time_format',
				'posts_per_page',
				'default_comment_status',
				'default_ping_status',
			);
		}

		/**
		 * Validates a map of option updates before touching `get_option` or
		 * `update_option`.
		 *
		 * @param mixed $raw Raw option map.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function validate_settings_values( $raw ) {
			if ( ! is_array( $raw ) || empty( $raw ) ) {
				return new WP_Error(
					'kph_sp_invalid_argument',
					'settings.update requires a non-empty "values" object.'
				);
			}

			$allowed = self::writable_settings_keys();
			$cleaned = array();

			foreach ( $raw as $raw_key => $value ) {
				$key = sanitize_key( (string) $raw_key );
				if ( '' === $key || ! in_array( $key, $allowed, true ) ) {
					return new WP_Error(
						'kph_sp_option_not_allowed',
						sprintf( 'Option "%s" is not writable through the connector.', (string) $raw_key )
					);
				}

				switch ( $key ) {
					case 'blogname':
						$text = sanitize_text_field( (string) $value );
						if ( '' === $text || strlen( $text ) > 200 ) {
							return new WP_Error( 'kph_sp_invalid_argument', 'blogname must be 1–200 characters.' );
						}
						$cleaned[ $key ] = $text;
						break;

					case 'blogdescription':
						$text = sanitize_text_field( (string) $value );
						if ( strlen( $text ) > 400 ) {
							return new WP_Error( 'kph_sp_invalid_argument', 'blogdescription must be at most 400 characters.' );
						}
						$cleaned[ $key ] = $text;
						break;

					case 'timezone_string':
						$tz = sanitize_text_field( (string) $value );
						if ( '' !== $tz && ! in_array( $tz, timezone_identifiers_list(), true ) ) {
							return new WP_Error( 'kph_sp_invalid_argument', 'timezone_string must be a valid PHP timezone identifier.' );
						}
						$cleaned[ $key ] = $tz;
						break;

					case 'date_format':
					case 'time_format':
						$fmt = sanitize_text_field( (string) $value );
						if ( '' === $fmt || strlen( $fmt ) > 64 ) {
							return new WP_Error( 'kph_sp_invalid_argument', sprintf( '%s must be 1–64 characters.', $key ) );
						}
						$cleaned[ $key ] = $fmt;
						break;

					case 'posts_per_page':
						$ppp = (int) $value;
						if ( $ppp < 1 || $ppp > 100 ) {
							return new WP_Error( 'kph_sp_invalid_argument', 'posts_per_page must be between 1 and 100.' );
						}
						$cleaned[ $key ] = $ppp;
						break;

					case 'default_comment_status':
					case 'default_ping_status':
						$status = sanitize_key( (string) $value );
						if ( ! in_array( $status, array( 'open', 'closed' ), true ) ) {
							return new WP_Error( 'kph_sp_invalid_argument', sprintf( '%s must be "open" or "closed".', $key ) );
						}
						$cleaned[ $key ] = $status;
						break;
				}
			}

			return $cleaned;
		}

		/**
		 * Updates allowlisted options with before-snapshot, read-back verification,
		 * and automatic rollback on mismatch.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function settings_update( $args ) {
			$raw = isset( $args['values'] ) ? $args['values'] : $args;
			return self::apply_settings_values( $raw, false );
		}

		/**
		 * Restores allowlisted options from a pre-write snapshot.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function settings_restore( $args ) {
			$before = isset( $args['before'] ) && is_array( $args['before'] ) ? $args['before'] : array();
			$raw    = isset( $before['values'] ) ? $before['values'] : $before;
			return self::apply_settings_values( $raw, true );
		}

		/**
		 * Shared verified option writer.
		 *
		 * @param mixed $raw        Option map.
		 * @param bool  $is_restore True when running as an undo job.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function apply_settings_values( $raw, $is_restore ) {
			$validated = self::validate_settings_values( $raw );
			if ( is_wp_error( $validated ) ) {
				return $validated;
			}

			$before_values = array();
			foreach ( $validated as $key => $expected ) {
				$current = get_option( $key, '' );
				$before_values[ $key ] = 'posts_per_page' === $key ? (int) $current : (string) $current;
			}

			foreach ( $validated as $key => $expected ) {
				update_option( $key, $expected );
			}

			$after_values = array();
			$mismatched   = false;
			foreach ( $validated as $key => $expected ) {
				$stored = get_option( $key, '' );
				if ( 'posts_per_page' === $key ) {
					$actual = (int) $stored;
					$after_values[ $key ] = $actual;
					if ( $actual !== (int) $expected ) {
						$mismatched = true;
					}
				} else {
					$actual = (string) $stored;
					$after_values[ $key ] = $actual;
					if ( $actual !== (string) $expected ) {
						$mismatched = true;
					}
				}
			}

			if ( $mismatched ) {
				foreach ( $before_values as $key => $previous ) {
					update_option( $key, $previous );
				}
				return new WP_Error(
					'kph_sp_verification_failed',
					'WordPress stored different option values than requested; rolled back to previous settings.',
					array(
						'before'   => array( 'values' => $before_values ),
						'expected' => $validated,
						'actual'   => $after_values,
					)
				);
			}

			return array(
				'verified'         => true,
				'snapshotResource' => 'settings',
				'changedKeys'      => array_keys( $validated ),
				'before'           => array( 'values' => $before_values ),
				'after'            => array( 'values' => $after_values ),
				'changed'          => $before_values !== $after_values,
				'restore'          => (bool) $is_restore,
			);
		}

		/**
		 * Flattens the block tree of one post into a bounded, inspectable list.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function blocks_parse( $args ) {
			$post = self::load_writable_post( $args );
			if ( is_wp_error( $post ) ) {
				return $post;
			}

			$blocks = parse_blocks( (string) $post->post_content );
			$flat   = self::flatten_blocks( $blocks );
			$budget = 100;
			$items  = array();

			foreach ( $flat as $position => $block ) {
				if ( $budget <= 0 ) {
					break;
				}
				$budget--;

				$items[] = array(
					'index'     => $position,
					'name'      => isset( $block['blockName'] ) && $block['blockName'] ? (string) $block['blockName'] : '',
					'attributes' => isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : array(),
					'html'      => isset( $block['innerHTML'] ) ? (string) $block['innerHTML'] : '',
				);
			}

			return array(
				'id'         => (int) $post->ID,
				'count'      => count( $flat ),
				'truncated'  => count( $flat ) > 100,
				'blocks'     => $items,
			);
		}

		/**
		 * Replaces exactly one top-level block, then proves the rest survived.
		 *
		 * The whole document is re-serialised, so the verification compares the
		 * block count and the replaced block's own HTML rather than the bytes.
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function blocks_replace( $args ) {
			$post = self::load_writable_post( $args );
			if ( is_wp_error( $post ) ) {
				return $post;
			}

			$index = isset( $args['index'] ) ? (int) $args['index'] : -1;
			if ( $index < 0 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'Field "index" must be a block index from blocks.parse.' );
			}

			$html = isset( $args['html'] ) ? (string) $args['html'] : '';
			if ( '' === trim( $html ) ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'Field "html" is required for blocks.replace.' );
			}

			$blocks = parse_blocks( (string) $post->post_content );
			if ( ! isset( $blocks[ $index ] ) ) {
				return new WP_Error(
					'kph_sp_block_not_found',
					sprintf( 'This post has no block at index %d (it has %d).', $index, count( $blocks ) )
				);
			}

			$replacement = parse_blocks( wp_kses_post( $html ) );
			if ( count( $replacement ) !== 1 ) {
				return new WP_Error(
					'kph_sp_invalid_argument',
					sprintf( 'The replacement must be exactly one block, got %d.', count( $replacement ) )
				);
			}

			$before         = self::snapshot( $post );
			$blocks[ $index ] = $replacement[0];

			$result = wp_update_post(
				wp_slash(
					array(
						'ID'           => (int) $post->ID,
						'post_content' => serialize_blocks( $blocks ),
					)
				),
				true
			);

			if ( is_wp_error( $result ) ) {
				return new WP_Error( 'kph_sp_write_failed', (string) $result->get_error_message() );
			}
			if ( 0 === (int) $result ) {
				return new WP_Error( 'kph_sp_write_failed', 'WordPress refused the update.' );
			}

			$fresh = get_post( (int) $post->ID );
			if ( ! $fresh ) {
				return new WP_Error( 'kph_sp_read_failed', 'The post could not be read back after writing.' );
			}

			$after_blocks = parse_blocks( (string) $fresh->post_content );
			$expected     = $replacement[0];

			$same_count = count( $after_blocks ) === count( $blocks );
			$same_block = isset( $after_blocks[ $index ] )
				&& self::normalize_html( (string) ( $after_blocks[ $index ]['innerHTML'] ?? '' ) )
					=== self::normalize_html( (string) ( $expected['innerHTML'] ?? '' ) );

			if ( ! $same_count || ! $same_block ) {
				return new WP_Error(
					'kph_sp_verification_failed',
					'WordPress stored a different block structure than requested; the change was not confirmed.',
					array(
						'before'           => $before,
						'expectedBlocks'   => count( $blocks ),
						'actualBlocks'     => count( $after_blocks ),
						'expectedHtml'     => (string) ( $expected['innerHTML'] ?? '' ),
						'actualHtml'       => isset( $after_blocks[ $index ] ) ? (string) ( $after_blocks[ $index ]['innerHTML'] ?? '' ) : '',
					)
				);
			}

			return array(
				'verified' => true,
				'id'       => (int) $post->ID,
				'index'    => $index,
				'name'     => isset( $expected['blockName'] ) ? (string) $expected['blockName'] : '',
				'before'   => $before,
				'after'    => self::read_back( (int) $post->ID ),
			);
		}

		/**
		 * Publishes or unpublishes through the verified update path, so a status
		 * change keeps its snapshot and its undo like any other write.
		 *
		 * @param array<string,mixed> $args   Arguments.
		 * @param string              $status Target status.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function content_publish( $args, $status ) {
			$post = self::load_writable_post( $args );
			if ( is_wp_error( $post ) ) {
				return $post;
			}

			return self::apply_update( $post, array( 'status' => $status ) );
		}

		/**
		 * Flattens nested blocks into document order, one entry per block.
		 *
		 * @param array<int,array<string,mixed>> $blocks Parsed blocks.
		 * @return array<int,array<string,mixed>>
		 */
		private static function flatten_blocks( $blocks ) {
			$flat = array();

			foreach ( (array) $blocks as $block ) {
				if ( ! is_array( $block ) ) {
					continue;
				}

				if ( ! empty( $block['blockName'] ) || '' !== trim( (string) ( $block['innerHTML'] ?? '' ) ) ) {
					$flat[] = $block;
				}

				if ( ! empty( $block['innerBlocks'] ) ) {
					$flat = array_merge( $flat, self::flatten_blocks( $block['innerBlocks'] ) );
				}
			}

			return $flat;
		}

		/**
		 * Loads the post named by `args['id']`, refusing anything the connector
		 * must not write (missing id, unknown post, non-public post type).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return WP_Post|WP_Error
		 */
		private static function load_writable_post( $args ) {
			$id = isset( $args['id'] ) ? (int) $args['id'] : 0;
			if ( $id <= 0 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'Field "id" must be a positive post or page id.' );
			}

			$post = get_post( $id );
			if ( ! $post ) {
				return new WP_Error( 'kph_sp_not_found', sprintf( 'Post %d does not exist on this site.', $id ) );
			}

			if ( ! self::is_writable_type( (string) $post->post_type ) ) {
				return new WP_Error(
					'kph_sp_unsupported_type',
					sprintf( 'Post type "%s" is not writable through the connector.', (string) $post->post_type )
				);
			}

			return $post;
		}

		/**
		 * Whitespace-insensitive HTML comparison (WordPress re-serialises blocks).
		 *
		 * @param string $html HTML fragment.
		 * @return string
		 */
		private static function normalize_html( $html ) {
			return trim( (string) preg_replace( '/\s+/', ' ', (string) $html ) );
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

			$content      = isset( $args['content'] ) ? wp_kses_post( (string) $args['content'] ) : '';
			$excerpt      = isset( $args['excerpt'] ) ? wp_kses_post( (string) $args['excerpt'] ) : '';
			$slug         = isset( $args['slug'] ) ? sanitize_title( (string) $args['slug'] ) : '';
			$featured_id  = isset( $args['featuredMediaId'] ) ? (int) $args['featuredMediaId'] : 0;
			$no_duplicate = ! empty( $args['preventDuplicateSlug'] );

			if ( $no_duplicate ) {
				$candidate_slug = '' !== $slug ? $slug : sanitize_title( $title );
				if ( '' !== $candidate_slug ) {
					$existing_post = get_page_by_path( $candidate_slug, OBJECT, $type );
					if ( $existing_post ) {
						return new WP_Error(
							'kph_sp_duplicate_slug',
							sprintf( 'A %s with slug "%s" already exists (#%d).', $type, $candidate_slug, (int) $existing_post->ID )
						);
					}
				}
			}

			if ( $featured_id > 0 && 'attachment' !== get_post_type( $featured_id ) ) {
				return new WP_Error(
					'kph_sp_invalid_argument',
					sprintf( 'featuredMediaId %d is not a valid media attachment.', $featured_id )
				);
			}

			$insert = array(
				'post_title'   => $title,
				'post_content' => $content,
				'post_excerpt' => $excerpt,
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

			if ( $featured_id > 0 ) {
				set_post_thumbnail( (int) $id, $featured_id );
			}

			$after = self::read_back( (int) $id );
			if ( is_wp_error( $after ) ) {
				return $after;
			}
			if ( $featured_id > 0 ) {
				$after['featuredMediaId'] = (int) get_post_thumbnail_id( (int) $id );
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

		/**
		 * Bounded keyword search across public posts, pages and media attachments (E4-02).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function site_search( $args ) {
			$raw_query = isset( $args['query'] ) && is_string( $args['query'] ) ? $args['query'] : '';
			$query_str = sanitize_text_field( $raw_query );
			if ( '' === $query_str || strlen( $query_str ) > 120 ) {
				return new WP_Error(
					'kph_sp_invalid_argument',
					'site.search requires a "query" string between 1 and 120 characters.'
				);
			}

			$limit = isset( $args['limit'] ) ? (int) $args['limit'] : 15;
			$limit = max( 1, min( 25, $limit ) );

			$allowed_types = array( 'post', 'page', 'attachment' );
			$post_types    = $allowed_types;
			if ( isset( $args['type'] ) && is_string( $args['type'] ) && '' !== $args['type'] ) {
				$requested = sanitize_key( $args['type'] );
				if ( ! in_array( $requested, $allowed_types, true ) ) {
					return new WP_Error(
						'kph_sp_invalid_argument',
						'site.search type must be post, page or attachment.'
					);
				}
				$post_types = array( $requested );
			}

			$wp_query = new WP_Query(
				array(
					's'              => $query_str,
					'post_type'      => $post_types,
					'post_status'    => array( 'publish', 'draft', 'pending', 'future', 'private', 'inherit' ),
					'posts_per_page' => $limit,
					'orderby'        => 'relevance',
					'no_found_rows'  => false,
				)
			);

			$items = array();
			foreach ( $wp_query->posts as $post ) {
				$items[] = array(
					'id'          => (int) $post->ID,
					'type'        => (string) $post->post_type,
					'status'      => (string) $post->post_status,
					'title'       => (string) get_the_title( $post ),
					'slug'        => (string) $post->post_name,
					'link'        => (string) esc_url_raw( (string) get_permalink( $post ) ),
					'modifiedGmt' => (string) $post->post_modified_gmt,
				);
			}

			return array(
				'query' => $query_str,
				'count' => count( $items ),
				'total' => (int) $wp_query->found_posts,
				'items' => $items,
			);
		}

		/**
		 * Creates (or finds) a term in a public taxonomy (E5-12).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function terms_create( $args ) {
			$taxonomy = isset( $args['taxonomy'] ) ? sanitize_key( (string) $args['taxonomy'] ) : 'category';
			$allowed  = get_taxonomies( array( 'public' => true ), 'names' );

			if ( ! in_array( $taxonomy, $allowed, true ) ) {
				return new WP_Error(
					'kph_sp_invalid_taxonomy',
					sprintf( 'Taxonomy "%s" is not public on this site.', $taxonomy )
				);
			}

			$name = isset( $args['name'] ) && is_string( $args['name'] )
				? sanitize_text_field( $args['name'] )
				: '';
			if ( '' === $name || strlen( $name ) > 120 ) {
				return new WP_Error(
					'kph_sp_invalid_argument',
					'terms.create requires a "name" between 1 and 120 characters.'
				);
			}

			$existing = term_exists( $name, $taxonomy );
			if ( $existing ) {
				$term_id = is_array( $existing ) ? (int) $existing['term_id'] : (int) $existing;
				$term    = get_term( $term_id, $taxonomy );
				if ( $term && ! is_wp_error( $term ) ) {
					return array(
						'verified' => true,
						'created'  => false,
						'taxonomy' => $taxonomy,
						'term'     => array(
							'id'     => (int) $term->term_id,
							'name'   => (string) $term->name,
							'slug'   => (string) $term->slug,
							'parent' => (int) $term->parent,
						),
					);
				}
			}

			$insert_args = array();
			if ( isset( $args['slug'] ) && is_string( $args['slug'] ) && '' !== $args['slug'] ) {
				$insert_args['slug'] = sanitize_title( $args['slug'] );
			}
			if ( isset( $args['description'] ) && is_string( $args['description'] ) ) {
				$insert_args['description'] = substr( sanitize_textarea_field( $args['description'] ), 0, 500 );
			}
			if ( isset( $args['parent'] ) && is_int( $args['parent'] ) && $args['parent'] > 0 ) {
				$insert_args['parent'] = (int) $args['parent'];
			}

			$created = wp_insert_term( $name, $taxonomy, $insert_args );
			if ( is_wp_error( $created ) ) {
				return $created;
			}

			$term_id = isset( $created['term_id'] ) ? (int) $created['term_id'] : 0;
			$term    = get_term( $term_id, $taxonomy );
			if ( ! $term || is_wp_error( $term ) ) {
				return new WP_Error(
					'kph_sp_verification_failed',
					'Created term could not be read back for verification.'
				);
			}

			return array(
				'verified' => true,
				'created'  => true,
				'taxonomy' => $taxonomy,
				'term'     => array(
					'id'     => (int) $term->term_id,
					'name'   => (string) $term->name,
					'slug'   => (string) $term->slug,
					'parent' => (int) $term->parent,
				),
			);
		}

		/**
		 * Assigns terms in a public taxonomy to a writable post, with before-snapshot
		 * and read-back verification (E5-12).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function terms_assign( $args ) {
			return self::mutate_object_terms( $args, false );
		}

		/**
		 * Restores exact term IDs captured before a `terms.assign` write (E5-12 undo).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function terms_restore( $args ) {
			return self::mutate_object_terms( $args, true );
		}

		/**
		 * Shared verified mutation path for `terms.assign` and `terms.restore`.
		 *
		 * @param array<string,mixed> $args       Arguments.
		 * @param bool                $is_restore Whether empty termIds are permitted (restoring 0 terms).
		 * @return array<string,mixed>|WP_Error
		 */
		private static function mutate_object_terms( $args, $is_restore ) {
			$post = self::load_writable_post( $args );
			if ( is_wp_error( $post ) ) {
				return $post;
			}

			$taxonomy = isset( $args['taxonomy'] ) ? sanitize_key( (string) $args['taxonomy'] ) : 'category';
			$allowed  = get_taxonomies( array( 'public' => true ), 'names' );
			if ( ! in_array( $taxonomy, $allowed, true ) ) {
				return new WP_Error(
					'kph_sp_invalid_taxonomy',
					sprintf( 'Taxonomy "%s" is not public on this site.', $taxonomy )
				);
			}

			if ( ! is_object_in_taxonomy( $post->post_type, $taxonomy ) ) {
				return new WP_Error(
					'kph_sp_invalid_taxonomy',
					sprintf( 'Taxonomy "%s" is not attached to post type "%s".', $taxonomy, $post->post_type )
				);
			}

			$raw_terms = null;
			if ( $is_restore && isset( $args['termIds'] ) && is_array( $args['termIds'] ) ) {
				$raw_terms = $args['termIds'];
			} elseif ( isset( $args['terms'] ) && is_array( $args['terms'] ) ) {
				$raw_terms = $args['terms'];
			}

			if ( ! is_array( $raw_terms ) || ( ! $is_restore && empty( $raw_terms ) ) || count( $raw_terms ) > 50 ) {
				return new WP_Error(
					'kph_sp_invalid_argument',
					$is_restore
						? 'terms.restore requires a "termIds" array (0–50 integer IDs).'
						: 'terms.assign requires a non-empty "terms" array (1–50 term IDs or names).'
				);
			}

			$normalized = array();
			foreach ( $raw_terms as $entry ) {
				if ( is_int( $entry ) && $entry > 0 ) {
					$normalized[] = (int) $entry;
				} elseif ( ! $is_restore && is_string( $entry ) ) {
					$clean = sanitize_text_field( $entry );
					if ( '' === $clean || strlen( $clean ) > 120 ) {
						return new WP_Error( 'kph_sp_invalid_argument', 'Each term name must be 1–120 characters.' );
					}
					$normalized[] = $clean;
				} else {
					return new WP_Error(
						'kph_sp_invalid_argument',
						$is_restore ? 'termIds must contain positive integer IDs.' : 'Each term must be a positive integer ID or string.'
					);
				}
			}

			$append = ! $is_restore && isset( $args['append'] ) ? (bool) $args['append'] : false;

			$before_raw = wp_get_object_terms( $post->ID, $taxonomy, array( 'fields' => 'ids' ) );
			if ( is_wp_error( $before_raw ) ) {
				return $before_raw;
			}
			$before_ids = array_values( array_map( 'intval', (array) $before_raw ) );
			sort( $before_ids );

			$set_result = wp_set_object_terms( $post->ID, $normalized, $taxonomy, $append );
			if ( is_wp_error( $set_result ) ) {
				return $set_result;
			}

			$after_raw = wp_get_object_terms( $post->ID, $taxonomy, array( 'fields' => 'ids' ) );
			if ( is_wp_error( $after_raw ) ) {
				wp_set_object_terms( $post->ID, $before_ids, $taxonomy, false );
				return $after_raw;
			}
			$after_ids = array_values( array_map( 'intval', (array) $after_raw ) );
			sort( $after_ids );

			if ( $is_restore ) {
				$expected_ids = array_values( array_unique( array_map( 'intval', $normalized ) ) );
				sort( $expected_ids );
				if ( $expected_ids !== $after_ids ) {
					wp_set_object_terms( $post->ID, $before_ids, $taxonomy, false );
					return new WP_Error(
						'kph_sp_verification_failed',
						'Restored term IDs did not match the snapshot.',
						array(
							'expected' => $expected_ids,
							'actual'   => $after_ids,
						)
					);
				}
			} elseif ( ! empty( $normalized ) && empty( $after_ids ) ) {
				wp_set_object_terms( $post->ID, $before_ids, $taxonomy, false );
				return new WP_Error(
					'kph_sp_verification_failed',
					'Assigned terms could not be read back from the post.'
				);
			}

			return array(
				'verified'         => true,
				'restored'         => (bool) $is_restore,
				'id'               => (int) $post->ID,
				'taxonomy'         => $taxonomy,
				'snapshotResource' => sprintf( 'terms:%d:%s', (int) $post->ID, $taxonomy ),
				'before'           => array(
					'id'       => (int) $post->ID,
					'taxonomy' => $taxonomy,
					'termIds'  => $before_ids,
				),
				'after'            => array(
					'id'       => (int) $post->ID,
					'taxonomy' => $taxonomy,
					'termIds'  => $after_ids,
				),
			);
		}

		/**
		 * Bounded, path- and secret-redacted tail of wp-content/debug.log (E4-05).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>
		 */
		private static function site_logs( $args ) {
			$max_lines = isset( $args['lines'] ) ? (int) $args['lines'] : 50;
			$max_lines = max( 1, min( 80, $max_lines ) );

			$content_dir = defined( 'WP_CONTENT_DIR' ) ? (string) WP_CONTENT_DIR : ABSPATH . 'wp-content';
			$candidate   = rtrim( $content_dir, '/\\' ) . '/debug.log';
			$real_base   = realpath( $content_dir );
			$real_log    = file_exists( $candidate ) ? realpath( $candidate ) : false;

			if ( false === $real_base || false === $real_log || 0 !== strpos( $real_log, $real_base ) || ! is_readable( $real_log ) ) {
				return array(
					'exists'    => false,
					'count'     => 0,
					'truncated' => false,
					'lines'     => array(),
				);
			}

			$size      = (int) filesize( $real_log );
			$max_bytes = 65536;
			$truncated = $size > $max_bytes;
			$raw       = '';

			$fh = @fopen( $real_log, 'rb' );
			if ( is_resource( $fh ) ) {
				if ( $truncated ) {
					@fseek( $fh, -$max_bytes, SEEK_END );
				}
				$chunk = @fread( $fh, $max_bytes );
				if ( is_string( $chunk ) ) {
					$raw = $chunk;
				}
				@fclose( $fh );
			}

			$raw_lines = preg_split( '/\r\n|\r|\n/', trim( $raw ) );
			if ( ! is_array( $raw_lines ) ) {
				$raw_lines = array();
			}
			if ( $truncated && count( $raw_lines ) > 1 ) {
				// First line after mid-file seek may be partial; drop it cleanly.
				array_shift( $raw_lines );
			}

			$tail    = array_slice( array_values( array_filter( $raw_lines, 'strlen' ) ), -$max_lines );
			$cleaned = array();
			foreach ( $tail as $line ) {
				$sanitized = self::redact_log_line( (string) $line );
				if ( '' !== $sanitized ) {
					$cleaned[] = $sanitized;
				}
			}

			return array(
				'exists'    => true,
				'count'     => count( $cleaned ),
				'truncated' => $truncated || count( $raw_lines ) > $max_lines,
				'lines'     => $cleaned,
			);
		}

		/**
		 * Redacts server paths, email addresses, and credential-like query tokens.
		 *
		 * @param string $line Raw debug.log line.
		 * @return string
		 */
		private static function redact_log_line( $line ) {
			$out = substr( $line, 0, 500 );
			if ( class_exists( 'KPH_SP_Fatal' ) && method_exists( 'KPH_SP_Fatal', 'redact_paths' ) ) {
				$out = KPH_SP_Fatal::redact_paths( $out );
			}
			if ( defined( 'ABSPATH' ) && '' !== ABSPATH ) {
				$out = str_replace( ABSPATH, '[wp-root]/', $out );
			}
			$out = (string) preg_replace( '/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/', '[redacted-email]', $out );
			$out = (string) preg_replace( '/((?:api[_-]?key|token|secret|password|passwd|authorization)\s*[=:]\s*)[^\s&"\']+/i', '$1[redacted]', $out );
			return trim( $out );
		}

		/**
		 * Explicit allowlist of SEO post-meta keys (Yoast, Rank Math, SEOPress, SitePilot).
		 *
		 * @return string[]
		 */
		private static function allowed_seo_meta_keys() {
			return array(
				'_yoast_wpseo_title',
				'_yoast_wpseo_metadesc',
				'_yoast_wpseo_canonical',
				'_yoast_wpseo_opengraph-title',
				'_yoast_wpseo_opengraph-description',
				'_yoast_wpseo_meta-robots-noindex',
				'rank_math_title',
				'rank_math_description',
				'rank_math_canonical_url',
				'rank_math_facebook_title',
				'rank_math_facebook_description',
				'rank_math_robots',
				'_seopress_titles_title',
				'_seopress_titles_desc',
				'_seopress_robots_canonical',
				'_seopress_social_fb_title',
				'_seopress_social_fb_desc',
				'_seopress_robots_index',
				'_sitepilot_seo_title',
				'_sitepilot_seo_description',
				'_sitepilot_seo_canonical',
				'_sitepilot_seo_og_title',
				'_sitepilot_seo_og_description',
				'_sitepilot_seo_noindex',
			);
		}

		/**
		 * Complete allowlist of post-meta keys writable by any Connector v1.0.0 tool.
		 * Arbitrary post-meta keys are strictly refused.
		 *
		 * @return string[]
		 */
		private static function allowed_post_meta_keys() {
			return array_merge(
				array(
					'_wp_attachment_image_alt',
					'_thumbnail_id',
				),
				self::allowed_seo_meta_keys()
			);
		}

		/**
		 * Writes a single allowlisted post-meta key, refusing everything else.
		 *
		 * @param int    $object_id Post or attachment ID.
		 * @param string $meta_key  Allowlisted meta key.
		 * @param string $value     Sanitized string value.
		 * @return true|WP_Error
		 */
		private static function update_allowlisted_post_meta( $object_id, $meta_key, $value ) {
			if ( ! in_array( $meta_key, self::allowed_post_meta_keys(), true ) ) {
				return new WP_Error(
					'kph_sp_meta_not_allowed',
					sprintf( 'Post meta key "%s" is not writable through the connector.', $meta_key )
				);
			}

			update_post_meta( (int) $object_id, $meta_key, wp_slash( (string) $value ) );
			return true;
		}

		/**
		 * Detects the active SEO provider, defaulting to universal SitePilot meta keys.
		 *
		 * @return string
		 */
		private static function detect_seo_provider() {
			if ( defined( 'WPSEO_VERSION' ) ) {
				return 'yoast';
			}
			if ( class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' ) ) {
				return 'rankmath';
			}
			if ( defined( 'SEOPRESS_VERSION' ) ) {
				return 'seopress';
			}
			return 'sitepilot';
		}

		/**
		 * Maps logical SEO fields to concrete allowlisted post-meta keys for a provider.
		 *
		 * @param string $provider Provider slug.
		 * @return array<string,string>
		 */
		private static function seo_provider_keymap( $provider ) {
			switch ( $provider ) {
				case 'yoast':
					return array(
						'title'         => '_yoast_wpseo_title',
						'description'   => '_yoast_wpseo_metadesc',
						'canonical'     => '_yoast_wpseo_canonical',
						'ogTitle'       => '_yoast_wpseo_opengraph-title',
						'ogDescription' => '_yoast_wpseo_opengraph-description',
						'noindex'       => '_yoast_wpseo_meta-robots-noindex',
					);
				case 'rankmath':
					return array(
						'title'         => 'rank_math_title',
						'description'   => 'rank_math_description',
						'canonical'     => 'rank_math_canonical_url',
						'ogTitle'       => 'rank_math_facebook_title',
						'ogDescription' => 'rank_math_facebook_description',
						'noindex'       => 'rank_math_robots',
					);
				case 'seopress':
					return array(
						'title'         => '_seopress_titles_title',
						'description'   => '_seopress_titles_desc',
						'canonical'     => '_seopress_robots_canonical',
						'ogTitle'       => '_seopress_social_fb_title',
						'ogDescription' => '_seopress_social_fb_desc',
						'noindex'       => '_seopress_robots_index',
					);
				default:
					return array(
						'title'         => '_sitepilot_seo_title',
						'description'   => '_sitepilot_seo_description',
						'canonical'     => '_sitepilot_seo_canonical',
						'ogTitle'       => '_sitepilot_seo_og_title',
						'ogDescription' => '_sitepilot_seo_og_description',
						'noindex'       => '_sitepilot_seo_noindex',
					);
			}
		}

		/**
		 * Encodes boolean noindex into the provider's native meta representation.
		 *
		 * @param string $provider Provider slug.
		 * @param bool   $noindex  Desired noindex flag.
		 * @return string
		 */
		private static function encode_seo_noindex( $provider, $noindex ) {
			if ( ! $noindex ) {
				return 'rankmath' === $provider ? 'index' : '';
			}
			if ( 'rankmath' === $provider ) {
				return 'noindex';
			}
			if ( 'seopress' === $provider ) {
				return 'yes';
			}
			return '1';
		}

		/**
		 * Decodes a provider's stored noindex value into a boolean.
		 *
		 * @param string $provider Provider slug.
		 * @param string $raw      Stored meta string.
		 * @return bool
		 */
		private static function decode_seo_noindex( $provider, $raw ) {
			$val = strtolower( trim( (string) $raw ) );
			if ( 'rankmath' === $provider ) {
				return false !== strpos( $val, 'noindex' );
			}
			if ( 'seopress' === $provider ) {
				return 'yes' === $val || '1' === $val;
			}
			return '1' === $val || 'true' === $val || 'noindex' === $val;
		}

		/**
		 * Reads SEO metadata for a public post (E7-01).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function seo_meta_get( $args ) {
			$id = isset( $args['id'] ) ? (int) $args['id'] : 0;
			if ( $id <= 0 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'seo.meta.get requires a positive integer id.' );
			}

			$post = get_post( $id );
			if ( ! $post ) {
				return new WP_Error( 'kph_sp_not_found', sprintf( 'Post %d does not exist.', $id ) );
			}

			$allowed_types = array_keys( get_post_types( array( 'public' => true ) ) );
			if ( ! in_array( $post->post_type, $allowed_types, true ) ) {
				return new WP_Error( 'kph_sp_not_allowed', 'That post type is not publicly addressable.' );
			}

			$provider = self::detect_seo_provider();
			$keymap   = self::seo_provider_keymap( $provider );
			$raw_meta = array();
			foreach ( $keymap as $field => $meta_key ) {
				$stored = get_post_meta( (int) $post->ID, $meta_key, true );
				$raw_meta[ $meta_key ] = is_scalar( $stored ) ? (string) $stored : '';
			}

			return array(
				'id'            => (int) $post->ID,
				'provider'      => $provider,
				'title'         => $raw_meta[ $keymap['title'] ],
				'description'   => $raw_meta[ $keymap['description'] ],
				'canonical'     => $raw_meta[ $keymap['canonical'] ],
				'ogTitle'       => $raw_meta[ $keymap['ogTitle'] ],
				'ogDescription' => $raw_meta[ $keymap['ogDescription'] ],
				'noindex'       => self::decode_seo_noindex( $provider, $raw_meta[ $keymap['noindex'] ] ),
				'meta'          => $raw_meta,
			);
		}

		/**
		 * Updates allowlisted SEO post-meta with snapshot, verification, and rollback (E7-02).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function seo_meta_update( $args ) {
			$post = self::load_writable_post( $args );
			if ( is_wp_error( $post ) ) {
				return $post;
			}

			$provider = self::detect_seo_provider();
			$keymap   = self::seo_provider_keymap( $provider );
			$writes   = array();

			if ( array_key_exists( 'title', $args ) && null !== $args['title'] ) {
				$writes[ $keymap['title'] ] = substr( sanitize_text_field( (string) $args['title'] ), 0, 300 );
			}
			if ( array_key_exists( 'description', $args ) && null !== $args['description'] ) {
				$writes[ $keymap['description'] ] = substr( sanitize_textarea_field( (string) $args['description'] ), 0, 500 );
			}
			if ( array_key_exists( 'canonical', $args ) && null !== $args['canonical'] ) {
				$raw_url = trim( (string) $args['canonical'] );
				if ( '' !== $raw_url ) {
					$clean_url = esc_url_raw( $raw_url );
					if ( '' === $clean_url || ! preg_match( '/^https?:\/\//i', $clean_url ) ) {
						return new WP_Error( 'kph_sp_invalid_argument', 'canonical must be a valid http(s) URL or empty string.' );
					}
					$writes[ $keymap['canonical'] ] = substr( $clean_url, 0, 500 );
				} else {
					$writes[ $keymap['canonical'] ] = '';
				}
			}
			if ( array_key_exists( 'ogTitle', $args ) && null !== $args['ogTitle'] ) {
				$writes[ $keymap['ogTitle'] ] = substr( sanitize_text_field( (string) $args['ogTitle'] ), 0, 300 );
			}
			if ( array_key_exists( 'ogDescription', $args ) && null !== $args['ogDescription'] ) {
				$writes[ $keymap['ogDescription'] ] = substr( sanitize_textarea_field( (string) $args['ogDescription'] ), 0, 500 );
			}
			if ( array_key_exists( 'noindex', $args ) && is_bool( $args['noindex'] ) ) {
				$writes[ $keymap['noindex'] ] = self::encode_seo_noindex( $provider, (bool) $args['noindex'] );
			}

			if ( empty( $writes ) ) {
				return new WP_Error(
					'kph_sp_invalid_argument',
					'seo.meta.update requires at least one of title, description, canonical, ogTitle, ogDescription, or noindex.'
				);
			}

			return self::apply_seo_meta_writes( (int) $post->ID, $provider, $writes, false );
		}

		/**
		 * Restores allowlisted SEO post-meta from a snapshot (E7-02 undo).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function seo_meta_restore( $args ) {
			$post = self::load_writable_post( $args );
			if ( is_wp_error( $post ) ) {
				return $post;
			}

			$raw_meta = isset( $args['meta'] ) && is_array( $args['meta'] ) ? $args['meta'] : array();
			if ( empty( $raw_meta ) ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'seo.meta.restore requires a non-empty "meta" map.' );
			}

			$allowed = self::allowed_seo_meta_keys();
			$writes  = array();
			foreach ( $raw_meta as $key => $value ) {
				$clean_key = (string) $key;
				if ( ! in_array( $clean_key, $allowed, true ) || ! is_string( $value ) ) {
					return new WP_Error(
						'kph_sp_meta_not_allowed',
						sprintf( 'SEO meta key "%s" is not restorable.', $clean_key )
					);
				}
				$writes[ $clean_key ] = substr( sanitize_textarea_field( $value ), 0, 1000 );
			}

			$provider = isset( $args['provider'] ) && is_string( $args['provider'] )
				? sanitize_key( $args['provider'] )
				: self::detect_seo_provider();

			return self::apply_seo_meta_writes( (int) $post->ID, $provider, $writes, true );
		}

		/**
		 * Shared snapshot → write → read-back → verify helper for SEO meta writes.
		 *
		 * @param int                  $post_id    Post ID.
		 * @param string               $provider   SEO provider slug.
		 * @param array<string,string> $writes     Map of allowlisted meta key => target string.
		 * @param bool                 $is_restore True when invoked from `seo.meta.restore`.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function apply_seo_meta_writes( $post_id, $provider, $writes, $is_restore ) {
			$before_meta = array();
			foreach ( $writes as $meta_key => $expected_value ) {
				$existing                 = get_post_meta( $post_id, $meta_key, true );
				$before_meta[ $meta_key ] = is_scalar( $existing ) ? (string) $existing : '';
			}

			foreach ( $writes as $meta_key => $expected_value ) {
				$res = self::update_allowlisted_post_meta( $post_id, $meta_key, $expected_value );
				if ( is_wp_error( $res ) ) {
					return $res;
				}
			}

			$after_meta = array();
			foreach ( $writes as $meta_key => $expected_value ) {
				$actual                  = get_post_meta( $post_id, $meta_key, true );
				$after_meta[ $meta_key ] = is_scalar( $actual ) ? (string) $actual : '';
				if ( $after_meta[ $meta_key ] !== (string) $expected_value ) {
					foreach ( $before_meta as $rollback_key => $rollback_val ) {
						self::update_allowlisted_post_meta( $post_id, $rollback_key, $rollback_val );
					}
					return new WP_Error(
						'kph_sp_verification_failed',
						sprintf( 'SEO meta key "%s" did not match after write; rolled back.', $meta_key )
					);
				}
			}

			return array(
				'verified'         => true,
				'restored'         => (bool) $is_restore,
				'id'               => $post_id,
				'provider'         => $provider,
				'snapshotResource' => sprintf( 'seo:%d', $post_id ),
				'before'           => array(
					'id'       => $post_id,
					'provider' => $provider,
					'meta'     => $before_meta,
				),
				'after'            => array(
					'id'       => $post_id,
					'provider' => $provider,
					'meta'     => $after_meta,
				),
			);
		}

		/**
		 * Updates media attachment alt text, title, caption, or description (E5-10).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function media_update( $args ) {
			return self::mutate_media_attachment( $args, false );
		}

		/**
		 * Restores media attachment metadata from a snapshot (E5-10 undo).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function media_restore( $args ) {
			return self::mutate_media_attachment( $args, true );
		}

		/**
		 * Shared snapshot → write → read-back → verify helper for media metadata.
		 *
		 * @param array<string,mixed> $args       Arguments.
		 * @param bool                $is_restore True when restoring from snapshot.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function mutate_media_attachment( $args, $is_restore ) {
			$id = isset( $args['id'] ) ? (int) $args['id'] : 0;
			if ( $id <= 0 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'media.update requires a positive attachment id.' );
			}

			$attachment = get_post( $id );
			if ( ! $attachment || 'attachment' !== $attachment->post_type ) {
				return new WP_Error( 'kph_sp_not_found', sprintf( 'Attachment %d does not exist.', $id ) );
			}

			$has_alt   = array_key_exists( 'alt', $args ) && null !== $args['alt'];
			$has_title = array_key_exists( 'title', $args ) && null !== $args['title'];
			$has_cap   = array_key_exists( 'caption', $args ) && null !== $args['caption'];
			$has_desc  = array_key_exists( 'description', $args ) && null !== $args['description'];

			if ( ! $has_alt && ! $has_title && ! $has_cap && ! $has_desc ) {
				return new WP_Error(
					'kph_sp_invalid_argument',
					'media.update requires at least one of alt, title, caption, or description.'
				);
			}

			$before_alt = get_post_meta( $id, '_wp_attachment_image_alt', true );
			$before     = array(
				'id'          => $id,
				'alt'         => is_scalar( $before_alt ) ? (string) $before_alt : '',
				'title'       => (string) $attachment->post_title,
				'caption'     => (string) $attachment->post_excerpt,
				'description' => (string) $attachment->post_content,
			);

			$post_update = array( 'ID' => $id );
			$expected    = $before;

			if ( $has_title ) {
				$clean_title               = substr( sanitize_text_field( (string) $args['title'] ), 0, 300 );
				$post_update['post_title'] = $clean_title;
				$expected['title']         = $clean_title;
			}
			if ( $has_cap ) {
				$clean_cap                   = substr( wp_kses_post( (string) $args['caption'] ), 0, 1000 );
				$post_update['post_excerpt'] = $clean_cap;
				$expected['caption']         = $clean_cap;
			}
			if ( $has_desc ) {
				$clean_desc                  = substr( wp_kses_post( (string) $args['description'] ), 0, 4000 );
				$post_update['post_content'] = $clean_desc;
				$expected['description']     = $clean_desc;
			}

			if ( count( $post_update ) > 1 ) {
				$updated = wp_update_post( wp_slash( $post_update ), true );
				if ( is_wp_error( $updated ) ) {
					return new WP_Error( 'kph_sp_write_failed', (string) $updated->get_error_message() );
				}
			}

			if ( $has_alt ) {
				$clean_alt       = substr( sanitize_text_field( (string) $args['alt'] ), 0, 300 );
				$expected['alt'] = $clean_alt;
				$meta_res        = self::update_allowlisted_post_meta( $id, '_wp_attachment_image_alt', $clean_alt );
				if ( is_wp_error( $meta_res ) ) {
					return $meta_res;
				}
			}

			$fresh     = get_post( $id );
			$fresh_alt = get_post_meta( $id, '_wp_attachment_image_alt', true );
			$after     = array(
				'id'          => $id,
				'alt'         => is_scalar( $fresh_alt ) ? (string) $fresh_alt : '',
				'title'       => $fresh ? (string) $fresh->post_title : '',
				'caption'     => $fresh ? (string) $fresh->post_excerpt : '',
				'description' => $fresh ? (string) $fresh->post_content : '',
			);

			if ( $after['alt'] !== $expected['alt'] || $after['title'] !== $expected['title'] ) {
				return new WP_Error(
					'kph_sp_verification_failed',
					'Media attachment metadata did not match on read-back.',
					array(
						'before' => $before,
						'after'  => $after,
					)
				);
			}

			return array(
				'verified'         => true,
				'restored'         => (bool) $is_restore,
				'id'               => $id,
				'snapshotResource' => sprintf( 'media:%d', $id ),
				'before'           => $before,
				'after'            => $after,
			);
		}

		/**
		 * Sets or clears a writable post's featured image with snapshot & undo (E5-10).
		 *
		 * @param array<string,mixed> $args       Arguments.
		 * @param bool                $is_restore True when restoring from snapshot.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function media_set_featured( $args, $is_restore ) {
			$post = self::load_writable_post( $args );
			if ( is_wp_error( $post ) ) {
				return $post;
			}

			if ( ! isset( $args['mediaId'] ) || ! is_numeric( $args['mediaId'] ) ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'media.set_featured requires integer mediaId (0 to clear).' );
			}

			$media_id = (int) $args['mediaId'];
			if ( $media_id < 0 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'mediaId cannot be negative.' );
			}
			if ( $media_id > 0 && 'attachment' !== get_post_type( $media_id ) ) {
				return new WP_Error(
					'kph_sp_not_found',
					sprintf( 'Attachment %d does not exist.', $media_id )
				);
			}

			$before_media_id = (int) get_post_thumbnail_id( (int) $post->ID );
			if ( $media_id > 0 ) {
				set_post_thumbnail( (int) $post->ID, $media_id );
			} else {
				$meta_res = self::update_allowlisted_post_meta( (int) $post->ID, '_thumbnail_id', '' );
				if ( is_wp_error( $meta_res ) ) {
					return $meta_res;
				}
			}

			$after_media_id = (int) get_post_thumbnail_id( (int) $post->ID );
			if ( $after_media_id !== $media_id ) {
				if ( $before_media_id > 0 ) {
					set_post_thumbnail( (int) $post->ID, $before_media_id );
				} else {
					self::update_allowlisted_post_meta( (int) $post->ID, '_thumbnail_id', '' );
				}
				return new WP_Error(
					'kph_sp_verification_failed',
					'Featured image ID did not match on read-back; rolled back.'
				);
			}

			return array(
				'verified'         => true,
				'restored'         => (bool) $is_restore,
				'id'               => (int) $post->ID,
				'snapshotResource' => sprintf( 'featured:%d', (int) $post->ID ),
				'before'           => array(
					'id'      => (int) $post->ID,
					'mediaId' => $before_media_id,
				),
				'after'            => array(
					'id'      => (int) $post->ID,
					'mediaId' => $after_media_id,
				),
			);
		}

		/**
		 * Creates or updates a navigation menu, its items, and theme locations (E5-13).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function menus_save( $args ) {
			$raw_items = isset( $args['items'] ) && is_array( $args['items'] ) ? $args['items'] : array();
			if ( empty( $raw_items ) || count( $raw_items ) > 50 ) {
				return new WP_Error(
					'kph_sp_invalid_argument',
					'menus.save requires between 1 and 50 items.'
				);
			}

			$clean_items = self::sanitize_menu_items( $raw_items );
			if ( is_wp_error( $clean_items ) ) {
				return $clean_items;
			}

			$menu_id = isset( $args['menuId'] ) ? (int) $args['menuId'] : 0;
			$name    = isset( $args['name'] ) && is_string( $args['name'] )
				? sanitize_text_field( $args['name'] )
				: '';

			$menu_obj = null;
			if ( $menu_id > 0 ) {
				$menu_obj = wp_get_nav_menu_object( $menu_id );
				if ( ! $menu_obj ) {
					return new WP_Error( 'kph_sp_not_found', sprintf( 'Navigation menu %d does not exist.', $menu_id ) );
				}
			} elseif ( '' !== $name ) {
				$existing = wp_get_nav_menu_object( $name );
				if ( $existing ) {
					$menu_obj = $existing;
					$menu_id  = (int) $existing->term_id;
				} else {
					$created_id = wp_create_nav_menu( $name );
					if ( is_wp_error( $created_id ) ) {
						return $created_id;
					}
					$menu_id  = (int) $created_id;
					$menu_obj = wp_get_nav_menu_object( $menu_id );
				}
			} else {
				return new WP_Error( 'kph_sp_invalid_argument', 'menus.save requires either menuId or name.' );
			}

			$before_items     = self::read_menu_simple_items( $menu_id );
			$before_locations = (array) get_nav_menu_locations();

			$target_locations = $before_locations;
			$requested_locs   = array();
			if ( isset( $args['location'] ) && is_string( $args['location'] ) && '' !== $args['location'] ) {
				$requested_locs[] = sanitize_key( $args['location'] );
			}
			if ( isset( $args['locations'] ) && is_array( $args['locations'] ) ) {
				foreach ( $args['locations'] as $loc ) {
					if ( is_string( $loc ) && '' !== $loc ) {
						$requested_locs[] = sanitize_key( $loc );
					}
				}
			}

			if ( ! empty( $requested_locs ) ) {
				$registered = array_keys( (array) get_registered_nav_menus() );
				foreach ( array_unique( $requested_locs ) as $loc_slug ) {
					if ( empty( $registered ) || in_array( $loc_slug, $registered, true ) ) {
						$target_locations[ $loc_slug ] = $menu_id;
					}
				}
			}

			return self::apply_menu_state(
				$menu_id,
				$before_items,
				$before_locations,
				$clean_items,
				$target_locations,
				false
			);
		}

		/**
		 * Restores a navigation menu's items and locations from a snapshot (E5-13 undo).
		 *
		 * @param array<string,mixed> $args Arguments.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function menus_restore( $args ) {
			$menu_id = isset( $args['menuId'] ) ? (int) $args['menuId'] : 0;
			if ( $menu_id <= 0 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'menus.restore requires a positive integer menuId.' );
			}

			$menu_obj = wp_get_nav_menu_object( $menu_id );
			if ( ! $menu_obj ) {
				return new WP_Error( 'kph_sp_not_found', sprintf( 'Navigation menu %d does not exist.', $menu_id ) );
			}

			$raw_items = isset( $args['items'] ) && is_array( $args['items'] ) ? $args['items'] : null;
			if ( null === $raw_items || count( $raw_items ) > 100 ) {
				return new WP_Error( 'kph_sp_invalid_argument', 'menus.restore requires an items array (0–100 items).' );
			}

			$clean_items = empty( $raw_items ) ? array() : self::sanitize_menu_items( $raw_items );
			if ( is_wp_error( $clean_items ) ) {
				return $clean_items;
			}

			$before_items     = self::read_menu_simple_items( $menu_id );
			$before_locations = (array) get_nav_menu_locations();
			$target_locations = $before_locations;

			if ( isset( $args['locations'] ) && is_array( $args['locations'] ) ) {
				$target_locations = array();
				foreach ( $args['locations'] as $loc => $assigned_id ) {
					$clean_loc = sanitize_key( (string) $loc );
					if ( '' !== $clean_loc && is_numeric( $assigned_id ) && (int) $assigned_id >= 0 ) {
						$target_locations[ $clean_loc ] = (int) $assigned_id;
					}
				}
			}

			return self::apply_menu_state(
				$menu_id,
				$before_items,
				$before_locations,
				$clean_items,
				$target_locations,
				true
			);
		}

		/**
		 * Sanitizes `{ title, url }` menu item entries.
		 *
		 * @param array<int,mixed> $raw_items Raw items list.
		 * @return array<int,array<string,string>>|WP_Error
		 */
		private static function sanitize_menu_items( $raw_items ) {
			$cleaned = array();
			foreach ( $raw_items as $entry ) {
				if ( ! is_array( $entry ) ) {
					return new WP_Error( 'kph_sp_invalid_argument', 'Each menu item must be an object with title and url.' );
				}
				$title   = isset( $entry['title'] ) ? substr( sanitize_text_field( (string) $entry['title'] ), 0, 120 ) : '';
				$raw_url = isset( $entry['url'] ) ? trim( (string) $entry['url'] ) : '';
				$url     = '' !== $raw_url ? esc_url_raw( $raw_url ) : '';
				if ( '' === $title || '' === $url ) {
					return new WP_Error( 'kph_sp_invalid_argument', 'Each menu item requires a valid non-empty title and url.' );
				}
				$cleaned[] = array(
					'title' => $title,
					'url'   => $url,
				);
			}
			return $cleaned;
		}

		/**
		 * Reads simplified `{ title, url }` items for a nav menu.
		 *
		 * @param int $menu_id Term ID of nav menu.
		 * @return array<int,array<string,string>>
		 */
		private static function read_menu_simple_items( $menu_id ) {
			$existing = wp_get_nav_menu_items( $menu_id );
			if ( ! is_array( $existing ) ) {
				return array();
			}
			$items = array();
			foreach ( $existing as $item ) {
				$items[] = array(
					'title' => (string) $item->title,
					'url'   => (string) esc_url_raw( (string) $item->url ),
				);
			}
			return $items;
		}

		/**
		 * Replaces nav-menu items & theme locations with read-back verification.
		 *
		 * @param int                             $menu_id          Nav menu ID.
		 * @param array<int,array<string,string>> $before_items     Snapshot items.
		 * @param array<string,int>               $before_locations Snapshot locations.
		 * @param array<int,array<string,string>> $target_items     Desired items.
		 * @param array<string,int>               $target_locations Desired locations.
		 * @param bool                            $is_restore       Whether called from restore.
		 * @return array<string,mixed>|WP_Error
		 */
		private static function apply_menu_state(
			$menu_id,
			$before_items,
			$before_locations,
			$target_items,
			$target_locations,
			$is_restore
		) {
			$existing_items = wp_get_nav_menu_items( $menu_id );
			if ( is_array( $existing_items ) ) {
				foreach ( $existing_items as $existing_item ) {
					$item_id = (int) $existing_item->ID;
					if ( $item_id > 0 && 'nav_menu_item' === get_post_type( $item_id ) ) {
						wp_delete_post( $item_id, true );
					}
				}
			}

			$position = 1;
			foreach ( $target_items as $entry ) {
				$added = wp_update_nav_menu_item(
					$menu_id,
					0,
					array(
						'menu-item-title'    => $entry['title'],
						'menu-item-url'      => $entry['url'],
						'menu-item-status'   => 'publish',
						'menu-item-type'     => 'custom',
						'menu-item-position' => $position,
					)
				);
				if ( is_wp_error( $added ) ) {
					return $added;
				}
				$position++;
			}

			if ( $target_locations !== $before_locations ) {
				set_theme_mod( 'nav_menu_locations', $target_locations );
			}

			$after_items     = self::read_menu_simple_items( $menu_id );
			$after_locations = (array) get_nav_menu_locations();

			if ( count( $after_items ) !== count( $target_items ) ) {
				return new WP_Error(
					'kph_sp_verification_failed',
					'Menu item count did not match after write.'
				);
			}

			return array(
				'verified'         => true,
				'restored'         => (bool) $is_restore,
				'menuId'           => $menu_id,
				'snapshotResource' => sprintf( 'menu:%d', $menu_id ),
				'before'           => array(
					'menuId'    => $menu_id,
					'items'     => $before_items,
					'locations' => $before_locations,
				),
				'after'            => array(
					'menuId'    => $menu_id,
					'items'     => $after_items,
					'locations' => $after_locations,
				),
			);
		}
	}
}

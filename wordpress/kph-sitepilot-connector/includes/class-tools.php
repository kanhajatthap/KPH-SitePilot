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
				'terms.list',
				'terms.create',
				'terms.assign',
				'terms.restore',
				'menus.list',
				'settings.get',
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
				'site.info'       => 'read',
				'site.health'     => 'read',
				'site.search'     => 'read',
				'content.list'    => 'read',
				'content.get'     => 'read',
				'content.update'  => 'content',
				'content.create'  => 'content',
				'content.restore' => 'content',
				'plugins.list'    => 'site_ops',
				'theme.info'      => 'read',
				'users.list'      => 'site_ops',
				'media.list'      => 'media',
				'terms.list'      => 'read',
				'terms.create'    => 'content',
				'terms.assign'    => 'content',
				'terms.restore'   => 'content',
				'menus.list'      => 'read',
				'settings.get'    => 'read',
				'blocks.parse'    => 'read',
				'content.publish' => 'content',
				'content.unpublish' => 'content',
				'blocks.replace'  => 'content',
				'settings.update' => 'site_ops',
				'settings.restore' => 'site_ops',
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
				case 'settings.get':
					return self::settings_get( $args );
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
	}
}

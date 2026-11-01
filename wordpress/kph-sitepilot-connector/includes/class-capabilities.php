<?php
/**
 * Capability manifest.
 *
 * The planner on the platform decides what it may attempt from this manifest, so
 * it must be accurate and cheap: no database scans of content, no secrets, and
 * hard caps on list sizes so a plugin-heavy site cannot blow the request budget.
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'KPH_SP_Capabilities' ) ) {
	/**
	 * Builds the capability manifest for a site.
	 */
	final class KPH_SP_Capabilities {

		const MANIFEST_VERSION = 1;
		const MAX_PLUGINS      = 80;
		const MAX_POST_TYPES   = 40;
		const MAX_TAXONOMIES   = 40;

		/**
		 * Full manifest, safe to send on every heartbeat.
		 *
		 * @return array<string,mixed>
		 */
		public static function manifest() {
			return array(
				'manifestVersion' => self::MANIFEST_VERSION,
				'site'            => self::site(),
				'theme'           => self::theme(),
				'plugins'         => self::plugins(),
				'postTypes'       => self::post_types(),
				'taxonomies'      => self::taxonomies(),
				'builders'        => self::builders(),
				'environment'     => self::environment(),
				'users'           => self::user_counts(),
				'generatedAt'     => gmdate( 'c' ),
			);
		}

		/**
		 * Core versions and locale.
		 *
		 * @return array<string,mixed>
		 */
		public static function site() {
			return array(
				'name'          => get_bloginfo( 'name' ),
				'url'           => home_url( '/' ),
				'locale'        => get_locale(),
				'isMultisite'   => is_multisite(),
				'wpVersion'     => get_bloginfo( 'version' ),
				'phpVersion'    => PHP_VERSION,
				'pluginVersion' => KPH_SP_VERSION,
				'timezone'      => wp_timezone_string(),
			);
		}

		/**
		 * Active theme, and whether it is a block (FSE) theme.
		 *
		 * @return array<string,mixed>
		 */
		public static function theme() {
			$theme = wp_get_theme();
			$slug  = is_object( $theme ) ? $theme->get_stylesheet() : '';

			return array(
				'name'       => is_object( $theme ) ? $theme->get( 'Name' ) : '',
				'stylesheet' => $slug,
				'type'       => self::is_block_theme() ? 'block' : 'classic',
				'parent'     => is_object( $theme ) ? (string) $theme->get( 'Template' ) : '',
			);
		}

		/**
		 * True when the active theme supports full site editing.
		 *
		 * @return bool
		 */
		public static function is_block_theme() {
			if ( function_exists( 'wp_is_block_theme' ) && wp_is_block_theme() ) {
				return true;
			}

			return (bool) get_theme_support( 'block-templates' );
		}

		/**
		 * Active plugins, capped.
		 *
		 * @return array<int,array<string,string>>
		 */
		public static function plugins() {
			$active = (array) get_option( 'active_plugins', array() );
			$list   = array();

			foreach ( array_slice( $active, 0, self::MAX_PLUGINS ) as $file ) {
				$list[] = array(
					'slug'    => (string) $file,
					'name'    => (string) $file,
					'version' => '',
				);
			}

			if ( function_exists( 'get_plugins' ) && ! empty( $list ) ) {
				$installed = get_plugins();
				foreach ( $list as $index => $entry ) {
					$file = $entry['slug'];
					if ( isset( $installed[ $file ] ) ) {
						$list[ $index ]['name']    = (string) $installed[ $file ]['Name'];
						$list[ $index ]['version'] = (string) $installed[ $file ]['Version'];
					}
				}
			}

			return $list;
		}

		/**
		 * Public post types with the features they support.
		 *
		 * @return array<int,array<string,mixed>>
		 */
		public static function post_types() {
			$types = get_post_types( array( 'public' => true ), 'objects' );
			$list  = array();

			foreach ( array_slice( array_values( $types ), 0, self::MAX_POST_TYPES ) as $type ) {
				$list[] = array(
					'name'     => (string) $type->name,
					'label'    => (string) $type->label,
					'builtin'  => (bool) $type->builtin,
					'supports' => array_values( array_keys( (array) get_all_post_type_supports( $type->name ) ) ),
				);
			}

			return $list;
		}

		/**
		 * Public taxonomies and the post types they are attached to.
		 *
		 * @return array<int,array<string,mixed>>
		 */
		public static function taxonomies() {
			$taxonomies = get_taxonomies( array( 'public' => true ), 'objects' );
			$list       = array();

			foreach ( array_slice( array_values( $taxonomies ), 0, self::MAX_TAXONOMIES ) as $taxonomy ) {
				$list[] = array(
					'name'      => (string) $taxonomy->name,
					'label'     => (string) $taxonomy->label,
					'postTypes' => array_values( (array) $taxonomy->object_type ),
					'hierarchical' => (bool) $taxonomy->hierarchical,
				);
			}

			return $list;
		}

		/**
		 * Detected page builders, ecommerce and SEO/cache stacks.
		 *
		 * @return array<string,mixed>
		 */
		public static function builders() {
			$active = (array) get_option( 'active_plugins', array() );
			$joined = strtolower( implode( ' ', array_map( 'strval', $active ) ) );

			$has = static function ( $needle ) use ( $joined ) {
				return false !== strpos( $joined, $needle );
			};

			return array(
				'gutenberg'      => true,
				'blockTheme'     => self::is_block_theme(),
				'elementor'      => $has( 'elementor' ),
				'beaverBuilder'  => $has( 'beaver-builder' ) || $has( 'bb-plugin' ),
				'divi'           => $has( 'divi' ),
				'acf'            => $has( 'advanced-custom-fields' ) || function_exists( 'acf_get_field_groups' ),
				'woocommerce'    => class_exists( 'WooCommerce' ) || $has( 'woocommerce' ),
				'yoast'          => defined( 'WPSEO_VERSION' ) || $has( 'wordpress-seo' ),
				'rankMath'       => class_exists( 'RankMath' ) || $has( 'seo-by-rank-math' ),
				'objectCache'    => (bool) wp_using_ext_object_cache(),
				'cachePlugin'    => $has( 'wp-rocket' ) || $has( 'w3-total-cache' ) || $has( 'litespeed' ) || $has( 'wp-super-cache' ),
			);
		}

		/**
		 * Hosting environment facts the planner needs before promising a write.
		 *
		 * @return array<string,mixed>
		 */
		public static function environment() {
			$uploads = wp_get_upload_dir();
			$method  = defined( 'FS_METHOD' ) ? (string) FS_METHOD : 'direct';

			return array(
				'filesystem'      => $method,
				'uploadsWritable' => isset( $uploads['basedir'] ) ? (bool) wp_is_writable( $uploads['basedir'] ) : false,
				'maxUploadBytes'  => (int) wp_max_upload_size(),
				'memoryLimit'     => (string) ini_get( 'memory_limit' ),
				'debugMode'       => defined( 'WP_DEBUG' ) && WP_DEBUG,
				'phpSapi'         => PHP_SAPI,
			);
		}

		/**
		 * Coarse user counts by role, never names or emails.
		 *
		 * @return array<string,mixed>
		 */
		public static function user_counts() {
			if ( ! function_exists( 'count_users' ) ) {
				return array( 'total' => 0, 'roles' => array() );
			}

			$counts = count_users();
			$roles  = array();
			foreach ( (array) ( $counts['avail_roles'] ?? array() ) as $role => $count ) {
				$roles[ (string) $role ] = (int) $count;
			}

			return array(
				'total' => (int) ( $counts['total_users'] ?? 0 ),
				'roles' => $roles,
			);
		}
	}
}

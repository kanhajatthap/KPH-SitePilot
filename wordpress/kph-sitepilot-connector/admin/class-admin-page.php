<?php
/**
 * Connector administration screen.
 *
 * Deliberately honest: this build can store scopes and show connection state,
 * but pairing is not wired yet. The screen says so instead of faking a connect.
 *
 * @package KPH_SitePilot_Connector
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'KPH_SP_Admin_Page' ) ) {
	/**
	 * Registers and renders the SitePilot admin screen.
	 */
	final class KPH_SP_Admin_Page {

		const SLUG = 'kph-sitepilot';

		/**
		 * Hooks the admin screen.
		 */
		public function __construct() {
			add_action( 'admin_menu', array( $this, 'register_menu' ) );
			add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
			add_action( 'admin_post_kph_sp_save_scopes', array( $this, 'handle_save_scopes' ) );
		}

		/**
		 * Adds the top-level menu entry.
		 */
		public function register_menu() {
			add_menu_page(
				__( 'SitePilot', 'kph-sitepilot-connector' ),
				__( 'SitePilot', 'kph-sitepilot-connector' ),
				'manage_options',
				self::SLUG,
				array( $this, 'render' ),
				'dashicons-superhero',
				80
			);
		}

		/**
		 * Loads the small admin stylesheet on our screen only.
		 *
		 * @param string $hook Current admin page hook.
		 */
		public function enqueue_assets( $hook ) {
			if ( 'toplevel_page_' . self::SLUG !== $hook ) {
				return;
			}

			wp_enqueue_style(
				'kph-sp-admin',
				KPH_SP_URL . 'assets/admin.css',
				array(),
				KPH_SP_VERSION
			);
		}

		/**
		 * Handles the scope form.
		 */
		public function handle_save_scopes() {
			if ( ! current_user_can( 'manage_options' ) ) {
				wp_die( esc_html__( 'You do not have permission to manage this connection.', 'kph-sitepilot-connector' ) );
			}

			check_admin_referer( 'kph_sp_save_scopes' );

			$scopes = isset( $_POST['kph_sp_scopes'] ) ? (array) wp_unslash( $_POST['kph_sp_scopes'] ) : array();
			$scopes = array_map( 'sanitize_key', $scopes );

			KPH_SP_Settings::update( array( 'scopes' => $scopes ) );

			wp_safe_redirect(
				add_query_arg(
					array(
						'page'    => self::SLUG,
						'updated' => 'scopes',
					),
					admin_url( 'admin.php' )
				)
			);
			exit;
		}

		/**
		 * Renders the screen.
		 */
		public function render() {
			if ( ! current_user_can( 'manage_options' ) ) {
				return;
			}

			$settings   = KPH_SP_Settings::all();
			$connected  = KPH_SP_Settings::is_connected();
			$scopes     = $settings['scopes'];
			$secret     = (string) $settings['site_secret'];
			$masked     = '' === $secret ? '—' : str_repeat( '•', 12 ) . substr( $secret, -4 );
			$updated    = isset( $_GET['updated'] ) ? sanitize_key( wp_unslash( $_GET['updated'] ) ) : '';
			$scope_help = array(
				'read'     => __( 'Inspect site, content, media, plugins and settings.', 'kph-sitepilot-connector' ),
				'content'  => __( 'Create and update posts, pages, blocks, menus and taxonomies.', 'kph-sitepilot-connector' ),
				'media'    => __( 'Upload, replace and describe media files.', 'kph-sitepilot-connector' ),
				'site_ops' => __( 'Settings, plugins, themes, users, updates and maintenance.', 'kph-sitepilot-connector' ),
				'commerce' => __( 'WooCommerce products, orders, coupons and store settings.', 'kph-sitepilot-connector' ),
				'files'    => __( 'Read and write theme/plugin files through the WordPress filesystem API.', 'kph-sitepilot-connector' ),
				'code'     => __( 'Scoped CSS, header/footer scripts and reviewed PHP snippets.', 'kph-sitepilot-connector' ),
			);
			?>
			<div class="wrap kph-sp-wrap">
				<h1><?php esc_html_e( 'KPH SitePilot Connector', 'kph-sitepilot-connector' ); ?></h1>

				<?php if ( 'scopes' === $updated ) : ?>
					<div class="notice notice-success is-dismissible">
						<p><?php esc_html_e( 'Access scopes saved.', 'kph-sitepilot-connector' ); ?></p>
					</div>
				<?php endif; ?>

				<div class="kph-sp-grid">
					<div class="kph-sp-card">
						<h2><?php esc_html_e( 'Connection', 'kph-sitepilot-connector' ); ?></h2>
						<p>
							<span class="kph-sp-badge <?php echo $connected ? 'is-on' : 'is-off'; ?>">
								<?php echo $connected ? esc_html__( 'Connected', 'kph-sitepilot-connector' ) : esc_html__( 'Not connected', 'kph-sitepilot-connector' ); ?>
							</span>
						</p>
						<table class="kph-sp-table">
							<tr>
								<th><?php esc_html_e( 'Site', 'kph-sitepilot-connector' ); ?></th>
								<td><?php echo esc_html( $settings['site_name'] ); ?><br /><code><?php echo esc_html( $settings['site_url'] ); ?></code></td>
							</tr>
							<tr>
								<th><?php esc_html_e( 'Site ID', 'kph-sitepilot-connector' ); ?></th>
								<td><code><?php echo '' !== $settings['site_id'] ? esc_html( $settings['site_id'] ) : '—'; ?></code></td>
							</tr>
							<tr>
								<th><?php esc_html_e( 'Secret', 'kph-sitepilot-connector' ); ?></th>
								<td><code><?php echo esc_html( $masked ); ?></code></td>
							</tr>
							<tr>
								<th><?php esc_html_e( 'Plugin version', 'kph-sitepilot-connector' ); ?></th>
								<td><code><?php echo esc_html( KPH_SP_VERSION ); ?></code></td>
							</tr>
						</table>

						<p class="kph-sp-note">
							<?php esc_html_e( 'Pairing is enabled when the hosted SitePilot connector endpoint ships (milestone M2). This build only stores connection state and scopes — it does not contact any external service yet.', 'kph-sitepilot-connector' ); ?>
						</p>

						<p>
							<label for="kph-sp-pairing-code"><?php esc_html_e( 'Pairing code', 'kph-sitepilot-connector' ); ?></label><br />
							<input type="text" id="kph-sp-pairing-code" class="regular-text" maxlength="8" placeholder="ABCD-EFGH" disabled />
							<button type="button" class="button button-primary" disabled>
								<?php esc_html_e( 'Connect site', 'kph-sitepilot-connector' ); ?>
							</button>
						</p>
					</div>

					<div class="kph-sp-card">
						<h2><?php esc_html_e( 'Access scopes', 'kph-sitepilot-connector' ); ?></h2>
						<p class="kph-sp-note">
							<?php esc_html_e( 'Connecting as a WordPress administrator enables full access by default. A scope makes a capability available; it never applies a change on its own. Every write needs a plan, explicit approval, a before-snapshot and read-back verification.', 'kph-sitepilot-connector' ); ?>
						</p>

						<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
							<input type="hidden" name="action" value="kph_sp_save_scopes" />
							<?php wp_nonce_field( 'kph_sp_save_scopes' ); ?>
							<fieldset>
								<?php foreach ( KPH_SP_Settings::SCOPES as $scope ) : ?>
									<label class="kph-sp-scope">
										<input
											type="checkbox"
											name="kph_sp_scopes[]"
											value="<?php echo esc_attr( $scope ); ?>"
											<?php checked( in_array( $scope, $scopes, true ) ); ?>
										/>
										<span>
											<strong><?php echo esc_html( $scope ); ?></strong>
											<?php if ( in_array( $scope, KPH_SP_Settings::HIGH_RISK_SCOPES, true ) ) : ?>
												<em class="kph-sp-risk"><?php esc_html_e( 'high risk · typed confirmation', 'kph-sitepilot-connector' ); ?></em>
											<?php endif; ?>
											<br />
											<?php echo esc_html( $scope_help[ $scope ] ); ?>
										</span>
									</label>
								<?php endforeach; ?>
							</fieldset>
							<p>
								<button type="submit" class="button button-primary">
									<?php esc_html_e( 'Save scopes', 'kph-sitepilot-connector' ); ?>
								</button>
							</p>
						</form>
					</div>
				</div>

				<div class="kph-sp-card">
					<h2><?php esc_html_e( 'Safety model', 'kph-sitepilot-connector' ); ?></h2>
					<ul class="kph-sp-list">
						<li><?php esc_html_e( 'No arbitrary PHP, SQL or shell execution. Tools run through allowlisted handlers only.', 'kph-sitepilot-connector' ); ?></li>
						<li><?php esc_html_e( 'Every mutating job carries a plan ID and approval; the plugin takes a before-snapshot first.', 'kph-sitepilot-connector' ); ?></li>
						<li><?php esc_html_e( 'The platform signs every request with HMAC-SHA256; replayed or stale requests are rejected.', 'kph-sitepilot-connector' ); ?></li>
						<li><?php esc_html_e( 'Disconnecting revokes the site token on both sides.', 'kph-sitepilot-connector' ); ?></li>
					</ul>
				</div>
			</div>
			<?php
		}
	}
}

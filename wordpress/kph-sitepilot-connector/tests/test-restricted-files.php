<?php
/** Isolated filesystem / fake WordPress tests. No real site or database. */
if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', __DIR__ . '/' ); }
defined( 'ABSPATH' ) || exit;
$root = sys_get_temp_dir() . '/kph-files-' . bin2hex( random_bytes( 6 ) );
mkdir( $root . '/themes/test-child', 0700, true );
mkdir( $root . '/plugins/test-addon', 0700, true );
define( 'WP_CONTENT_DIR', $root );
$workspace = $root . '-private'; mkdir( $workspace, 0700 );
define( 'KPH_SP_FILE_WORKSPACE', $workspace );
define( 'KPH_SP_RESTRICTED_FILES_ENABLED', 'disabled' !== getenv( 'KPH_TEST_MODE' ) );
define( 'DISALLOW_FILE_MODS', 'mods-disabled' === getenv( 'KPH_TEST_MODE' ) );
define( 'KPH_SP_RESTRICTED_FILE_PATHS', array(
 'themes/test-child/style.css', 'themes/test-child/functions.php', 'plugins/test-addon/main.js',
 'themes/test-child/wp-config.php', 'themes/test-child/link.css', 'themes/test-child/hard.css',
 'themes/test-child/linked/style.css', 'themes/test-child/secret.css',
) );
$env = 'staging'; $user = 1; $allowed = true; $denied_cap = null; $multisite = false; $options = array(); $backup_fail = false; $readback_fail = false;
function wp_get_environment_type() { global $env; return $env; }
function current_user_can( $cap ) { global $allowed, $denied_cap; return $allowed && $cap !== $denied_cap; }
function is_multisite() { global $multisite; return $multisite; }
function get_current_user_id() { global $user; return $user; }
function wp_salt( $scheme ) { return str_repeat( 'fixture-only-salt-', 4 ); }
function wp_json_encode( $data ) { return json_encode( $data ); }
function add_option( $name, $value, $deprecated = '', $autoload = null ) {
 global $options, $backup_fail;
 if ( false !== $autoload ) { throw new RuntimeException( 'Record must not autoload' ); }
 if ( $backup_fail && 0 === strpos( $name, 'kph_sp_file_backup_' ) ) { return false; }
 if ( isset( $options[$name] ) ) { return false; }
 $options[$name] = $value; return true;
}
function get_option( $name, $default = null ) {
 global $options, $readback_fail;
 if ( $readback_fail && 0 === strpos( $name, 'kph_sp_file_backup_' ) ) { return 'broken'; }
 return isset( $options[$name] ) ? $options[$name] : $default;
}
function delete_option( $name ) { global $options; unset( $options[$name] ); }
require_once dirname( __DIR__ ) . '/includes/class-restricted-files.php';
$count = 0;
function check( $condition, $label ) { global $count; ++$count; if ( ! $condition ) { throw new RuntimeException( 'FAIL: ' . $label ); } }
function denied( $fn, $code ) {
 try { $fn(); } catch ( RuntimeException $e ) { check( $code === $e->getMessage(), $code . ' refusal' ); return; }
 check( false, 'expected ' . $code );
}
function cleanup( $dir ) {
 foreach ( scandir( $dir ) as $name ) {
  if ( '.' === $name || '..' === $name ) { continue; }
  $path = $dir . '/' . $name;
  if ( is_dir( $path ) && ! is_link( $path ) ) { cleanup( $path ); } else { unlink( $path ); }
 }
 rmdir( $dir );
}
try {
 $file = 'themes/test-child/style.css'; $before = 'body { color: black; }'; $after = 'body { color: blue; }';
 file_put_contents( $root . '/' . $file, $before );
 file_put_contents( $root . '/themes/test-child/functions.php', '<?php return 1;' );
 file_put_contents( $root . '/plugins/test-addon/main.js', 'console.log("fixture");' );
 foreach ( array( $file, 'themes/test-child/functions.php', 'plugins/test-addon/main.js' ) as $initial ) { chmod( $root . '/' . $initial, 0600 ); }
 clearstatcache();
 if ( 'disabled' === getenv( 'KPH_TEST_MODE' ) || 'mods-disabled' === getenv( 'KPH_TEST_MODE' ) ) {
  denied( function() use ( $file ) { KPH_SP_Restricted_Files::read( $file ); }, 'disabled' === getenv( 'KPH_TEST_MODE' ) ? 'FILE_EDITOR_DISABLED' : 'FILE_EDITOR_FORBIDDEN' );
 } else {
  foreach ( array( 'production', 'local', 'development' ) as $environment ) {
   $env = $environment; denied( function() use ( $file ) { KPH_SP_Restricted_Files::read( $file ); }, 'FILE_EDITOR_STAGING_REQUIRED' );
  }
  $env = 'staging'; $allowed = false;
  denied( function() use ( $file ) { KPH_SP_Restricted_Files::read( $file ); }, 'FILE_EDITOR_FORBIDDEN' );
  $allowed = true; $multisite = true;
  denied( function() use ( $file ) { KPH_SP_Restricted_Files::read( $file ); }, 'FILE_EDITOR_FORBIDDEN' );
  $multisite = false;
  $denied_cap = 'edit_themes';
  denied( function() use ( $file ) { KPH_SP_Restricted_Files::read( $file ); }, 'FILE_EDITOR_FORBIDDEN' );
  $denied_cap = 'edit_plugins';
  denied( function() { KPH_SP_Restricted_Files::read( 'plugins/test-addon/main.js' ); }, 'FILE_EDITOR_FORBIDDEN' );
  $denied_cap = null;

  foreach ( array( '../wp-config.php', '/etc/passwd', 'themes/test-child/../config.php', 'themes/test-child/style.css/extra', 'themes/test-child/.env', 'themes/test-child/style.css%00', 'themes\\test-child\\style.css', 'themes/test-child/file.sql' ) as $bad ) {
   denied( function() use ( $bad ) { KPH_SP_Restricted_Files::read( $bad ); }, 'FILE_PATH_DENIED' );
  }
  denied( function() { KPH_SP_Restricted_Files::read( 'themes/test-child/other.css' ); }, 'FILE_NOT_ALLOWLISTED' );
  denied( function() { KPH_SP_Restricted_Files::read( 'themes/test-child/wp-config.php' ); }, 'FILE_PATH_DENIED' );
  symlink( $root . '/' . $file, $root . '/themes/test-child/link.css' );
  denied( function() { KPH_SP_Restricted_Files::read( 'themes/test-child/link.css' ); }, 'FILE_PATH_DENIED' );
  symlink( $root . '/themes/test-child', $root . '/themes/test-child/linked' );
  denied( function() { KPH_SP_Restricted_Files::read( 'themes/test-child/linked/style.css' ); }, 'FILE_PATH_DENIED' );
  // Hard links may not be supported by all WASM filesystems; native CI covers them.
  if ( function_exists( 'link' ) && @link( $root . '/' . $file, $root . '/themes/test-child/hard.css' ) ) {
   denied( function() { KPH_SP_Restricted_Files::read( 'themes/test-child/hard.css' ); }, 'FILE_UNSUPPORTED' );
   unlink( $root . '/themes/test-child/hard.css' );
  } else { echo "SKIP: hard links unsupported by this filesystem.\n"; }
  $view = KPH_SP_Restricted_Files::read( $file );
  check( $before === $view['content'] && hash( 'sha256', $before ) === $view['sha256'], 'read/hash exact' );
  denied( function() use ( $file, $after ) { KPH_SP_Restricted_Files::propose( $file, $after, str_repeat( '0', 64 ) ); }, 'FILE_CHANGED' );
  denied( function() use ( $file, $view ) { KPH_SP_Restricted_Files::propose( $file, str_repeat( 'a', 65537 ), $view['sha256'] ); }, 'FILE_CONTENT_UNSUPPORTED' );
  denied( function() use ( $file, $view ) { KPH_SP_Restricted_Files::propose( $file, "x\0y", $view['sha256'] ); }, 'FILE_CONTENT_UNSUPPORTED' );
  denied( function() use ( $file, $view ) { KPH_SP_Restricted_Files::propose( $file, 'password = fixture', $view['sha256'] ); }, 'FILE_SENSITIVE_CONTENT' );
  $php = KPH_SP_Restricted_Files::read( 'themes/test-child/functions.php' );
  denied( function() use ( $php ) { KPH_SP_Restricted_Files::propose( $php['path'], '<?php function {', $php['sha256'] ); }, 'FILE_PHP_SYNTAX_INVALID' );
  $plan = KPH_SP_Restricted_Files::propose( $file, $after, $view['sha256'] );
  $id = $plan['id'];
  check( $before === file_get_contents( $root . '/' . $file ), 'proposal never writes' );
  check( false === strpos( implode( '', $options ), $after ), 'candidate encrypted' );
  denied( function() use ( $id ) { KPH_SP_Restricted_Files::apply( $id, 'CONFIRM' ); }, 'FILE_CONFIRMATION_REQUIRED' );
  $user = 2; denied( function() use ( $id ) { KPH_SP_Restricted_Files::apply( $id, $id ); }, 'FILE_EDITOR_FORBIDDEN' ); $user = 1;
  $saved = $options['kph_sp_file_plan_' . $id]; $options['kph_sp_file_plan_' . $id] = 'invalid';
  denied( function() use ( $id ) { KPH_SP_Restricted_Files::apply( $id, $id ); }, 'FILE_RECORD_UNUSABLE' );
  $options['kph_sp_file_plan_' . $id] = $saved;
  $open = new ReflectionMethod( 'KPH_SP_Restricted_Files', 'open' ); if ( PHP_VERSION_ID < 80100 ) { $open->setAccessible( true ); }
  $seal = new ReflectionMethod( 'KPH_SP_Restricted_Files', 'seal' ); if ( PHP_VERSION_ID < 80100 ) { $seal->setAccessible( true ); }
  $expired = $open->invoke( null, $saved ); $expired['expiresAt'] = time() - 1;
  $options['kph_sp_file_plan_' . $id] = $seal->invoke( null, $expired );
  denied( function() use ( $id ) { KPH_SP_Restricted_Files::apply( $id, $id ); }, 'FILE_PLAN_EXPIRED' );
  $options['kph_sp_file_plan_' . $id] = $saved;
  file_put_contents( $root . '/' . $file, 'changed externally' );
  denied( function() use ( $id ) { KPH_SP_Restricted_Files::apply( $id, $id ); }, 'FILE_CHANGED' );
  file_put_contents( $root . '/' . $file, $before );
  chmod( $workspace, 0777 ); clearstatcache();
  denied( function() use ( $id ) { KPH_SP_Restricted_Files::apply( $id, $id ); }, 'FILE_WORKSPACE_UNSAFE' );
  chmod( $workspace, 0700 ); clearstatcache();
  $backup_fail = true;
  denied( function() use ( $id ) { KPH_SP_Restricted_Files::apply( $id, $id ); }, 'FILE_BACKUP_FAILED' );
  check( $before === file_get_contents( $root . '/' . $file ), 'backup failure blocks write' ); $backup_fail = false;
  $readback_fail = true;
  denied( function() use ( $id ) { KPH_SP_Restricted_Files::apply( $id, $id ); }, 'FILE_RECORD_UNUSABLE' );
  check( $before === file_get_contents( $root . '/' . $file ), 'corrupt backup readback blocks write' );
  $readback_fail = false; unset( $options['kph_sp_file_backup_' . $id] );
  $result = KPH_SP_Restricted_Files::apply( $id, $id );
  check( true === $result['verified'] && $after === file_get_contents( $root . '/' . $file ), 'write verified' );
  check( false === strpos( $options['kph_sp_file_backup_' . $id], $before ), 'backup encrypted' );
  denied( function() use ( $id ) { KPH_SP_Restricted_Files::apply( $id, $id ); }, 'FILE_RECORD_UNUSABLE' );
  file_put_contents( $root . '/' . $file, 'new legitimate edit' );
  denied( function() use ( $id ) { KPH_SP_Restricted_Files::restore( $id, $id ); }, 'FILE_CHANGED' );
  file_put_contents( $root . '/' . $file, $after );
  $restored = KPH_SP_Restricted_Files::restore( $id, $id );
  check( true === $restored['verified'] && $before === file_get_contents( $root . '/' . $file ), 'restore verified' );
  check( count( glob( $workspace . '/.kph-sp-*' ) ) === 0, 'temporary files removed' );
  foreach ( array( 'themes/test-child/functions.php' => '<?php return 2;', 'plugins/test-addon/main.js' => 'console.log("new fixture");' ) as $path => $candidate ) {
   $view = KPH_SP_Restricted_Files::read( $path );
   $plan = KPH_SP_Restricted_Files::propose( $path, $candidate, $view['sha256'] );
   $done = KPH_SP_Restricted_Files::apply( $plan['id'], $plan['id'] );
   check( $done['verified'] && $candidate === file_get_contents( $root . '/' . $path ), 'PHP/JS edit verified' );
   $done = KPH_SP_Restricted_Files::restore( $plan['id'], $plan['id'] );
   check( $done['verified'] && $view['content'] === file_get_contents( $root . '/' . $path ), 'PHP/JS restore verified' );
  }
  chmod( $root . '/' . $file, 0666 ); clearstatcache();
  denied( function() use ( $file ) { KPH_SP_Restricted_Files::read( $file ); }, 'FILE_PATH_DENIED' );
  chmod( $root . '/' . $file, 0600 );

 }
 echo 'Restricted file engine: ' . $count . " assertions passed.\n";
} finally { cleanup( $root ); cleanup( $workspace ); }

// Real disposable WordPress + SQLite, no production URL or existing site accepted.
// WP_TEST_SOURCES points to JSON emitted by fetch-sources.mjs; PHP_BIN selects PHP.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { prepare, restore, preflight } from '../../tools/recovery/recovery.mjs';
const sources = JSON.parse(fs.readFileSync(process.env.WP_TEST_SOURCES,'utf8'));
const php = process.env.PHP_BIN || 'php';
const pins=JSON.parse(fs.readFileSync(new URL('./sources.json',import.meta.url),'utf8'));
assert.equal(fs.existsSync(path.join(sources.wordpress,'wp-config.php')),false,'Use pristine downloaded core, never an existing site');
assert.match(fs.readFileSync(path.join(sources.wordpress,'wp-includes/version.php'),'utf8'), /6\.8\.3/);
assert.equal(execFileSync('git',['-C',sources.sqlite,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),pins.sqlite.commit,'SQLite revision must match reviewed fixture pin');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'sitepilot-wp-acceptance-'));
const root=path.join(base,'site'); const vault=path.join(base,'vault'); const policy=path.join(base,'policy.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = value => "'"+value.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
let passes=0;
function check(condition,label) { assert.ok(condition,label); passes++; console.log(`PASS ${label}`); }
function run(file) {
  const r=spawnSync(php,['-d','display_errors=1','-d','opcache.enable_cli=0',file],{encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
  if(r.error) throw r.error;
  // WASM CLI may return 0 after a PHP fatal: positive markers are required below.
  return { text:(r.stdout||'')+(r.stderr||''),status:r.status };
}
try {
  fs.cpSync(sources.wordpress,root,{recursive:true});
  fs.mkdirSync(vault,{mode:0o700}); fs.writeFileSync(path.join(vault,'key'),randomBytes(32),{mode:0o600});
  const plugin=path.join(root,'wp-content/plugins/sqlite-database-integration');
  fs.cpSync(path.join(sources.sqlite,'packages/plugin-sqlite-database-integration'),plugin,{recursive:true,dereference:true});
  fs.copyFileSync(path.join(plugin,'db.copy'),path.join(root,'wp-content/db.php'));
  const theme=path.join(root,'wp-content/themes/kph-fixture'); fs.mkdirSync(theme,{mode:0o700});
  const originals={ 'style.css':'/* Theme Name: SitePilot Disposable Fixture */\nbody {color:black;}','script.js':'window.kphFixture = "healthy";','functions.php':'<?php function kph_fixture_health() { return "healthy"; }' };
  const candidates={ 'style.css':'/* Theme Name: SitePilot Disposable Fixture */\nbody {color:blue;}','script.js':'window.kphFixture = "changed";','functions.php':'<?php function kph_fixture_health() { return "changed"; }' };
  for(const [name,text] of Object.entries(originals)) fs.writeFileSync(path.join(theme,name),text,{mode:0o600});
  fs.writeFileSync(path.join(theme,'index.php'),'<?php echo "fixture template";',{mode:0o600});
  const relative=name=>`wp-content/themes/kph-fixture/${name}`;
  fs.writeFileSync(policy,JSON.stringify({version:1,enabled:true,environment:'staging',root,vault,publicRoots:[root],allowedFiles:Object.keys(originals).map(relative)}),{mode:0o600});
  const content = `<?php
  define('DB_NAME','fixture'); define('DB_USER','fixture'); define('DB_PASSWORD',''); define('DB_HOST','invalid');
  define('DB_DIR',${quote(path.join(base,'database'))}); define('DB_FILE','fixture.sqlite');
  define('WP_HOME','http://fixture.invalid'); define('WP_SITEURL','http://fixture.invalid');
  define('WP_ENVIRONMENT_TYPE','staging'); define('WP_HTTP_BLOCK_EXTERNAL',true); define('DISABLE_WP_CRON',true);
  define('AUTOMATIC_UPDATER_DISABLED',true); define('WP_AUTO_UPDATE_CORE',false); define('WP_DEBUG',false);
  define('AUTH_KEY',${quote(randomBytes(32).toString('hex'))}); define('AUTH_SALT',${quote(randomBytes(32).toString('hex'))});
  $table_prefix='fixture_'; define('ABSPATH',__DIR__.'/'); require ABSPATH.'wp-settings.php';`;
  fs.writeFileSync(path.join(root,'wp-config.php'),content,{mode:0o600});
  fs.mkdirSync(path.join(root,'wp-content/mu-plugins'),{recursive:true});
  fs.writeFileSync(path.join(root,'wp-content/mu-plugins/isolation.php'),`<?php
  add_filter('pre_http_request',function(){return new WP_Error('fixture_network_blocked');});
  add_filter('pre_wp_mail',function(){return true;});`,{mode:0o600});
  const boot=`$_SERVER['HTTP_HOST']='fixture.invalid'; $_SERVER['SERVER_NAME']='fixture.invalid'; $_SERVER['SERVER_PORT']='80'; $_SERVER['REQUEST_URI']='/'; $_SERVER['REMOTE_ADDR']='127.0.0.1';`;
  const install=path.join(base,'install.php');
  fs.writeFileSync(install,`<?php ${boot} define('WP_INSTALLING',true); require ${quote(path.join(root,'wp-load.php'))}; require ABSPATH.'wp-admin/includes/upgrade.php'; wp_install('Disposable','fixture_admin','fixture@example.invalid',false,'',${quote(randomBytes(24).toString('hex'))}); switch_theme('kph-fixture'); echo "KPH_INSTALL_OK\\n";`);
  const installed=run(install); assert.ok(installed.text.includes('KPH_INSTALL_OK'),installed.text.slice(-4000)); check(true,'real WordPress installation into isolated SQLite');
  const health=path.join(base,'health.php');
  fs.writeFileSync(health,`<?php ${boot} require ${quote(path.join(root,'wp-load.php'))}; if(get_option('blogname')!=='Disposable' || wp_get_environment_type()!=='staging' || (int)$wpdb->get_var('SELECT 1')!==1) throw new RuntimeException('health failed'); echo 'KPH_HEALTH:'.kph_fixture_health()."\\n";`);
  check(run(health).text.includes('KPH_HEALTH:healthy'),'WordPress bootstrap/database/theme healthy');
  for(const name of Object.keys(originals)) {
    const full=path.join(theme,name); check(preflight(policy,relative(name)).readyForBackup,`${name} preflight`);
    const backup=prepare(policy,relative(name),sha(candidates[name]));
    // Fixed fixture-only mutation. No production target or hosted executor exists here.
    fs.writeFileSync(full,candidates[name]);
    check(sha(fs.readFileSync(full))===sha(candidates[name]),`${name} changed bytes verified`);
    check(run(health).text.includes(name==='functions.php'?'KPH_HEALTH:changed':'KPH_HEALTH:healthy'),`${name} WordPress health after fixture change`);
    check(restore(policy,backup.id,backup.id,true).verified,`${name} independent host restore`);
    check(sha(fs.readFileSync(full))===sha(originals[name]),`${name} original hash restored`);
    check(run(health).text.includes('KPH_HEALTH:healthy'),`${name} WordPress health after restore`);
  }
  const workspace=path.join(base,'engine-workspace'); fs.mkdirSync(workspace,{mode:0o700});
  const engine=path.resolve('wordpress/kph-sitepilot-connector/includes/class-restricted-files.php');
  const engineScript=path.join(base,'engine-flow.php');
  fs.writeFileSync(engineScript,`<?php ${boot} require ${quote(path.join(root,'wp-load.php'))};
    $user=get_user_by('login','fixture_admin'); wp_set_current_user($user->ID);
    if(class_exists('KPH_SP_Restricted_Files')) throw new RuntimeException('unexpected bootstrap');
    define('KPH_SP_RESTRICTED_FILES_ENABLED',true);
    define('KPH_SP_RESTRICTED_FILE_PATHS',array('themes/kph-fixture/style.css'));
    define('KPH_SP_FILE_WORKSPACE',${quote(workspace)}); require ${quote(engine)};
    $view=KPH_SP_Restricted_Files::read('themes/kph-fixture/style.css');
    $plan=KPH_SP_Restricted_Files::propose($view['path'],${quote(candidates['style.css'])},$view['sha256']);
    $payload=KPH_SP_Restricted_Files::review_payload($plan['id'],$plan['id']);
    if($payload['currentHash']!==$view['sha256'] || $payload['canEdit']!==true) throw new RuntimeException('payload failure');
    $done=KPH_SP_Restricted_Files::apply($plan['id'],$plan['id']);
    if(!$done['verified']) throw new RuntimeException('apply failure');
    $done=KPH_SP_Restricted_Files::restore($plan['id'],$plan['id']);
    if(!$done['verified'] || KPH_SP_Restricted_Files::read($view['path'])['sha256']!==$view['sha256']) throw new RuntimeException('restore failure');
    echo "KPH_ENGINE_REAL_WP_OK\\n";`);
  const engineResult=run(engineScript); assert.ok(engineResult.text.includes('KPH_ENGINE_REAL_WP_OK'),engineResult.text.slice(-4000));
  check(true,'experimental PHP engine proposal/export/apply/restore uses real WordPress options and capabilities in fixture only');
  check(run(health).text.includes('KPH_HEALTH:healthy'),'WordPress healthy after engine fixture round-trip');
  const fatal='<?php throw new RuntimeException("KPH_DISPOSABLE_FATAL");'; const full=path.join(theme,'functions.php');
  const backup=prepare(policy,relative('functions.php'),sha(fatal)); fs.writeFileSync(full,fatal);
  const broken=run(health); check(broken.text.includes('KPH_DISPOSABLE_FATAL')&&!broken.text.includes('KPH_HEALTH:healthy'),'runtime-fatal theme prevents WordPress bootstrap');
  check(restore(policy,backup.id,backup.id,true).verified,'host restore succeeds while WordPress cannot bootstrap');
  check(run(health).text.includes('KPH_HEALTH:healthy'),'fresh PHP process boots WordPress after fatal recovery');
  console.log(`WORDPRESS_ACCEPTANCE_OK ${passes} assertions; WordPress 6.8.3 + SQLite; PHP=${php.includes('wasm')?'WASM':'native'}; not MySQL/FPM/HTTP/browser acceptance.`);
} finally { fs.rmSync(base,{recursive:true,force:true}); }

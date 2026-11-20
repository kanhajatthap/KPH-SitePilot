// Docker required. Accepts only pristine pinned sources, NEVER a site URL/database URL.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';import {execFileSync} from 'node:child_process';
const sourceFile=process.env.WP_TEST_SOURCES;if(!sourceFile)throw new Error('WP_TEST_SOURCES_REQUIRED');
const sources=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
assert.equal(fs.existsSync(path.join(sources.wordpress,'wp-config.php')),false,'Pristine sources required');
assert.match(fs.readFileSync(path.join(sources.wordpress,'wp-includes/version.php'),'utf8'),/6\.8\.3/);
execFileSync('docker',['compose','version'],{stdio:'ignore'});
const base=fs.mkdtempSync(path.join(os.tmpdir(),'sitepilot-http-'));
const project='sitepilot-fixture-'+randomBytes(6).toString('hex');
const env={...process.env,FIXTURE_DIR:base,FIXTURE_UID:String(process.getuid()),FIXTURE_GID:String(process.getgid()),REPO_DIR:process.cwd()};
const compose=['compose','-p',project,'-f',path.resolve('tests/wordpress/http/compose.yml')];
function docker(args,{quiet=false}={}){return execFileSync('docker',[...compose,...args],{env,timeout:240000,stdio:quiet?'pipe':'inherit'});}
const quote=s=>"'"+s.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
let provisioned=false;
try{
 const root=path.join(base,'site');fs.cpSync(sources.wordpress,root,{recursive:true});
 fs.writeFileSync(path.join(base,'db-password'),randomBytes(24).toString('hex'),{mode:0o600});
 fs.writeFileSync(path.join(base,'root-password'),randomBytes(24).toString('hex'),{mode:0o600});
 fs.mkdirSync(path.join(base,'vault'),{mode:0o700});fs.writeFileSync(path.join(base,'vault/key'),randomBytes(32),{mode:0o600});
 const theme=path.join(root,'wp-content/themes/kph-fixture');fs.mkdirSync(theme,{mode:0o700});
 for(const [name,text] of Object.entries({'style.css':'/* Theme Name: Disposable HTTP Fixture */\nbody {color:black;}','script.js':'window.fixture="healthy";','functions.php':'<?php function fixture_health(){return "healthy";}','index.php':`<?php if((int)$wpdb->get_var('SELECT 1')!==1) {http_response_code(500);exit;} echo 'KPH_HTTP:'.fixture_health();`}))fs.writeFileSync(path.join(theme,name),text,{mode:0o600});
 fs.writeFileSync(path.join(base,'policy.json'),JSON.stringify({version:1,enabled:true,environment:'staging',root:'/fixture/site',vault:'/fixture/vault',publicRoots:['/fixture/site'],allowedFiles:['style.css','script.js','functions.php'].map(n=>'wp-content/themes/kph-fixture/'+n)}),{mode:0o600});
 fs.writeFileSync(path.join(root,'wp-config.php'),`<?php
 define('DB_NAME','fixture');define('DB_USER','fixture');define('DB_PASSWORD',trim(file_get_contents('/fixture/db-password')));define('DB_HOST','db');
 define('WP_HOME','http://web:8080');define('WP_SITEURL','http://web:8080');define('WP_ENVIRONMENT_TYPE','staging');
 define('WP_HTTP_BLOCK_EXTERNAL',true);define('DISABLE_WP_CRON',true);define('AUTOMATIC_UPDATER_DISABLED',true);define('WP_AUTO_UPDATE_CORE',false);
 define('AUTH_KEY',${quote(randomBytes(32).toString('hex'))});define('AUTH_SALT',${quote(randomBytes(32).toString('hex'))});
 $table_prefix='fixture_';define('ABSPATH',__DIR__.'/');require ABSPATH.'wp-settings.php';`,{mode:0o600});
 fs.mkdirSync(path.join(root,'wp-content/mu-plugins'),{recursive:true});fs.writeFileSync(path.join(root,'wp-content/mu-plugins/isolate.php'),`<?php add_filter('pre_http_request',function(){return new WP_Error('fixture_network_blocked');});add_filter('pre_wp_mail',function(){return true;});`);
 fs.writeFileSync(path.join(base,'install.php'),`<?php $_SERVER['HTTP_HOST']='web:8080';$_SERVER['SERVER_NAME']='web';$_SERVER['SERVER_PORT']='8080';$_SERVER['REQUEST_URI']='/'; define('WP_INSTALLING',true);require '/fixture/site/wp-load.php';require ABSPATH.'wp-admin/includes/upgrade.php';wp_install('Disposable HTTP','fixture_admin','fixture@example.invalid',false,'',${quote(randomBytes(24).toString('hex'))});switch_theme('kph-fixture');echo 'FIXTURE_INSTALLED';`,{mode:0o600});
 provisioned=true;docker(['up','-d','--build','--wait','--wait-timeout','150','db','php','web'],{quiet:true});
 const install=docker(['exec','-T','php','php','/fixture/install.php'],{quiet:true}).toString();assert.ok(install.includes('FIXTURE_INSTALLED'),'WordPress installation failed');fs.unlinkSync(path.join(base,'install.php'));
 for(const phase of ['baseline','changed','restored','fatal','final']){if(phase!=='baseline')docker(['restart','php'],{quiet:true});docker(['run','--rm','--no-deps','runner',phase]);}
 console.log('MYSQL_FPM_HTTP_ACCEPTANCE_OK; isolated fixture only, no authenticated dashboard E2E');
}finally{
 // Only our random project and freshly created fixture tree; never global prune.
 if(provisioned)docker(['down','--volumes','--remove-orphans'],{quiet:true});
 fs.rmSync(base,{recursive:true,force:true});
}

// Docker required. Accepts only pristine pinned sources, NEVER a site URL/database URL.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';import {execFileSync} from 'node:child_process';
import {dockerEnvironment,validateDockerEndpoint,imageIdentity,finishFixture} from './safety.mjs';
let dockerEnv,context;
try{
 dockerEnv=dockerEnvironment(process.env);
 context=execFileSync('docker',['context','show'],{env:dockerEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const endpoint=JSON.parse(execFileSync('docker',['context','inspect',context],{env:dockerEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0]?.Endpoints?.docker?.Host;
 validateDockerEndpoint(endpoint);
}catch(error){console.error(JSON.stringify({status:'BLOCKED',code:error.code==='ENOENT'?'DOCKER_UNAVAILABLE':'DOCKER_PREFLIGHT_REFUSED'}));process.exit(2);}
const sourceFile=process.env.WP_TEST_SOURCES;if(!sourceFile)throw new Error('WP_TEST_SOURCES_REQUIRED');
const sources=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
assert.equal(fs.existsSync(path.join(sources.wordpress,'wp-config.php')),false,'Pristine sources required');
assert.match(fs.readFileSync(path.join(sources.wordpress,'wp-includes/version.php'),'utf8'),/6\.8\.3/);
execFileSync('docker',['compose','version'],{env:dockerEnv,stdio:'ignore'});
const base=fs.mkdtempSync(path.join(os.tmpdir(),'sitepilot-http-'));
const project='sitepilot-fixture-'+randomBytes(6).toString('hex');
fs.writeFileSync(path.join(base,'.fixture-owner'),project,{mode:0o600});
fs.writeFileSync(path.join(base,'compose.env'),'# No inherited Compose interpolation\n',{mode:0o600});
const report={schemaVersion:1,commit:/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')?process.env.GITHUB_SHA:undefined,startedAt:new Date().toISOString(),project,status:'NOT TESTED',images:[],phases:[]};
const env={...dockerEnv,FIXTURE_DIR:base,FIXTURE_UID:String(process.getuid()),FIXTURE_GID:String(process.getgid()),REPO_DIR:process.cwd()};
const compose=['--context',context,'compose','--env-file',path.join(base,'compose.env'),'-p',project,'-f',path.resolve('tests/wordpress/http/compose.yml')];
function docker(args,{quiet=false}={}){
 report.lastOperation=args[0];
 try{return execFileSync('docker',[...compose,...args],{env,timeout:240000,stdio:quiet?'pipe':'inherit'});}
 catch(error){
  // Private diagnostics may be sensitive; never print or commit them.
  fs.appendFileSync(path.join(base,'private-diagnostics.log'),Buffer.concat([Buffer.from(`operation=${args[0]}\n`),Buffer.from(error.stdout||''),Buffer.from(error.stderr||'')]),{mode:0o600});
  throw error;
 }
}
const quote=s=>"'"+s.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
let provisioned=false,success=false;
try{
 const root=path.join(base,'site');fs.cpSync(sources.wordpress,root,{recursive:true});
 fs.writeFileSync(path.join(base,'db-password'),randomBytes(24).toString('hex'),{mode:0o600});
 fs.writeFileSync(path.join(base,'root-password'),randomBytes(24).toString('hex'),{mode:0o600});
 fs.mkdirSync(path.join(base,'vault'),{mode:0o700});fs.writeFileSync(path.join(base,'vault/key'),randomBytes(32),{mode:0o600});
 fs.mkdirSync(path.join(base,'runtime'),{mode:0o700});
 fs.writeFileSync(path.join(root,'fpm-ready.php'),`<?php echo json_encode(['sapi'=>PHP_SAPI,'opcache'=>function_exists('opcache_get_status') && opcache_get_status()!==false,'validateTimestamps'=>ini_get('opcache.validate_timestamps')]);`,{mode:0o600});
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
 report.stage='startup';provisioned=true;docker(['up','-d','--build','--wait','--wait-timeout','150','db','php','web'],{quiet:true});
 report.stage='install';const install=docker(['exec','-T','php','php','/fixture/install.php'],{quiet:true}).toString();if(!install.includes('FIXTURE_INSTALLED')){report.installCode=/Error establishing a database connection|Error while connecting to the database/i.test(install)?'WORDPRESS_DB_UNAVAILABLE':'WORDPRESS_INSTALL_MARKER_MISSING';throw new Error('WORDPRESS_INSTALL_FAILED');}
 for(const phase of ['baseline','changed','restored','fatal','final']){report.stage='phase';report.activePhase=phase;if(phase!=='baseline')docker(['restart','php'],{quiet:true});const output=docker(['run','--rm','--no-deps','runner',phase],{quiet:true}).toString();
  const evidence=output.trim().split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  assert.ok(evidence.length>0&&evidence.every(e=>e.status==='PASS'),'PHASE_EVIDENCE_MISSING');report.phases.push({phase,status:'PASS',checks:evidence});
 }
 report.stage='inventory';
 // Capture immutable identities only, never Docker Config/Env (which can contain secrets).
 const ids=[...new Set(docker(['images','-q'],{quiet:true}).toString().trim().split(/\s+/).filter(Boolean)),'node:22.16.0-bookworm-slim'];
 assert.ok(ids.length>=4,'IMAGE_INVENTORY_INCOMPLETE');
 for(const id of ids){
  const raw=JSON.parse(execFileSync('docker',['--context',context,'image','inspect',id,'--format','{"Id":{{json .Id}},"RepoDigests":{{json .RepoDigests}}}'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  report.images.push(imageIdentity(raw));
 }
 success=true;
}catch(error){
 report.failure={code:error.code==='ERR_ASSERTION'?'ACCEPTANCE_ASSERTION_FAILED':'FIXTURE_EXECUTION_FAILED',exitStatus:Number.isInteger(error.status)?error.status:null};
 if(fs.existsSync(path.join(base,'phase-failure.json')))report.phaseFailure=JSON.parse(fs.readFileSync(path.join(base,'phase-failure.json'),'utf8'));
 if(fs.existsSync(path.join(base,'checks.jsonl')))report.completedChecksFile='checks.jsonl';
 // Raw subprocess output is intentionally not printed: service errors may include secrets.
 process.exitCode=1;
}finally{
 const result=finishFixture({base,project,success,stop:()=>{if(provisioned)docker(['down','--volumes','--remove-orphans'],{quiet:true});},report});
 if(!result.success)process.exitCode=1;
 console.log(JSON.stringify({status:result.success?'PASS':'FAIL',evidence:result.evidence,privateArtifactsRetained:report.privateArtifactsRetained}));
}

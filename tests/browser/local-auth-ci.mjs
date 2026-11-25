// Dedicated ephemeral GitHub-hosted test VM only. No deployment or remote URL accepted.
import {classifyFailure} from './auth-ci-diagnostics.mjs';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';
assert.equal(process.env.GITHUB_ACTIONS,'true','Use dedicated disposable CI only');
assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT,'Remote Docker selection refused');
const endpoint=JSON.parse(execFileSync('docker',['context','inspect'],{encoding:'utf8'}))[0]?.Endpoints?.docker?.Host;
assert.ok(typeof endpoint==='string'&&endpoint.startsWith('unix:///'),'Local engine required');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'sitepilot-auth-ci-')),project='pilot-auth-'+randomBytes(6).toString('hex');
const log=path.join(base,'private-runtime.log'),env={...process.env};
for(const key of Object.keys(env))if(/SUPABASE|SITEPILOT|DEMO_ACCOUNT/.test(key))delete env[key];
let stage='prepare',server,networkCreated=false,stackAttempted=false,passed=false,failureCode='UNCLASSIFIED';
function run(bin,args,extra={}){try{return execFileSync(bin,args,{env,encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],...extra});}catch(e){failureCode=classifyFailure(String(e.stdout||'')+String(e.stderr||''));fs.appendFileSync(log,String(e.stdout||'')+String(e.stderr||''),{mode:0o600});throw new Error('PRIVATE_STEP_FAILED');}}
const cli=(args)=>run('pnpm',['dlx','supabase@2.122.0','--workdir',base,'--network-id',project,...args]);
try{
 fs.cpSync('supabase',path.join(base,'supabase'),{recursive:true});
 const config=path.join(base,'supabase/config.toml');fs.writeFileSync(config,fs.readFileSync(config,'utf8').replace(/^project_id\s*=.*$/m,`project_id = "${project}"`));
 // Default publishing on this generated network is loopback-only, not host-wide.
 run('docker',['network','create','--internal','--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',project]);networkCreated=true;
 stage='start';stackAttempted=true;cli(['start']);
 stage='isolation';const ids=run('docker',['ps','-q','--filter',`network=${project}`]).trim().split(/\s+/).filter(Boolean);assert.ok(ids.length>0);
 for(const id of ids){const ports=JSON.parse(run('docker',['inspect',id,'--format','{{json .NetworkSettings.Ports}}']));for(const bindings of Object.values(ports||{}))for(const b of bindings||[])assert.ok(['127.0.0.1','::1'].includes(b.HostIp),'Non-loopback publishing refused');}
 stage='migrate';cli(['migration','up','--local']);
 stage='configuration';const local=JSON.parse(cli(['status','--output','json']));const api=new URL(local.API_URL);assert.ok(['127.0.0.1','localhost'].includes(api.hostname)&&api.protocol==='http:');
 assert.ok(typeof local.ANON_KEY==='string'&&typeof local.SERVICE_ROLE_KEY==='string','Local keys missing');
 Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:api.origin,SUPABASE_URL:api.origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:local.ANON_KEY,SUPABASE_ANON_KEY:local.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:local.SERVICE_ROLE_KEY,SITEPILOT_ENCRYPTION_KEY:randomBytes(32).toString('hex'),DISPOSABLE_AUTH_TEST:'1'});
 stage='build';run('pnpm',['build']);
 stage='dashboard';server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3002','--hostname','127.0.0.1'],{cwd:path.resolve('apps/dashboard'),env,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SERVER_TIMEOUT')),30000);server.once('error',reject);server.once('exit',()=>{clearTimeout(timer);reject(new Error('SERVER_EXIT'));});server.stderr.on('data',b=>fs.appendFileSync(log,b,{mode:0o600}));server.stdout.on('data',b=>{if(b.toString().includes('Ready in')){clearTimeout(timer);resolve();}});});
 stage='browser';const output=run(process.execPath,['tests/browser/real-auth-review.mjs',path.resolve(process.argv[2]),'http://127.0.0.1:3002'],{timeout:180000});assert.ok(output.includes('REAL_AUTH_REVIEW_OK'),'Browser success marker absent');
 passed=true;console.log('::notice title=Real auth acceptance::PASS actual local Auth, PostgREST, signed ingestion and browser sessions');
}catch{console.log(`::error title=Real auth acceptance::FAIL stage=${stage}; code=${failureCode}; private diagnostics not uploaded`);process.exitCode=1;}
finally{
 server?.kill('SIGTERM');
 try{if(stackAttempted)cli(['stop','--no-backup']);if(networkCreated)run('docker',['network','rm',project]);console.log('::notice title=Real auth cleanup::PASS generated stack stopped');}catch{passed=false;process.exitCode=1;console.log('::error title=Real auth cleanup::FAIL generated stack cleanup');}
 if(passed)fs.rmSync(base,{recursive:true,force:true});
}

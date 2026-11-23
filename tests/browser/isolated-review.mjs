// Run inside a fresh Linux network namespace with only loopback, not on host network.
// See tests/browser/isolated-review.md for the unprivileged runner wrapper.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
assert.equal(process.platform,'linux');
assert.match(process.env.HOST_NETNS||'',/^net:\[\d+\]$/,'Capture parent namespace before unshare');
assert.notEqual(fs.readlinkSync('/proc/self/ns/net'),process.env.HOST_NETNS,'Must use a separate network namespace');
assert.ok(Object.keys(os.networkInterfaces()).every(name=>name==='lo'),'Namespace must have only loopback');
const root=process.cwd(),dashboard=path.join(root,'apps/dashboard');
for(const dir of [root,dashboard])for(const file of ['.env','.env.local','.env.production','.env.production.local'])assert.equal(fs.existsSync(path.join(dir,file)),false,'Do not run fixture browser with dotenv credentials');
const env={...process.env};for(const key of Object.keys(env))if(/SUPABASE|SITEPILOT|DEMO_ACCOUNT/.test(key))delete env[key];
const server=spawn(process.execPath,[path.join(dashboard,'node_modules/next/dist/bin/next'),'start','-p','3002','--hostname','0.0.0.0'],{cwd:dashboard,env,stdio:['ignore','pipe','pipe']});
let browser;
const terminate=()=>{browser?.kill('SIGTERM');server.kill('SIGTERM');};
process.once('SIGTERM',terminate);process.once('SIGINT',terminate);
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('ISOLATED_SERVER_START_TIMEOUT')),30000);server.once('error',reject);server.once('exit',()=>{clearTimeout(timer);reject(new Error('ISOLATED_SERVER_EXIT'));});server.stdout.on('data',data=>{if(data.toString().includes('Ready in')){clearTimeout(timer);resolve();}});});
 browser=spawn(process.execPath,[path.join(root,'tests/browser/restricted-review.mjs'),path.resolve(process.argv[2]),'http://127.0.0.1:3002'],{cwd:root,env,stdio:'inherit'});
 const status=await new Promise((resolve,reject)=>{browser.once('error',reject);browser.once('exit',resolve);});
 assert.equal(status,0,'Compiled browser fixtures failed');console.log('PASS isolated browser acceptance; no host-network listener');
}finally{terminate();}

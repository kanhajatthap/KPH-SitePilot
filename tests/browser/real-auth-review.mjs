// Requires an already-running DISPOSABLE local Supabase + dashboard using the same env.
// No auth/API mocks. Lost-response scenario forwards the real mutation then drops response.
// node tests/browser/real-auth-review.mjs /tmp/review-browser/node_modules http://127.0.0.1:3002
import {cleanupResources} from './cleanup.mjs';
import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {randomUUID,randomBytes,createHash,createHmac,createCipheriv} from 'node:crypto';
const require=createRequire(path.resolve('apps/dashboard/package.json'));const {createClient}=require('@supabase/supabase-js');
function local(value){const u=new URL(value);assert.ok(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)&&!u.username&&!u.password,'Disposable loopback HTTP only');return u.origin;}
assert.equal(process.env.DISPOSABLE_AUTH_TEST,'1','Explicit disposable test opt-in required');
const origin=local(process.argv[3]);const api=local(process.env.NEXT_PUBLIC_SUPABASE_URL);
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY,'Local service key required');assert.ok(/^[a-f0-9]{64}$/i.test(process.env.SITEPILOT_ENCRYPTION_KEY||''),'Local encryption key must be 32-byte hex');
const admin=createClient(api,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const modules=path.resolve(process.argv[2]);const {chromium}=await import(pathToFileURL(path.join(modules,'playwright-core/index.mjs')));
const {default:binary,inflate}=await import(pathToFileURL(path.join(modules,'@sparticuz/chromium/build/index.js')));
await inflate(path.join(modules,'@sparticuz/chromium/bin/al2023.tar.br'));
const browser=await chromium.launch({env:{...process.env,LD_LIBRARY_PATH:`${path.join(os.tmpdir(),'al2023/lib')}:${process.env.LD_LIBRARY_PATH||''}`},executablePath:await binary.executablePath(),args:binary.args.filter(a=>!['--single-process','--disable-web-security','--allow-running-insecure-content','--disable-site-isolation-trials'].includes(a)),headless:true});
const users=[];const contexts=[];let projectId;let projectCreated=false;let siteId;let checks=0;
const check=(v,label)=>{assert.ok(v,label);checks++;console.log(`PASS ${label}`);};
const sha=s=>createHash('sha256').update(s).digest('hex');const secret=randomBytes(32).toString('hex');
function encrypted(s){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',Buffer.from(process.env.SITEPILOT_ENCRYPTION_KEY,'hex'),iv);const bytes=Buffer.concat([c.update(s,'utf8'),c.final()]);return ['v1',iv.toString('base64url'),c.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');}
function ok(result,label){if(result.error)throw new Error(label);return result.data;}
async function user(){const password=randomBytes(24).toString('hex')+'aA1!';const email=`pilot-${randomUUID()}@example.test`;const d=ok(await admin.auth.admin.createUser({email,password,email_confirm:true}),'FIXTURE_USER_CREATION_FAILED');users.push(d.user.id);return {...d.user,password};}
async function ingest(){const id=randomBytes(16).toString('hex'),now=Date.now(),before='body{}',after='body{color:blue}';const raw=JSON.stringify({purpose:'restricted-file-review-v1',protocol:'restricted-files-v1',engineVersion:1,proposalId:id,path:'themes/test/style.css',before,after,beforeHash:sha(before),afterHash:sha(after),currentHash:sha(before),observedAt:now,expiresAt:now+600000,environment:'staging',operatorOptIn:true,canEdit:true,allowedPaths:['themes/test/style.css']});const ts=Math.floor(now/1000),nonce=randomBytes(16).toString('hex');const headers={'content-type':'application/json','x-sitepilot-site':siteId,'x-sitepilot-timestamp':String(ts),'x-sitepilot-nonce':nonce,'x-sitepilot-signature':createHmac('sha256',secret).update(`${ts}.${nonce}.${sha(raw)}`).digest('hex')};const response=await fetch(origin+'/api/connector/restricted-files/ingest',{method:'POST',headers,body:raw,signal:AbortSignal.timeout(15000)});check(response.status===201,'actual signed HTTP ingestion');const replay=await fetch(origin+'/api/connector/restricted-files/ingest',{method:'POST',headers,body:raw,signal:AbortSignal.timeout(15000)});check(replay.status===401,'actual nonce replay rejected');return id;}
const review=id=>`${origin}/restricted-review?siteId=${siteId}&proposalId=${id}`;
async function login(u,id){const context=await browser.newContext();contexts.push(context);await context.route('**/*',route=>[origin,api].includes(new URL(route.request().url()).origin)?route.continue():route.abort());const page=await context.newPage();await page.goto(`${origin}/login?next=${encodeURIComponent(new URL(review(id)).pathname+new URL(review(id)).search)}`);await page.locator('#login-email').fill(u.email);await page.locator('#login-password').fill(u.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(/\/restricted-review\?/);return {context,page};}
async function submit(page,id){await page.locator('#proposal-confirmation').fill(id);await page.getByRole('button',{name:'Record review — no execution'}).click();}
try{
 const owner=await user(),other=await user();projectId=randomUUID();siteId=randomUUID();
 ok(await admin.from('projects').insert({id:projectId,owner_id:owner.id,name:'Disposable real-auth acceptance'}),'PROJECT_CREATE_FAILED');projectCreated=true;
 ok(await admin.from('sites').insert({id:siteId,project_id:projectId,url:'https://fixture.invalid',name:'Disposable',environment:'staging',token_hash:sha(randomBytes(32).toString('hex')),secret_encrypted:encrypted(secret),scopes:['files','code']}),'SITE_CREATE_FAILED');
 const id=await ingest();const a=await login(owner,id);await a.page.locator('#proposal-confirmation').waitFor();check(true,'real owner login and source disclosure');
 const b=await login(other,id);await b.page.getByText(/no longer own this site/).waitFor();check(await b.page.locator('main pre').count()===0,'real non-owner sees no source');
 const second=await a.context.newPage();await second.goto(review(id));await second.locator('#proposal-confirmation').waitFor();await Promise.all([submit(a.page,id),submit(second,id)]);
 await a.page.waitForFunction(()=>/Review recorded|could not be confirmed/.test(document.querySelector('[role=status]')?.textContent||''));await second.waitForFunction(()=>/Review recorded|could not be confirmed/.test(document.querySelector('[role=status]')?.textContent||''));
 const messages=await Promise.all([a.page,second].map(p=>p.locator('[role=status]').textContent()));check(messages.filter(m=>m.startsWith('Review recorded.')).length===1,'two authenticated tabs yield exactly one recorded receipt');
 const lost=await ingest();await a.page.goto(review(lost));await a.page.route('**/restricted-files/review',async route=>{await route.fetch();await route.abort('failed');},{times:1});await submit(a.page,lost);await a.page.getByText(/could not be confirmed/).waitFor();await a.page.getByRole('button',{name:'Reload status'}).click();await a.page.getByText(/Review already recorded/).waitFor();check(true,'lost actual mutation response reconciled without resubmit');
 const revoked=await ingest();await a.page.goto(review(revoked));await a.page.locator('#proposal-confirmation').waitFor();ok(await admin.from('sites').update({status:'revoked'}).eq('id',siteId),'REVOKE_FAILED');await submit(a.page,revoked);await a.page.getByText(/could not be confirmed/).waitFor();check(true,'revocation after opening prevents approval');
 await a.context.clearCookies();await a.page.getByRole('button',{name:'Reload status'}).click();await a.page.getByText(/Your session has expired/).waitFor();check(await a.page.locator('main pre').count()===0,'lost session clears source (not timed JWT expiry)');
 const jobs=ok(await admin.from('jobs').select('id').eq('site_id',siteId),'JOBS_READ_FAILED');check(jobs.length===0,'no execution dispatched');
 console.log(`REAL_AUTH_REVIEW_OK ${checks} checks; disposable Auth/PostgREST only; response-loss fault injection; no production claim`);
}finally{
 // Continue cleaning only this run's generated IDs even if one close/delete fails.
 const cleanup=await cleanupResources([
  ...contexts.map((context,i)=>({label:`context-${i}`,run:()=>context.close()})),
  {label:'browser',run:()=>browser.close()},
  ...(projectCreated?[{label:'fixture-project',run:async()=>{ok(await admin.from('projects').delete().eq('id',projectId),'FIXTURE_PROJECT_CLEANUP_FAILED');}}]:[]),
  ...users.map((id,i)=>({label:`fixture-user-${i}`,run:async()=>{ok(await admin.auth.admin.deleteUser(id),'FIXTURE_USER_CLEANUP_FAILED');}})),
 ]);
 if(cleanup.some(r=>r.status==='FAIL')){process.exitCode=1;console.error(JSON.stringify({status:'FAIL',cleanup}));}
}

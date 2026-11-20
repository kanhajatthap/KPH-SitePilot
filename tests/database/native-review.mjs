// Fresh native PostgreSQL only. No database URL accepted. NOT Supabase Auth E2E.
// npm install --prefix /tmp/pilot-runtime --ignore-scripts embedded-postgres@18.7.0-beta.19 pg@8.16.3
// node tests/database/native-review.mjs /tmp/pilot-runtime/node_modules
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.resolve(process.argv[2],'embedded-postgres/dist/index.js')));
const base=fs.mkdtempSync(path.join(os.tmpdir(),'sitepilot-native-db-'));
const cluster=new EmbeddedPostgres({databaseDir:path.join(base,'db'),user:'postgres',password:randomBytes(24).toString('hex'),port:55439,persistent:false,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
const clients=[];let passed=0;
const check=(v,label)=>{assert.ok(v,label);passed++;console.log(`PASS ${label}`);};
async function client(){const c=cluster.getPgClient();await c.connect();clients.push(c);await c.query("SET statement_timeout='8s'");return c;}
const owner='10000000-0000-4000-8000-000000000061',other='10000000-0000-4000-8000-000000000062',site='30000000-0000-4000-8000-000000000061',project='20000000-0000-4000-8000-000000000061';
const consume=(c,id)=>c.query('SELECT public.consume_restricted_file_review($1,$2,$2,$3,$4) AS ok',[site,id,'b'.repeat(64),'c'.repeat(64)]).then(r=>r.rows[0].ok);
try {
 await cluster.initialise();await cluster.start();const admin=await client();
 // Minimal Supabase identity shim, explicitly not JWT verification. Real PostgreSQL roles/RLS.
 await admin.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',aud text,role text,encrypted_password text,email_confirmed_at timestamptz,created_at timestamptz,updated_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;`);
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await admin.query(fs.readFileSync(path.join('supabase/migrations',file),'utf8'));
 check(true,'all repository migrations apply on fresh native PostgreSQL');
 if(process.env.PGTAP_SOURCE){
  const source=fs.readFileSync(process.env.PGTAP_SOURCE,'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'),'383ecd73edfd1c7ed5f3b835134ee1fe74e201ee31599346c92ea029b65dcdce');
  // Same substitutions as upstream Makefile for modern PostgreSQL, no assertion rewrites.
  await admin.query(source.replaceAll('__OS__','linux').replaceAll('__VERSION__','1.3'));
  for(const file of fs.readdirSync('supabase/tests/database').filter(f=>f.endsWith('.sql')).sort()){
   const result=await admin.query(fs.readFileSync(path.join('supabase/tests/database',file),'utf8'));
   const lines=result.flatMap(r=>r.rows).flatMap(r=>Object.values(r)).filter(v=>typeof v==='string').flatMap(v=>v.split('\n'));
   const plan=lines.find(v=>/^1\.\.\d+$/.test(v));assert.ok(plan,`Missing pgTAP plan: ${file}`);
   const total=Number(plan.slice(3));assert.equal(lines.filter(v=>/^ok \d+/.test(v)).length,total,`pgTAP assertions: ${file}`);
   assert.equal(lines.some(v=>/^not ok|^# (Looks like|Failed)/.test(v)),false,`pgTAP failure: ${file}`);
   check(true,`${file}: ${total} pgTAP assertions`);
  }
 }
 await admin.query('INSERT INTO auth.users(id,email) VALUES ($1,$3),($2,$4)',[owner,other,'owner@fixture.invalid','other@fixture.invalid']);
 await admin.query('INSERT INTO public.projects(id,owner_id,name) VALUES ($1,$2,$3)',[project,owner,'Native fixture']);
 await admin.query("INSERT INTO public.sites(id,project_id,url,name,environment,token_hash,secret_encrypted) VALUES($1,$2,'https://fixture.invalid','Fixture','staging','fixture-hash','fixture-cipher')",[site,project]);
 const service=await client();await service.query('SET ROLE service_role');
 async function ingest(id){return (await service.query("SELECT public.ingest_restricted_file_review($1,$2,'themes/test/style.css',$3,$4,'fixture-cipher',clock_timestamp(),clock_timestamp()+interval '5 minutes') AS ok",[site,id,'b'.repeat(64),'c'.repeat(64)])).rows[0].ok;}
 async function actor(id){const c=await client();await c.query('SET ROLE authenticated');await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);return c;}
 const a=await actor(owner),b=await actor(owner),stranger=await actor(other);
 const id='a'.repeat(32);check(await ingest(id),'service ingests evidence');check(!await ingest(id),'duplicate ingestion refused');
 check((await stranger.query('SELECT * FROM public.restricted_file_reviews')).rowCount===0,'RLS hides receipt from non-owner');
 check(!await consume(stranger,id),'non-owner cannot consume');
 await assert.rejects(a.query('SELECT * FROM public.restricted_file_evidence'),e=>e.code==='42501');check(true,'ciphertext SQL access denied to browser role');
 const results=await Promise.all([consume(a,id),consume(b,id)]);check(results.filter(Boolean).length===1,'two native connections consume exactly once');check(!await consume(a,id),'replay refused');
 const stale='d'.repeat(32);await ingest(stale);await admin.query("UPDATE public.restricted_file_evidence SET observed_at=statement_timestamp()-interval '2 minutes',valid_until=statement_timestamp()-interval '1 minute' WHERE proposal_id=$1",[stale]);check(!await consume(a,stale),'expired evidence refused');
 check(Number((await service.query('SELECT public.purge_expired_restricted_sources() AS n')).rows[0].n)===1,'expired ciphertext purged');
 check((await a.query('SELECT * FROM public.restricted_file_reviews WHERE proposal_id=$1',[stale])).rowCount===1,'purge retains metadata');
 const revoked='e'.repeat(32);await ingest(revoked);await admin.query("UPDATE public.sites SET status='revoked' WHERE id=$1",[site]);check(!await consume(a,revoked),'revocation prevents consumption');check(!await ingest('f'.repeat(32)),'revocation prevents ingestion');await admin.query("UPDATE public.sites SET status='active' WHERE id=$1",[site]);
 const transfer='1'.repeat(32);await ingest(transfer);await admin.query('UPDATE public.projects SET owner_id=$1 WHERE id=$2',[other,project]);check(!await consume(a,transfer),'old owner cannot consume after transfer');check((await a.query('SELECT * FROM public.restricted_file_reviews')).rowCount===0,'old owner loses receipt visibility');await admin.query('UPDATE public.projects SET owner_id=$1 WHERE id=$2',[owner,project]);
 // Hold only the receipt row, so old function passes freshness then waits in UPDATE.
 const waiting='2'.repeat(32);await ingest(waiting);
 await admin.query("UPDATE public.restricted_file_evidence SET observed_at=statement_timestamp()-interval '59 seconds',valid_until=statement_timestamp()+interval '1 second' WHERE proposal_id=$1",[waiting]);
 const blocker=await client();await blocker.query('BEGIN');await blocker.query('SELECT 1 FROM public.restricted_file_reviews WHERE proposal_id=$1 FOR UPDATE',[waiting]);
 const pending=consume(a,waiting);await admin.query('SELECT pg_sleep(1.3)');await blocker.query('COMMIT');
 check(!await pending,'evidence expiring during receipt lock wait cannot be consumed');
 const evidenceWait='3'.repeat(32);await ingest(evidenceWait);
 await admin.query("UPDATE public.restricted_file_evidence SET observed_at=statement_timestamp()-interval '59 seconds',valid_until=statement_timestamp()+interval '1 second' WHERE proposal_id=$1",[evidenceWait]);
 await blocker.query('BEGIN');await blocker.query('SELECT 1 FROM public.restricted_file_evidence WHERE proposal_id=$1 FOR UPDATE',[evidenceWait]);
 const pendingEvidence=consume(a,evidenceWait);await admin.query('SELECT pg_sleep(1.3)');await blocker.query('COMMIT');check(!await pendingEvidence,'evidence lock wait also rechecks wall-clock expiry');
 const mismatch='4'.repeat(32);await ingest(mismatch);
 check(!(await a.query('SELECT public.consume_restricted_file_review($1,$2,$2,$3,$4) AS ok',[site,mismatch,'0'.repeat(64),'c'.repeat(64)])).rows[0].ok,'wrong current hash refuses consumption');
 check(!(await a.query('SELECT public.consume_restricted_file_review($1,$2,$3,$4,$5) AS ok',[site,mismatch,'wrong','b'.repeat(64),'c'.repeat(64)])).rows[0].ok,'typed confirmation mismatch refuses consumption');
 await admin.query("UPDATE public.sites SET scopes=ARRAY['read'] WHERE id=$1",[site]);check(!await consume(a,mismatch),'scope removal refuses consumption');
 check((await admin.query("SELECT NOT has_function_privilege('anon','public.consume_restricted_file_review(uuid,text,text,text,text)','EXECUTE') AS ok")).rows[0].ok,'anonymous role has no consume privilege');
 check((await admin.query("SELECT NOT has_function_privilege('authenticated','public.purge_expired_restricted_sources()','EXECUTE') AS ok")).rows[0].ok,'browser cannot invoke source purge');
 await service.query('SELECT public.purge_expired_restricted_sources()');
 check((await admin.query('SELECT 1 FROM public.restricted_file_evidence WHERE proposal_id=$1',[mismatch])).rowCount===1,'purge retains fresh evidence');
 check((await admin.query('SELECT count(*)::int AS n FROM public.jobs WHERE site_id=$1',[site])).rows[0].n===0,'no execution jobs created');
 console.log(`NATIVE_REVIEW_OK ${passed} assertions; native PostgreSQL, identity shim, NOT Auth/PostgREST/hosted E2E`);
} finally {await Promise.all(clients.map(c=>c.end().catch(()=>{})));await cluster.stop();fs.rmSync(base,{recursive:true,force:true});}

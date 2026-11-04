// Optional isolated SQL smoke harness; NOT the full Supabase/pgTAP suite.
// Pass an installed @electric-sql/pglite module file as argv[2].
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
import { readFileSync } from 'node:fs';
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid primary key,email text);
CREATE TABLE public.projects(id uuid primary key,owner_id uuid,name text);
CREATE TABLE public.sites(id uuid primary key,project_id uuid,url text,name text,token_hash text,secret_encrypted text,status text default 'active',updated_at timestamptz);
CREATE TABLE public.jobs(attempts integer default 0,max_attempts integer default 3,lease_expires_at timestamptz,claimed_at timestamptz,created_at timestamptz default now(),id uuid primary key,project_id uuid,site_id uuid,tool text,idempotency_key text,status text default 'queued',result jsonb,updated_at timestamptz);
CREATE TABLE public.snapshots(id uuid primary key,project_id uuid,site_id uuid,resource text,before jsonb,restored_at timestamptz,restore_job_id uuid);
CREATE FUNCTION plan(integer) RETURNS text LANGUAGE sql AS $$ SELECT 'plan' $$;
CREATE FUNCTION ok(boolean,text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN IF $1 IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', $2; END IF; RETURN 'PASS ' || $2; END $$;
CREATE FUNCTION is(text,text,text) RETURNS text LANGUAGE sql AS $$ SELECT ok($1 IS NOT DISTINCT FROM $2,$3) $$;
CREATE FUNCTION is(integer,integer,text) RETURNS text LANGUAGE sql AS $$ SELECT ok($1 IS NOT DISTINCT FROM $2,$3) $$;
CREATE FUNCTION throws_ok(text,text,text,text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE $1; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=$2 AND SQLERRM=$3 THEN RETURN 'PASS ' || $4; ELSE RAISE; END IF; END; RAISE EXCEPTION 'expected exception: %',$4; END $$;
CREATE FUNCTION finish() RETURNS text LANGUAGE sql AS $$ SELECT 'finished' $$;`);
await db.exec(readFileSync('supabase/migrations/20261104120000_recovery_integrity.sql','utf8'));
const results=await db.exec(readFileSync('supabase/tests/database/recovery.test.sql','utf8'));
const passes=results.flatMap(r=>r.rows).flatMap(r=>Object.values(r)).filter(v=>typeof v==='string'&&v.startsWith('PASS '));
console.log(passes.join('\n')); console.log(`${passes.length} SQL smoke assertions passed on isolated minimal schema (not full Supabase/pgTAP).`);
await db.close();

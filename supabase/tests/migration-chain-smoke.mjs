// Optional WASM smoke: real repository migrations, minimal auth schema and
// assertion shims. NOT the full Supabase stack, pgTAP or concurrency proof.
// Usage: node supabase/tests/migration-chain-smoke.mjs /path/to/pglite/dist/index.js
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db = new PGlite();
try {
  await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, aud text, role text,
 encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
CREATE FUNCTION public.plan(integer) RETURNS text LANGUAGE sql AS $$ SELECT 'PLAN ' || $1 $$;
CREATE FUNCTION public.ok(boolean,text) RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN $1 IS TRUE THEN 'PASS ' ELSE 'FAIL ' END || $2 $$;
CREATE FUNCTION public.is(text,text,text) RETURNS text LANGUAGE sql AS $$ SELECT public.ok($1 IS NOT DISTINCT FROM $2,$3) $$;
CREATE FUNCTION public.is(integer,integer,text) RETURNS text LANGUAGE sql AS $$ SELECT public.ok($1 IS NOT DISTINCT FROM $2,$3) $$;
CREATE FUNCTION public.throws_ok(text,text,text,text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE $1;
 EXCEPTION WHEN OTHERS THEN RETURN public.ok(SQLSTATE=$2 AND ($3 IS NULL OR SQLERRM=$3),$4); END;
 RETURN 'FAIL ' || $4;
END; $$;
CREATE FUNCTION public.finish() RETURNS text LANGUAGE sql AS $$ SELECT 'finished' $$;
`);
  const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  console.log(`Applied ${migrations.length} repository migrations to isolated WASM database.`);
  let count = 0; let failures = 0;
  for (const file of readdirSync('supabase/tests/database').filter((f) => f.endsWith('.sql')).sort()) {
    const result = await db.exec(readFileSync(`supabase/tests/database/${file}`, 'utf8'));
    const values = result.flatMap((r) => r.rows).flatMap(Object.values).filter((v) => typeof v === 'string');
    const assertions = values.filter((v) => /^(PASS|FAIL) /.test(v));
    const plan = values.find((v) => v.startsWith('PLAN '));
    if (Number(plan?.slice(5)) !== assertions.length) throw new Error(`Assertion plan mismatch: ${file}`);
    for (const message of assertions) console.log(`${file}: ${message}`);
    count += assertions.length; failures += assertions.filter((v) => v.startsWith('FAIL ')).length;
  }
  console.log(`${count} assertions, ${failures} failures (WASM + auth/assertion shims; not full Supabase/pgTAP).`);
  if (failures) process.exitCode = 1;
} finally { await db.close(); }

BEGIN;
SELECT plan(11);
INSERT INTO auth.users(id,email) VALUES('10000000-0000-4000-8000-000000000061','ingest-owner@example.test');
INSERT INTO public.projects(id,owner_id,name) VALUES('20000000-0000-4000-8000-000000000061','10000000-0000-4000-8000-000000000061','Ingestion');
INSERT INTO public.sites(id,project_id,url,name,environment,token_hash,secret_encrypted) VALUES
('30000000-0000-4000-8000-000000000061','20000000-0000-4000-8000-000000000061','https://ingest.example.test','Ingest','staging','ingest-hash','ingest-cipher');
SELECT ok(NOT has_table_privilege('authenticated','public.restricted_file_evidence','SELECT'),'source ciphertext hidden from browser SQL');
SELECT ok(NOT has_function_privilege('authenticated','public.ingest_restricted_file_review(uuid,text,text,text,text,text,timestamptz,timestamptz)','EXECUTE'),'browser cannot mint evidence');
SET LOCAL ROLE service_role;
SELECT ok(public.ingest_restricted_file_review('30000000-0000-4000-8000-000000000061',repeat('a',32),'themes/test/style.css',repeat('b',64),repeat('c',64),'cipher',clock_timestamp(),clock_timestamp()+interval '5 minutes'),'service ingests atomically');
SELECT ok(NOT public.ingest_restricted_file_review('30000000-0000-4000-8000-000000000061',repeat('a',32),'themes/test/style.css',repeat('b',64),repeat('c',64),'replacement',clock_timestamp(),clock_timestamp()+interval '5 minutes'),'immutable duplicate refused');
SELECT ok(NOT public.ingest_restricted_file_review('30000000-0000-4000-8000-000000000061',repeat('d',32),'themes/test/style.css',repeat('b',64),repeat('c',64),'cipher',clock_timestamp()-interval '61 seconds',clock_timestamp()+interval '5 minutes'),'stale evidence refused');
RESET ROLE;
SELECT is((SELECT owner_id::text FROM public.restricted_file_reviews WHERE proposal_id=repeat('a',32) AND site_id='30000000-0000-4000-8000-000000000061'),'10000000-0000-4000-8000-000000000061','owner derived from project');
-- Stale evidence cannot authorize even direct RPC consumption.
UPDATE public.restricted_file_evidence SET observed_at=statement_timestamp()-interval '2 minutes',valid_until=statement_timestamp()-interval '1 minute';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000061',true);
SELECT ok(NOT public.consume_restricted_file_review('30000000-0000-4000-8000-000000000061',repeat('a',32),repeat('a',32),repeat('b',64),repeat('c',64)),'stale direct RPC refused');
RESET ROLE;
SELECT is(public.purge_expired_restricted_sources()::integer,1,'expired ciphertext purged');
SELECT is((SELECT count(*)::integer FROM public.restricted_file_reviews WHERE site_id='30000000-0000-4000-8000-000000000061'),1,'source purge retains decision metadata');
UPDATE public.sites SET status='revoked' WHERE id='30000000-0000-4000-8000-000000000061';
SET LOCAL ROLE service_role;
SELECT ok(NOT public.ingest_restricted_file_review('30000000-0000-4000-8000-000000000061',repeat('e',32),'themes/test/style.css',repeat('b',64),repeat('c',64),'cipher',clock_timestamp(),clock_timestamp()+interval '5 minutes'),'revoked site ingestion refused');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.jobs WHERE site_id='30000000-0000-4000-8000-000000000061'),0,'no jobs dispatched');
SELECT * FROM finish();
ROLLBACK;

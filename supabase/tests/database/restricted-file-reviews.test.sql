BEGIN;
SELECT plan(15);
INSERT INTO auth.users(id,email) VALUES
('10000000-0000-4000-8000-000000000041','review-owner@example.test'),
('10000000-0000-4000-8000-000000000042','review-other@example.test');
INSERT INTO public.projects(id,owner_id,name) VALUES
('20000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000041','Review');
INSERT INTO public.sites(id,project_id,url,name,environment,token_hash,secret_encrypted) VALUES
('30000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000041','https://review.example.test','Review','staging','review-test-hash','review-test-cipher');
INSERT INTO public.restricted_file_reviews(site_id,proposal_id,owner_id,path,before_hash,after_hash,expires_at) VALUES
('30000000-0000-4000-8000-000000000041',repeat('a',32),'10000000-0000-4000-8000-000000000041','themes/test/style.css',repeat('b',64),repeat('c',64),now()+interval '5 minutes');
INSERT INTO public.restricted_file_evidence VALUES
('30000000-0000-4000-8000-000000000041',repeat('a',32),'fixture-cipher',now(),now()+interval '60 seconds');
SELECT ok(NOT has_table_privilege('authenticated','public.restricted_file_reviews','INSERT'),'users cannot mint proposals');
SELECT ok(NOT has_table_privilege('authenticated','public.restricted_file_reviews','UPDATE'),'users cannot alter proposals');
SELECT ok(NOT has_function_privilege('anon','public.consume_restricted_file_review(uuid,text,text,text,text)','EXECUTE'),'anonymous cannot consume');
SELECT throws_ok($$UPDATE public.restricted_file_reviews SET after_hash=repeat('d',64)$$,'22023','Review immutable','proposal hash immutable');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000042',true);
SELECT is((SELECT count(*)::integer FROM public.restricted_file_reviews),0,'RLS hides another owner review');
SELECT ok(NOT public.consume_restricted_file_review('30000000-0000-4000-8000-000000000041',repeat('a',32),repeat('a',32),repeat('b',64),repeat('c',64)),'other owner cannot consume');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000041',true);
SELECT is((SELECT count(*)::integer FROM public.restricted_file_reviews),1,'owner can read metadata');
SELECT ok(NOT public.consume_restricted_file_review('30000000-0000-4000-8000-000000000041',repeat('a',32),repeat('a',32),repeat('b',64),repeat('d',64)),'wrong after hash refused');
RESET ROLE;
UPDATE public.sites SET environment='production';
SET LOCAL ROLE authenticated;
SELECT ok(NOT public.consume_restricted_file_review('30000000-0000-4000-8000-000000000041',repeat('a',32),repeat('a',32),repeat('b',64),repeat('c',64)),'production review refused');
RESET ROLE;
UPDATE public.sites SET environment='staging';
SET LOCAL ROLE authenticated;
SELECT ok(public.consume_restricted_file_review('30000000-0000-4000-8000-000000000041',repeat('a',32),repeat('a',32),repeat('b',64),repeat('c',64)),'owner records review');
SELECT ok(NOT public.consume_restricted_file_review('30000000-0000-4000-8000-000000000041',repeat('a',32),repeat('a',32),repeat('b',64),repeat('c',64)),'single-use replay refused');
SELECT is((SELECT status FROM public.restricted_file_reviews),'consumed','decision persisted');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.jobs WHERE site_id='30000000-0000-4000-8000-000000000041'),0,'review does not enqueue writes');
INSERT INTO public.restricted_file_reviews(site_id,proposal_id,owner_id,path,before_hash,after_hash,expires_at) VALUES
('30000000-0000-4000-8000-000000000041',repeat('e',32),'10000000-0000-4000-8000-000000000041','themes/test/style.css',repeat('b',64),repeat('c',64),clock_timestamp()+interval '100 milliseconds'),
('30000000-0000-4000-8000-000000000041',repeat('f',32),'10000000-0000-4000-8000-000000000041','themes/test/style.css',repeat('b',64),repeat('c',64),clock_timestamp()+interval '5 minutes');
UPDATE public.restricted_file_reviews SET status='revoked' WHERE proposal_id=repeat('f',32);
SELECT pg_sleep(0.15);
SET LOCAL ROLE authenticated;
SELECT ok(NOT public.consume_restricted_file_review('30000000-0000-4000-8000-000000000041',repeat('e',32),repeat('e',32),repeat('b',64),repeat('c',64)),'expired review refused');
SELECT ok(NOT public.consume_restricted_file_review('30000000-0000-4000-8000-000000000041',repeat('f',32),repeat('f',32),repeat('b',64),repeat('c',64)),'revoked review refused');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

BEGIN;
SELECT plan(11);
INSERT INTO auth.users(id, email) VALUES ('10000000-0000-4000-8000-000000000001','recovery@example.test');
INSERT INTO public.projects(id,owner_id,name) VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Recovery');
INSERT INTO public.sites(id,project_id,url,name,token_hash,secret_encrypted) VALUES
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','https://recovery.example.test','Recovery','test-hash','test-cipher');
INSERT INTO public.snapshots(id,project_id,site_id,resource,before) VALUES
('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','post:1','{"id":1}');
INSERT INTO public.jobs(id,project_id,site_id,tool,idempotency_key) VALUES
('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','content.restore','undo:40000000-0000-4000-8000-000000000001');
SELECT ok((SELECT restored_at IS NULL FROM public.snapshots WHERE id='40000000-0000-4000-8000-000000000001'),'queue does not restore');
UPDATE public.jobs SET status='failed',result='{"verified":true}' WHERE id='50000000-0000-4000-8000-000000000001';
SELECT ok((SELECT restored_at IS NULL FROM public.snapshots WHERE id='40000000-0000-4000-8000-000000000001'),'failed job does not restore');
UPDATE public.jobs SET status='succeeded',result='{"verified":false}' WHERE id='50000000-0000-4000-8000-000000000001';
SELECT ok((SELECT restored_at IS NULL FROM public.snapshots WHERE id='40000000-0000-4000-8000-000000000001'),'unverified success does not restore');
UPDATE public.jobs SET result='{"verified":"true"}' WHERE id='50000000-0000-4000-8000-000000000001';
SELECT ok((SELECT restored_at IS NULL FROM public.snapshots WHERE id='40000000-0000-4000-8000-000000000001'),'string true is not boolean verification');
UPDATE public.jobs SET result='{"verified":true}' WHERE id='50000000-0000-4000-8000-000000000001';
SELECT ok((SELECT restored_at IS NOT NULL AND restore_job_id='50000000-0000-4000-8000-000000000001' FROM public.snapshots WHERE id='40000000-0000-4000-8000-000000000001'),'verified completion links restore');
UPDATE public.jobs SET status='queued' WHERE id='50000000-0000-4000-8000-000000000001';
SELECT public.revoke_connector_site('30000000-0000-4000-8000-000000000001');
SELECT is((SELECT status FROM public.sites WHERE id='30000000-0000-4000-8000-000000000001'),'revoked','site revoked');
SELECT is((SELECT status FROM public.jobs WHERE id='50000000-0000-4000-8000-000000000001'),'cancelled','queued work cancelled');
SELECT is((SELECT count(*)::integer FROM public.claim_next_job('30000000-0000-4000-8000-000000000001')),0,'revoked site cannot claim more work');
SELECT ok(NOT has_function_privilege('authenticated','public.revoke_connector_site(uuid)','EXECUTE'),'user cannot call admin revocation RPC');
-- Force a cancellation failure and prove the site update is rolled back.
UPDATE public.sites SET status='active' WHERE id='30000000-0000-4000-8000-000000000001';
UPDATE public.jobs SET status='queued' WHERE id='50000000-0000-4000-8000-000000000001';
CREATE FUNCTION pg_temp.reject_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test cancellation failure'; END; $$;
CREATE TRIGGER reject_cancel BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_cancel();
SELECT throws_ok($$SELECT public.revoke_connector_site('30000000-0000-4000-8000-000000000001')$$,'P0001','test cancellation failure','cancellation failure propagates');
SELECT is((SELECT status FROM public.sites WHERE id='30000000-0000-4000-8000-000000000001'),'active','failed cancellation rolls back revocation');
SELECT * FROM finish();
ROLLBACK;

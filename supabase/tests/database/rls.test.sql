BEGIN;

SELECT plan(15);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'rls-user-a@example.test', '', now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'rls-user-b@example.test', '', now(), now(), now());

INSERT INTO public.projects (id, owner_id, name)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'User A project'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'User B project');

INSERT INTO public.wordpress_connections (id, project_id, target_site, encrypted_credentials)
VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'http://site-a.local', '{"algorithm":"aes-256-gcm","iv":"iv","ciphertext":"cipher"}'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'http://site-b.local', '{"algorithm":"aes-256-gcm","iv":"iv","ciphertext":"cipher"}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

SELECT is((SELECT count(*)::integer FROM public.projects), 1, 'user A can only select their project');
SELECT is((SELECT count(*)::integer FROM public.wordpress_connection_metadata), 1, 'connection metadata is tenant scoped');
INSERT INTO public.dashboard_chat_history (owner_id, conversations, active_conversation_id)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '[{"id":"550e8400-e29b-41d4-a716-446655440000","title":"User A task","createdAt":"2026-10-26T12:00:00Z","updatedAt":"2026-10-26T12:00:00Z","messages":[{"id":"user-a-message","role":"user","content":"Hello","timestamp":"2026-10-26T12:00:00Z"}]}]',
  '550e8400-e29b-41d4-a716-446655440000'
);
SELECT is(
  (SELECT count(*)::integer FROM public.dashboard_chat_history
    WHERE conversations @> '[{"title":"User A task"}]'::jsonb),
  1,
  'user A can persist and read only their conversation'
);
SELECT throws_ok(
  $$INSERT INTO public.dashboard_chat_history (owner_id, conversations, active_conversation_id) VALUES ('22222222-2222-4222-8222-222222222222', '[]', NULL)$$,
  '42501', NULL, 'user A cannot persist a conversation for user B'
);
SELECT throws_ok(
  $$INSERT INTO public.projects (owner_id, name) VALUES ('22222222-2222-4222-8222-222222222222', 'forged project')$$,
  '42501', NULL, 'user A cannot create a project for user B'
);
SELECT throws_ok(
  $$UPDATE public.projects SET owner_id = '22222222-2222-4222-8222-222222222222' WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501', NULL, 'user A cannot transfer project ownership'
);
WITH changed AS (
  UPDATE public.projects
  SET name = 'hijacked'
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  RETURNING id
)
SELECT is(
  (SELECT count(*)::integer FROM changed),
  0,
  'user A cannot update user B project'
);
WITH removed AS (
  DELETE FROM public.projects
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  RETURNING id
)
SELECT is(
  (SELECT count(*)::integer FROM removed),
  0,
  'user A cannot delete user B project'
);
SELECT throws_ok(
  $$SELECT encrypted_credentials FROM public.wordpress_connections$$,
  '42501', NULL, 'browser role cannot read encrypted credential bytes'
);
SELECT throws_ok(
  $$INSERT INTO public.change_proposals (project_id, target_site, plan_hash, staged_plan) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'http://site-a.local', 'hash', '{}')$$,
  '42501', NULL, 'browser role cannot create or approve privileged proposals'
);
SELECT throws_ok(
  $$INSERT INTO public.model_usage (owner_id, project_id, provider, model) VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'mock', 'mock')$$,
  '42501', NULL, 'browser role cannot forge usage records'
);
SELECT throws_ok(
  $$SELECT public.consume_agent_rate_limit('11111111-1111-4111-8111-111111111111')$$,
  '42501', NULL, 'browser role cannot consume or manipulate server rate limits'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT is((SELECT count(*)::integer FROM public.projects), 1, 'user B can only select their project');
SELECT is(
  (SELECT count(*)::integer FROM public.dashboard_chat_history),
  0,
  'user B cannot read user A conversation'
);
WITH changed AS (
  UPDATE public.dashboard_chat_history
  SET conversations = '[]'::jsonb, active_conversation_id = NULL
  WHERE owner_id = '11111111-1111-4111-8111-111111111111'
  RETURNING owner_id
)
SELECT is(
  (SELECT count(*)::integer FROM changed),
  0,
  'user B cannot write user A conversation'
);

SELECT * FROM finish();
ROLLBACK;

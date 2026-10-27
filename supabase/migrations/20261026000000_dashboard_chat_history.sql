CREATE TABLE public.dashboard_chat_history (
  owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (
      CASE
        WHEN jsonb_typeof(messages) = 'array'
          THEN jsonb_array_length(messages) <= 100 AND pg_column_size(messages) <= 1048576
        ELSE false
      END
    ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_chat_history FORCE ROW LEVEL SECURITY;

CREATE POLICY dashboard_chat_history_select_self ON public.dashboard_chat_history
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY dashboard_chat_history_insert_self ON public.dashboard_chat_history
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY dashboard_chat_history_update_self ON public.dashboard_chat_history
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY dashboard_chat_history_delete_self ON public.dashboard_chat_history
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id);

REVOKE ALL ON public.dashboard_chat_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_chat_history TO authenticated;
GRANT ALL ON public.dashboard_chat_history TO service_role;

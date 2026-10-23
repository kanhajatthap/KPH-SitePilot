-- Multi-tenant foundation. User identity always comes from auth.uid().

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wordpress_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_site TEXT NOT NULL CHECK (length(target_site) <= 2048),
  environment TEXT NOT NULL DEFAULT 'local'
    CHECK (environment IN ('local', 'staging', 'production')),
  encrypted_credentials JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, target_site)
);

CREATE TABLE public.change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_site TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (
    status IN ('proposed', 'validated', 'approved', 'rejected', 'applied', 'failed', 'rolled_back')
  ),
  staged_plan JSONB NOT NULL,
  approved_by UUID REFERENCES public.profiles(id),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.wordpress_connections(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'read_only' CHECK (mode IN ('read_only', 'controlled_write')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  model_provider TEXT,
  model_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.model_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.agent_jobs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (length(provider) <= 80),
  model TEXT NOT NULL CHECK (length(model) <= 120),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Not directly accessible by users; updated atomically by the rate-limit RPC.
CREATE TABLE public.agent_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0)
);

CREATE INDEX projects_owner_idx ON public.projects(owner_id);
CREATE INDEX wordpress_connections_project_idx ON public.wordpress_connections(project_id);
CREATE INDEX change_proposals_project_idx ON public.change_proposals(project_id);
CREATE INDEX audit_events_project_created_idx ON public.audit_events(project_id, created_at DESC);
CREATE INDEX agent_jobs_owner_created_idx ON public.agent_jobs(owner_id, created_at DESC);
CREATE INDEX model_usage_owner_created_idx ON public.model_usage(owner_id, created_at DESC);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wordpress_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rate_limits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.wordpress_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.change_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.model_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rate_limits FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);

CREATE POLICY projects_select_owner ON public.projects
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY projects_insert_owner ON public.projects
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY projects_update_owner ON public.projects
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY projects_delete_owner ON public.projects
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY connections_select_owner ON public.wordpress_connections
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );
CREATE POLICY connections_insert_owner ON public.wordpress_connections
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );
CREATE POLICY connections_update_owner ON public.wordpress_connections
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );
CREATE POLICY connections_delete_owner ON public.wordpress_connections
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY proposals_select_owner ON public.change_proposals
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY audit_select_owner ON public.audit_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY agent_jobs_select_owner ON public.agent_jobs
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY model_usage_select_owner ON public.model_usage
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);

-- This view exposes connection metadata only; encrypted credential bytes remain service-only.
CREATE VIEW public.wordpress_connection_metadata
WITH (security_barrier = true)
AS
  SELECT c.id, c.project_id, c.target_site, c.environment, c.status, c.created_at, c.updated_at
  FROM public.wordpress_connections c
  JOIN public.projects p ON p.id = c.project_id
  WHERE p.owner_id = (SELECT auth.uid());

REVOKE ALL ON public.profiles, public.projects, public.wordpress_connections,
  public.change_proposals, public.audit_events, public.agent_jobs,
  public.model_usage, public.agent_rate_limits FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT ON public.wordpress_connection_metadata TO authenticated;
GRANT SELECT ON public.change_proposals, public.audit_events,
  public.agent_jobs, public.model_usage TO authenticated;
GRANT ALL ON public.profiles, public.projects, public.wordpress_connections,
  public.change_proposals, public.audit_events, public.agent_jobs,
  public.model_usage, public.agent_rate_limits TO service_role;

CREATE FUNCTION public.consume_agent_rate_limit(
  p_user_id UUID,
  p_max_requests INTEGER DEFAULT 30,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_max_requests < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate-limit parameters';
  END IF;

  INSERT INTO public.agent_rate_limits (user_id, window_started_at, request_count)
  VALUES (p_user_id, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET window_started_at = CASE
          WHEN public.agent_rate_limits.window_started_at
            <= now() - make_interval(secs => p_window_seconds)
          THEN now()
          ELSE public.agent_rate_limits.window_started_at
        END,
        request_count = CASE
          WHEN public.agent_rate_limits.window_started_at
            <= now() - make_interval(secs => p_window_seconds)
          THEN 1
          ELSE public.agent_rate_limits.request_count + 1
        END
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_agent_rate_limit(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_agent_rate_limit(UUID, INTEGER, INTEGER) TO service_role;

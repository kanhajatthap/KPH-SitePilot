-- SitePilot v2: connected sites, pairing, plans, approvals, jobs, snapshots and usage.
--
-- Security model:
--   * `sites` holds the token hash and the encrypted per-site secret. It is NOT
--     readable by `authenticated`; only `service_role` and the `site_metadata`
--     view (safe columns, filtered by auth.uid()) are exposed.
--   * Plans/jobs/snapshots are read-only for their owner and written through the
--     server (service role).
--   * Connector tables (nonces, pairing codes, rate limits, BYOK keys) are
--     service-only by design.

CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 2048),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('local', 'staging', 'production')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'revoked', 'offline')),
  plugin_version TEXT,
  wp_version TEXT,
  php_version TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read', 'content', 'media', 'site_ops', 'commerce', 'files', 'code'],
  token_hash TEXT NOT NULL UNIQUE,
  secret_encrypted TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, url)
);

CREATE TABLE public.pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_site UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 20000),
  summary TEXT NOT NULL DEFAULT '',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk TEXT NOT NULL DEFAULT 'R1' CHECK (risk IN ('R0', 'R1', 'R2', 'R3')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'applied', 'failed', 'rolled_back')),
  hash TEXT NOT NULL,
  model_provider TEXT,
  model_name TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out INTEGER NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL UNIQUE REFERENCES public.plans(id) ON DELETE CASCADE,
  approved_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_hash TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES public.approvals(id) ON DELETE SET NULL,
  tool TEXT NOT NULL CHECK (length(tool) BETWEEN 1 AND 80),
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk TEXT NOT NULL DEFAULT 'R1' CHECK (risk IN ('R0', 'R1', 'R2', 'R3')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'running', 'succeeded', 'failed', 'expired', 'cancelled')),
  dry_run BOOLEAN NOT NULL DEFAULT false,
  snapshot BOOLEAN NOT NULL DEFAULT true,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  result JSONB,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, idempotency_key)
);

CREATE TABLE public.job_events (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq >= 0),
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 60),
  message TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, seq)
);

CREATE TABLE public.snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  resource TEXT NOT NULL CHECK (length(resource) BETWEEN 1 AND 200),
  before JSONB,
  after JSONB,
  checksum TEXT NOT NULL DEFAULT '',
  storage_path TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 40),
  provider TEXT,
  model TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out INTEGER NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openrouter', 'groq')),
  key_encrypted TEXT NOT NULL,
  last4 TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider)
);

CREATE TABLE public.connector_nonces (
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL CHECK (nonce ~ '^[a-f0-9]{32}$'),
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, nonce)
);

CREATE TABLE public.rate_limits (
  key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count >= 0)
);

CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  trigger JSONB NOT NULL DEFAULT '{"type":"cron","cron":"0 6 * * 1"}'::jsonb,
  plan_template JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.feature_flags (
  name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_pct INTEGER NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sites_project_idx ON public.sites(project_id);
CREATE INDEX sites_status_last_seen_idx ON public.sites(status, last_seen_at DESC);
CREATE INDEX pairing_codes_project_idx ON public.pairing_codes(project_id);
CREATE INDEX pairing_codes_expires_idx ON public.pairing_codes(expires_at);
CREATE INDEX plans_project_created_idx ON public.plans(project_id, created_at DESC);
CREATE INDEX plans_site_status_idx ON public.plans(site_id, status);
CREATE INDEX jobs_site_status_created_idx ON public.jobs(site_id, status, created_at);
CREATE INDEX jobs_project_created_idx ON public.jobs(project_id, created_at DESC);
CREATE INDEX jobs_lease_idx ON public.jobs(status, lease_expires_at);
CREATE INDEX job_events_job_seq_idx ON public.job_events(job_id, seq);
CREATE INDEX snapshots_site_created_idx ON public.snapshots(site_id, created_at DESC);
CREATE INDEX snapshots_expires_idx ON public.snapshots(expires_at);
CREATE INDEX usage_events_owner_created_idx ON public.usage_events(owner_id, created_at DESC);
CREATE INDEX connector_nonces_seen_idx ON public.connector_nonces(seen_at);

-- Row level security: deny by default everywhere.
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pairing_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.job_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.connector_nonces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.automations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags FORCE ROW LEVEL SECURITY;

-- Owners can read their plans, jobs, events, snapshots, usage and automations.
CREATE POLICY plans_select_owner ON public.plans
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid()))
  );

CREATE POLICY jobs_select_owner ON public.jobs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid()))
  );

CREATE POLICY job_events_select_owner ON public.job_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.projects p ON p.id = j.project_id
      WHERE j.id = job_id AND p.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY snapshots_select_owner ON public.snapshots
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid()))
  );

CREATE POLICY usage_events_select_owner ON public.usage_events
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY automations_select_owner ON public.automations
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = (SELECT auth.uid()))
  );

-- Safe site metadata: no token hash, no secret.
CREATE VIEW public.site_metadata
WITH (security_barrier = true)
AS
  SELECT s.id, s.project_id, s.url, s.name, s.environment, s.status,
         s.plugin_version, s.wp_version, s.php_version, s.capabilities,
         s.scopes, s.last_seen_at, s.created_at, s.updated_at
  FROM public.sites s
  JOIN public.projects p ON p.id = s.project_id
  WHERE p.owner_id = (SELECT auth.uid());

REVOKE ALL ON public.sites, public.pairing_codes, public.plans, public.approvals,
  public.jobs, public.job_events, public.snapshots, public.usage_events,
  public.user_api_keys, public.connector_nonces, public.rate_limits,
  public.automations, public.feature_flags, public.site_metadata
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.plans, public.jobs, public.job_events, public.snapshots,
  public.usage_events, public.automations, public.site_metadata TO authenticated;
GRANT SELECT ON public.feature_flags TO authenticated;

GRANT ALL ON public.sites, public.pairing_codes, public.plans, public.approvals,
  public.jobs, public.job_events, public.snapshots, public.usage_events,
  public.user_api_keys, public.connector_nonces, public.rate_limits,
  public.automations, public.feature_flags TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.job_events_id_seq TO service_role;

-- Experimental metadata-only review ledger. Does NOT authorise or enqueue writes.
-- No source content is stored here; trusted connector proposal ingestion is pending.
CREATE TABLE public.restricted_file_reviews (
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  proposal_id text NOT NULL CHECK (proposal_id ~ '^[a-f0-9]{32}$' AND length(proposal_id) = 32),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  path text NOT NULL CHECK (length(path) <= 240
    AND path ~ '^(themes|plugins)/[a-zA-Z0-9_-]+/([a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+\.(php|js|css)$'
    AND path !~* '(config|secret|credential|password|private|vendor|node_modules|kph-sitepilot|wp-agent-bridge)'),
  before_hash text NOT NULL CHECK (length(before_hash) = 64 AND before_hash ~ '^[a-f0-9]{64}$'),
  after_hash text NOT NULL CHECK (length(after_hash) = 64 AND after_hash ~ '^[a-f0-9]{64}$'),
  risk text NOT NULL DEFAULT 'R3' CHECK (risk = 'R3'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  PRIMARY KEY (site_id, proposal_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes'),
  CHECK ((status = 'consumed') = (consumed_at IS NOT NULL))
);
ALTER TABLE public.restricted_file_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restricted_file_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.restricted_file_reviews TO authenticated;
GRANT ALL ON public.restricted_file_reviews TO service_role;
CREATE POLICY restricted_file_reviews_owner_select ON public.restricted_file_reviews
FOR SELECT TO authenticated USING (
  owner_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.site_metadata s WHERE s.id = site_id
  )
);
CREATE INDEX restricted_file_reviews_expiry_idx ON public.restricted_file_reviews(expires_at);

CREATE FUNCTION public.guard_restricted_file_review() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'status' - 'consumed_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'consumed_at')
       OR OLD.status <> 'pending' OR NEW.status NOT IN ('consumed', 'revoked') THEN
      RAISE EXCEPTION 'Review immutable' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF NEW.status <> 'pending' OR NEW.consumed_at IS NOT NULL
       OR NEW.created_at > clock_timestamp() OR NEW.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'Review unavailable' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.sites s JOIN public.projects p ON p.id = s.project_id
      WHERE s.id = NEW.site_id AND p.owner_id = NEW.owner_id
        AND s.environment = 'staging' AND s.status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE = '22023'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_restricted_file_review() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_restricted_file_review BEFORE INSERT OR UPDATE
ON public.restricted_file_reviews FOR EACH ROW EXECUTE FUNCTION public.guard_restricted_file_review();

-- Identity comes from the authenticated JWT, never an actor argument.
-- A consumed review is NOT executable approval. No jobs/snapshots are created.
CREATE FUNCTION public.consume_restricted_file_review(
  p_site_id uuid, p_proposal_id text, p_confirmation text,
  p_before_hash text, p_after_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR p_confirmation IS DISTINCT FROM p_proposal_id THEN RETURN false; END IF;
  -- Serialize against site revocation/environment and project ownership changes.
  PERFORM 1 FROM public.sites s JOIN public.projects p ON p.id = s.project_id
    WHERE s.id = p_site_id AND p.owner_id = v_actor
      AND s.environment = 'staging' AND s.status = 'active'
    FOR SHARE OF s, p;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.restricted_file_reviews SET status = 'consumed', consumed_at = clock_timestamp()
    WHERE site_id = p_site_id AND proposal_id = p_proposal_id AND owner_id = v_actor
      AND status = 'pending' AND created_at <= clock_timestamp() AND expires_at > clock_timestamp()
      AND before_hash = p_before_hash AND after_hash = p_after_hash;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_restricted_file_review(uuid,text,text,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.consume_restricted_file_review(uuid,text,text,text,text) TO authenticated;

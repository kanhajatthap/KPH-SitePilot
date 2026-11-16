-- Signed proposal sources are encrypted by the server, never browser-readable SQL.
CREATE TABLE public.restricted_file_evidence (
  site_id uuid NOT NULL,
  proposal_id text NOT NULL,
  source_encrypted text NOT NULL CHECK (octet_length(source_encrypted) <= 400000),
  observed_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  PRIMARY KEY (site_id, proposal_id),
  FOREIGN KEY (site_id, proposal_id) REFERENCES public.restricted_file_reviews(site_id,proposal_id) ON DELETE CASCADE,
  CHECK (valid_until > observed_at AND valid_until <= observed_at + interval '60 seconds')
);
ALTER TABLE public.restricted_file_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restricted_file_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.restricted_file_evidence TO service_role;

CREATE FUNCTION public.ingest_restricted_file_review(p_site_id uuid, p_proposal_id text,
 p_path text, p_before_hash text, p_after_hash text, p_source text,
 p_observed_at timestamptz, p_expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_owner uuid;
BEGIN
 IF p_observed_at IS NULL OR p_expires_at IS NULL OR p_observed_at > clock_timestamp()
   OR p_observed_at < clock_timestamp() - interval '60 seconds'
   OR p_expires_at <= clock_timestamp() OR p_expires_at > p_observed_at + interval '10 minutes' THEN RETURN false; END IF;
 SELECT p.owner_id INTO v_owner FROM public.sites s JOIN public.projects p ON p.id=s.project_id
 WHERE s.id=p_site_id AND s.status='active' AND s.environment='staging'
   AND s.scopes @> ARRAY['files','code']::text[] FOR SHARE OF s,p;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.restricted_file_reviews(site_id,proposal_id,owner_id,path,before_hash,after_hash,created_at,expires_at)
 VALUES(p_site_id,p_proposal_id,v_owner,p_path,p_before_hash,p_after_hash,p_observed_at,p_expires_at)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.restricted_file_evidence VALUES(p_site_id,p_proposal_id,p_source,p_observed_at,LEAST(p_expires_at,p_observed_at+interval '60 seconds'));
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.ingest_restricted_file_review(uuid,text,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_restricted_file_review(uuid,text,text,text,text,text,timestamptz,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_restricted_file_review(
 p_site_id uuid,p_proposal_id text,p_confirmation text,p_before_hash text,p_after_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
 IF v_actor IS NULL OR p_confirmation IS DISTINCT FROM p_proposal_id THEN RETURN false; END IF;
 PERFORM 1 FROM public.sites s JOIN public.projects p ON p.id=s.project_id
 WHERE s.id=p_site_id AND p.owner_id=v_actor AND s.environment='staging' AND s.status='active'
 AND s.scopes @> ARRAY['files','code']::text[] FOR SHARE OF s,p;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Even direct RPC callers cannot consume legacy/unattested or stale receipts.
 PERFORM 1 FROM public.restricted_file_evidence e WHERE e.site_id=p_site_id AND e.proposal_id=p_proposal_id
 AND e.observed_at <= clock_timestamp() AND e.valid_until > clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.restricted_file_reviews SET status='consumed',consumed_at=clock_timestamp()
 WHERE site_id=p_site_id AND proposal_id=p_proposal_id AND owner_id=v_actor AND status='pending'
 AND created_at <= clock_timestamp() AND expires_at > clock_timestamp()
 AND before_hash=p_before_hash AND after_hash=p_after_hash;
 RETURN FOUND;
END; $$;

-- Called by the existing connector cleanup; explicit helper for bounded source retention.
CREATE FUNCTION public.purge_expired_restricted_sources() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE removed bigint;
BEGIN
 DELETE FROM public.restricted_file_evidence WHERE valid_until <= clock_timestamp();
 GET DIAGNOSTICS removed = ROW_COUNT; RETURN removed;
END; $$;
REVOKE ALL ON FUNCTION public.purge_expired_restricted_sources() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_restricted_sources() TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_connector_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_nonces INTEGER;
  v_codes INTEGER;
  v_events INTEGER;
  v_snapshots INTEGER;
BEGIN
  PERFORM public.purge_expired_restricted_sources();
  -- Replay protection only needs the signing window (±300s); keep a margin.
  DELETE FROM public.connector_nonces WHERE seen_at < now() - INTERVAL '15 minutes';
  GET DIAGNOSTICS v_nonces = ROW_COUNT;

  DELETE FROM public.pairing_codes
   WHERE expires_at < now() - INTERVAL '1 day'
      OR used_at < now() - INTERVAL '1 day';
  GET DIAGNOSTICS v_codes = ROW_COUNT;

  -- Job history is capped at 30 days on the free tier.
  DELETE FROM public.job_events WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_events = ROW_COUNT;

  DELETE FROM public.snapshots WHERE expires_at < now();
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  RETURN jsonb_build_object(
    'nonces', v_nonces,
    'pairing_codes', v_codes,
    'job_events', v_events,
    'snapshots', v_snapshots
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_connector_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_connector_state() TO service_role;

COMMENT ON FUNCTION public.claim_next_job(UUID, INTEGER) IS
  'Atomically leases one queued or expired job for a site. Returns zero rows when idle.';
COMMENT ON FUNCTION public.touch_site_heartbeat(UUID, JSONB, TEXT, TEXT, TEXT) IS
  'Records connector liveness and refreshes capability metadata without reviving revoked sites.';

-- Freshness must be evaluated AFTER all potentially blocking locks.
-- Metadata-only review; does not authorize or dispatch file execution.
CREATE OR REPLACE FUNCTION public.consume_restricted_file_review(
 p_site_id uuid,p_proposal_id text,p_confirmation text,p_before_hash text,p_after_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := auth.uid();
 v_observed timestamptz;
 v_valid_until timestamptz;
 v_now timestamptz;
BEGIN
 IF v_actor IS NULL OR p_confirmation IS DISTINCT FROM p_proposal_id THEN RETURN false; END IF;
 PERFORM 1 FROM public.sites s JOIN public.projects p ON p.id=s.project_id
 WHERE s.id=p_site_id AND p.owner_id=v_actor AND s.environment='staging' AND s.status='active'
 AND s.scopes @> ARRAY['files','code']::text[] FOR SHARE OF s,p;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Serialize consumers before reading evidence; UPDATE alone may wait past freshness.
 PERFORM 1 FROM public.restricted_file_reviews r
 WHERE r.site_id=p_site_id AND r.proposal_id=p_proposal_id
 AND r.owner_id=v_actor AND r.status='pending' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT e.observed_at,e.valid_until INTO v_observed,v_valid_until
 FROM public.restricted_file_evidence e WHERE e.site_id=p_site_id AND e.proposal_id=p_proposal_id FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 v_now := clock_timestamp();
 IF v_observed > v_now OR v_valid_until <= v_now THEN RETURN false; END IF;
 UPDATE public.restricted_file_reviews SET status='consumed',consumed_at=v_now
 WHERE site_id=p_site_id AND proposal_id=p_proposal_id AND owner_id=v_actor AND status='pending'
 AND created_at <= v_now AND expires_at > v_now
 AND before_hash=p_before_hash AND after_hash=p_after_hash;
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.consume_restricted_file_review(uuid,text,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.consume_restricted_file_review(uuid,text,text,text,text) TO authenticated;

-- Deploy before the matching dashboard code. No destructive historical repair:
-- old restored_at values require a separately authorised evidence-based audit.
CREATE OR REPLACE FUNCTION public.revoke_connector_site(p_site_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.sites SET status = 'revoked', updated_at = now() WHERE id = p_site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site unavailable' USING ERRCODE = 'P0002';
  END IF;
  -- The site trigger cancels queued work in this same transaction.
  -- Already-claimed/running work is not described as cancelled.
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_connector_site(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_connector_site(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_verified_snapshot_restore()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'succeeded'
     AND NEW.result->'verified' = 'true'::jsonb
     AND NEW.tool IN ('content.restore', 'settings.restore', 'terms.restore',
       'seo.meta.restore', 'media.restore', 'media.restore_featured', 'menus.restore') THEN
    UPDATE public.snapshots SET restored_at = now(), restore_job_id = NEW.id
      WHERE NEW.idempotency_key = 'undo:' || id::text
        AND site_id = NEW.site_id AND project_id = NEW.project_id
        AND restored_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_verified_snapshot_restore() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER complete_verified_snapshot_restore
AFTER UPDATE OF status, result ON public.jobs FOR EACH ROW
EXECUTE FUNCTION public.complete_verified_snapshot_restore();

-- Also covers owner PATCH status=revoked, not only disconnect/unpair RPCs.
CREATE OR REPLACE FUNCTION public.cancel_jobs_on_site_revocation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'revoked' THEN
    UPDATE public.jobs SET status = 'cancelled', updated_at = now()
      WHERE site_id = NEW.id AND status = 'queued';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_jobs_on_site_revocation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER cancel_jobs_on_site_revocation AFTER UPDATE OF status ON public.sites
FOR EACH ROW EXECUTE FUNCTION public.cancel_jobs_on_site_revocation();

-- Revocation-aware claim admission.
CREATE OR REPLACE FUNCTION public.claim_next_job(
  p_site_id UUID,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_job public.jobs;
BEGIN
  IF p_lease_seconds < 15 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'lease seconds must be between 15 and 900'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize claim admission against revocation's site-row update. A request
  -- authenticated before revocation must not claim new work after it commits.
  PERFORM 1 FROM public.sites WHERE id = p_site_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT j.*
    INTO v_job
    FROM public.jobs j
   WHERE j.site_id = p_site_id
     AND j.attempts < j.max_attempts
     AND (
       j.status = 'queued'
       OR (
         j.status IN ('claimed', 'running')
         AND j.lease_expires_at IS NOT NULL
         AND j.lease_expires_at < now()
       )
     )
   ORDER BY j.created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.jobs
     SET status           = 'claimed',
         attempts         = v_job.attempts + 1,
         claimed_at       = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at       = now()
   WHERE id = v_job.id
   RETURNING * INTO v_job;

  INSERT INTO public.job_events (job_id, seq, type, message, data)
  VALUES (
    v_job.id,
    COALESCE((SELECT max(seq) FROM public.job_events WHERE job_id = v_job.id), 0) + 1,
    'claimed',
    'Connector claimed the job',
    jsonb_build_object('attempt', v_job.attempts, 'leaseSeconds', p_lease_seconds)
  );

  RETURN NEXT v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_job(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_job(UUID, INTEGER) TO service_role;

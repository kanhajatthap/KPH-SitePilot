-- Connector runtime functions.
--
-- Everything here is executed by the platform through the service role, so the
-- functions are SECURITY INVOKER and their EXECUTE privilege is revoked from
-- `public`, `anon` and `authenticated`. RLS (including FORCE) still applies to
-- any non-bypassing caller.
--
--   * claim_next_job        — atomic, race-free job hand-out (SKIP LOCKED)
--   * touch_site_heartbeat  — last_seen_at + capability refresh in one write
--   * purge_expired_connector_state — housekeeping for nonces/codes/events

-- ---------------------------------------------------------------------------
-- Atomic job claim
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Heartbeat + capability refresh
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_site_heartbeat(
  p_site_id UUID,
  p_capabilities JSONB DEFAULT NULL,
  p_plugin_version TEXT DEFAULT NULL,
  p_wp_version TEXT DEFAULT NULL,
  p_php_version TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.sites
     SET last_seen_at     = now(),
         updated_at       = now(),
         capabilities     = COALESCE(p_capabilities, capabilities),
         plugin_version   = COALESCE(NULLIF(p_plugin_version, ''), plugin_version),
         wp_version       = COALESCE(NULLIF(p_wp_version, ''), wp_version),
         php_version      = COALESCE(NULLIF(p_php_version, ''), php_version),
         -- A site that is talking to us is online again; never resurrect a
         -- deliberately revoked or paused connection.
         status           = CASE WHEN status = 'offline' THEN 'active' ELSE status END
   WHERE id = p_site_id
     AND status IN ('active', 'offline');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_site_heartbeat(UUID, JSONB, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_site_heartbeat(UUID, JSONB, TEXT, TEXT, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------
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

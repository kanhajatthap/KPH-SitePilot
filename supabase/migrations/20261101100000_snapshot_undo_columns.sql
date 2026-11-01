-- Undo bookkeeping: a snapshot can be restored at most once, and the restore
-- itself is a job so it appears in history like any other write.

ALTER TABLE public.snapshots
  ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restore_job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS snapshots_site_restored_idx
  ON public.snapshots (site_id, restored_at);

COMMENT ON COLUMN public.snapshots.restored_at IS
  'Set when the pre-write state in this snapshot has been restored.';
COMMENT ON COLUMN public.snapshots.restore_job_id IS
  'The content.restore job that applied this snapshot.';

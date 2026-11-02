-- Auto-provision a default project for every user profile so first-time
-- accounts can generate connector pairing codes immediately without hitting
-- PROJECT_REQUIRED (E9-02 / onboarding fix).

-- 1. Backfill one default project for every existing profile that owns none.
INSERT INTO public.projects (owner_id, name, description)
SELECT p.id, 'My Sites', 'Default workspace created automatically'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects pr WHERE pr.owner_id = p.id
);

-- 2. Extend handle_new_user() so future signups receive both a profile row
--    and an initial project atomically.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();

  IF NOT EXISTS (
    SELECT 1 FROM public.projects WHERE owner_id = NEW.id
  ) THEN
    INSERT INTO public.projects (owner_id, name, description)
    VALUES (NEW.id, 'My Sites', 'Default workspace created automatically');
  END IF;

  RETURN NEW;
END;
$$;

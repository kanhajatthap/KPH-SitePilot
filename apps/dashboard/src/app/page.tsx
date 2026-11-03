import type { Metadata } from 'next';
import { LandingPage } from '../components/landing/LandingPage';
import { createSupabaseServerClient } from '../lib/supabase/server';
import WorkspaceClient from './WorkspaceClient';

/**
 * `/` is public (E9-18) but kept as a single URL for both audiences:
 *   - signed-out / no verified session → static marketing landing page
 *   - signed-in → the full agent workspace, unchanged
 *   - local mode (no Supabase config) → workspace, the pre-existing behaviour
 *
 * The decision is made on the server with Supabase's verified `getUser()`,
 * never from a client-readable cookie, so a stale cookie cannot show the
 * workspace to a stranger. Middleware still owns redirects for all other
 * private pages.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'KPH SitePilot — WordPress agent with human-approved writes',
  description:
    'Describe a WordPress change in plain language. SitePilot plans it, waits for your approval, snapshots before every write, verifies the result and keeps one-click undo.',
};

async function showWorkspace(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return true;

  try {
    const { data, error } = await supabase.auth.getUser();
    return !error && Boolean(data.user);
  } catch {
    // A transient auth failure is not a reason to gate the public page.
    return false;
  }
}

export default async function Page() {
  if (await showWorkspace()) {
    return <WorkspaceClient />;
  }
  return <LandingPage />;
}

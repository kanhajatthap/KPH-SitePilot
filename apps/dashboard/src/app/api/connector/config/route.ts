import { NextResponse } from 'next/server';
import { getSupabasePublicConfig } from '../../../../lib/supabase/config';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';
import { getEncryptionKey } from '../../../../lib/connector/crypto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/connector/config — can this deployment run the connector?
 *
 * Booleans only: never a key, a host or a partial value. It exists so the
 * connected-sites page can explain a 503 instead of leaving the user guessing,
 * and so a deployment can be verified the minute it is promoted.
 */
export async function GET() {
  const authEnabled = Boolean(getSupabasePublicConfig());
  const storage = Boolean(createSupabaseAdminClient());

  let encryption = true;
  try {
    getEncryptionKey();
  } catch {
    encryption = false;
  }

  return NextResponse.json(
    {
      authEnabled,
      storage,
      encryption,
      ready: authEnabled && storage && encryption,
      hints: [
        !authEnabled ? 'Sign-in is not configured (public Supabase URL/key missing).' : null,
        !storage ? 'Connector storage is not configured (server-side Supabase credential missing).' : null,
        !encryption ? 'Site secrets cannot be stored (SITEPILOT_ENCRYPTION_KEY missing).' : null,
      ].filter(Boolean),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

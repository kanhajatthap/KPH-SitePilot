import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../../../lib/auth/api';
import { rotateSiteCredentials } from '../../../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/connector/sites/{id}/rotate-secret` — re-issue a site's credentials.
 *
 * Used when a secret leaks, when the WordPress install is rebuilt, or when a site
 * was revoked by mistake. The new token + secret are returned **once**; the old
 * pair stops verifying immediately because the signature check looks the secret
 * up by `token_hash`. Rotation also clears `revoked`, otherwise the fresh
 * credentials would be dead on arrival.
 *
 * Deliberately not idempotent and not cached: two operators rotating at once must
 * see two different secrets, and the last write wins.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to rotate connector credentials.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { error: 'SITE_NOT_FOUND', message: 'No connected site with that id belongs to this account.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const credentials = await rotateSiteCredentials(auth.context.user.id, id);
    if (!credentials) {
      return NextResponse.json(
        { error: 'SITE_NOT_FOUND', message: 'No connected site with that id belongs to this account.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        status: 'rotated',
        siteId: id,
        credentials,
        note: 'Paste these into the KPH SitePilot connector settings now — they are not retrievable later.',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = (error as Error).message;
    const encryptionMissing = message.includes('SITEPILOT_ENCRYPTION_KEY');
    return NextResponse.json(
      {
        error: encryptionMissing ? 'CONFIG_MISSING' : 'CONNECTOR_STORAGE_UNAVAILABLE',
        message: encryptionMissing
          ? 'Site secrets cannot be re-issued because SITEPILOT_ENCRYPTION_KEY is not set.'
          : message,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

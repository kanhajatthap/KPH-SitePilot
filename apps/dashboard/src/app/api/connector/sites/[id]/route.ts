import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../../lib/auth/api';
import { revokeSiteForUser } from '../../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/connector/sites/{id} — the owner disconnects a site.
 *
 * Revoking is a soft delete: the row keeps its history, but the site can no
 * longer claim jobs or send heartbeats until it is paired again. Queued jobs
 * are cancelled so nothing is left dangling.
 */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to disconnect a site.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', message: 'Site id must be a UUID.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const result = await revokeSiteForUser(id, auth.context.user.id);

  if (result === 'not_found') {
    return NextResponse.json(
      { error: 'SITE_NOT_FOUND', message: 'That site is not connected to your account.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (result === 'unavailable') {
    return NextResponse.json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Connected sites are not available right now.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { site: { id: id, status: 'revoked' } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

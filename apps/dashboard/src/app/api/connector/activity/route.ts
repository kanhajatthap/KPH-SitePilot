import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { listOwnerActivity } from '../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set([
  'proposed',
  'approved',
  'rejected',
  'applied',
  'failed',
  'rolled_back',
  'queued',
  'claimed',
  'running',
  'succeeded',
  'expired',
  'cancelled',
]);

/**
 * Owner-scoped activity & audit timeline (E9-10).
 *
 * Aggregates recent plans, connector jobs, and reversible snapshots across all
 * WordPress sites owned by the signed-in caller, with optional `siteId`,
 * `status`, and `limit` query filters. Cross-tenant `siteId` probes return 404.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      {
        error: 'CONNECTOR_REQUIRES_ACCOUNT',
        message: 'Sign in to inspect your activity and audit timeline.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const url = new URL(request.url);
  const rawSiteId = url.searchParams.get('siteId')?.trim() || null;
  const rawStatus = url.searchParams.get('status')?.trim().toLowerCase() || null;
  const rawLimit = Number(url.searchParams.get('limit') ?? '30');

  if (rawSiteId && !UUID_RE.test(rawSiteId)) {
    return NextResponse.json(
      { error: 'INVALID_SITE_ID', message: 'siteId must be a valid UUID.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (rawStatus && !ALLOWED_STATUSES.has(rawStatus)) {
    return NextResponse.json(
      { error: 'INVALID_STATUS', message: 'Unsupported status filter.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const limit = Number.isFinite(rawLimit) ? Math.max(5, Math.min(60, Math.trunc(rawLimit))) : 30;

  try {
    const activity = await listOwnerActivity(auth.context.user.id, {
      siteId: rawSiteId,
      status: rawStatus,
      limit,
    });

    if (activity === null) {
      return NextResponse.json(
        { error: 'STORAGE_UNAVAILABLE', message: 'Supabase storage is not configured.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (activity === 'site_not_found') {
      return NextResponse.json(
        { error: 'SITE_NOT_FOUND', message: 'No such connected site.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(activity, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'ACTIVITY_LOAD_FAILED',
        message: (error as Error).message || 'Activity timeline could not be loaded.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

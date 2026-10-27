import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../../lib/auth/api';
import { authorizeTargetSite } from '../../../../../lib/auth/site-access';
import {
  API_SERVER_URL,
  readUpstreamJson,
  validateLocalTarget,
} from '../../../../../lib/api-proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const target = validateLocalTarget(searchParams.get('targetSite'));
  if (!target.ok) return target.response;
  const pageId = Number(searchParams.get('pageId'));
  if (!Number.isSafeInteger(pageId) || pageId <= 0) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', message: 'A valid pageId is required.' },
      { status: 400 }
    );
  }

  const siteAccess = await authorizeTargetSite(auth.context, target.targetSite);
  if (!siteAccess.ok) return siteAccess.response;

  try {
    const query = new URLSearchParams({ targetSite: target.targetSite, pageId: String(pageId) });
    const response = await fetch(`${API_SERVER_URL}/api/site/pages/snapshots?${query}`);
    const parsed = await readUpstreamJson(response);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'UPSTREAM_INVALID_RESPONSE', message: parsed.message },
        { status: 502 }
      );
    }
    return NextResponse.json(parsed.data, { status: response.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'NETWORK_ERROR', message: `Cannot connect to the backend API. ${(err as Error).message}` },
      { status: 504 }
    );
  }
}

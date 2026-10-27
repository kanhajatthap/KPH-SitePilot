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
  const targetSiteParam = searchParams.get('targetSite');
  if (targetSiteParam) {
    const target = validateLocalTarget(targetSiteParam);
    if (!target.ok) return target.response;

    const siteAccess = await authorizeTargetSite(auth.context, target.targetSite);
    if (!siteAccess.ok) return siteAccess.response;
  }

  const pageId = searchParams.get('id');
  if (!pageId || isNaN(Number(pageId))) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', message: 'A valid numeric page ID (id) query parameter is required.' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${API_SERVER_URL}/api/site/pages/sections?id=${encodeURIComponent(pageId)}`, {
      method: 'GET',
    });
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

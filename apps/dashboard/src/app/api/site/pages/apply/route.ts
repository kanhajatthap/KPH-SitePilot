import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../../lib/auth/api';
import { authorizeTargetSite } from '../../../../../lib/auth/site-access';
import {
  API_SERVER_URL,
  readUpstreamJson,
  validateLocalTarget,
} from '../../../../../lib/api-proxy';

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { planId, integrityHash, targetSite, approvedBy } = body;

    if (!planId || typeof planId !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "planId" is required.' },
        { status: 400 }
      );
    }

    if (!integrityHash || typeof integrityHash !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "integrityHash" is required.' },
        { status: 400 }
      );
    }

    const target = validateLocalTarget(targetSite);
    if (!target.ok) return target.response;

    const siteAccess = await authorizeTargetSite(auth.context, target.targetSite);
    if (!siteAccess.ok) return siteAccess.response;

    let response: Response;
    try {
      response = await fetch(`${API_SERVER_URL}/api/site/pages/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          integrityHash,
          targetSite: target.targetSite,
          approvedBy: typeof approvedBy === 'string' && approvedBy.trim() ? approvedBy : 'user',
        }),
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: 'NETWORK_ERROR',
          message: `Cannot connect to KPH SitePilot Backend API at ${API_SERVER_URL}. (${(err as Error).message})`,
        },
        { status: 504 }
      );
    }

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
      { error: 'INTERNAL_ERROR', message: (err as Error).message },
      { status: 500 }
    );
  }
}

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', message: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  const target = validateLocalTarget(body.targetSite);
  if (!target.ok) return target.response;

  const siteAccess = await authorizeTargetSite(auth.context, target.targetSite);
  if (!siteAccess.ok) return siteAccess.response;

  let response: Response;
  try {
    response = await fetch(`${API_SERVER_URL}/api/site/plugins/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: body.planId,
        integrityHash: body.integrityHash,
        targetSite: target.targetSite,
        approvedBy:
          typeof body.approvedBy === 'string' && body.approvedBy.trim()
            ? body.approvedBy
            : 'user',
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'NETWORK_ERROR', message: `Cannot connect to the backend API. ${(err as Error).message}` },
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
}

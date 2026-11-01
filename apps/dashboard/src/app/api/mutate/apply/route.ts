import { NextRequest, NextResponse } from 'next/server';
import { isTargetAllowed } from '../../../../lib/target';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { authorizeTargetSite } from '../../../../lib/auth/site-access';
import { callApi, describeApiTarget } from '../../../../lib/api-call';

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { planId, integrityHash, targetSite, post, approvedBy } = body;

    if (!planId || !integrityHash || !targetSite || !post) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Fields planId, integrityHash, targetSite, and post are required for approval.',
        },
        { status: 400 }
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(targetSite);
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Invalid target site format: "${targetSite}"` },
        { status: 400 }
      );
    }

    const isAllowed = isTargetAllowed(parsed.origin, {
        saasMode: auth.context.mode === 'saas',
      });
    if (!isAllowed) {
      return NextResponse.json(
        {
          error: 'TARGET_NOT_ALLOWED',
          message: `Target "${targetSite}" is not an authorized local development environment.`,
        },
        { status: 403 }
      );
    }

    const siteAccess = await authorizeTargetSite(auth.context, targetSite);
    if (!siteAccess.ok) return siteAccess.response;

    let response: Response;
    try {
      response = await callApi('/api/mutate/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          integrityHash,
          targetSite,
          post,
          approvedBy: approvedBy || 'user',
        }),
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: 'NETWORK_ERROR',
          message: `KPH SitePilot API request failed (${describeApiTarget()}): ${(err as Error).message}`,
        },
        { status: 504 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: (err as Error).message },
      { status: 500 }
    );
  }
}

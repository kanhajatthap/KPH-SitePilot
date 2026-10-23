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
    const { targetSite, title, content, slug, status, isFrontPage, builder } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "title" is required.' },
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "content" is required.' },
        { status: 400 }
      );
    }

    const target = validateLocalTarget(targetSite);
    if (!target.ok) return target.response;

    const siteAccess = await authorizeTargetSite(auth.context, target.targetSite);
    if (!siteAccess.ok) return siteAccess.response;

    let response: Response;
    try {
      response = await fetch(`${API_SERVER_URL}/api/site/pages/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: target.targetSite,
          title: title.trim(),
          content,
          slug,
          status,
          isFrontPage,
          builder,
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

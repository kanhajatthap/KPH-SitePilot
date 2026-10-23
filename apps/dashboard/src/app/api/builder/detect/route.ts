import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { authorizeTargetSite } from '../../../../lib/auth/site-access';

const API_SERVER_URL = process.env.API_SERVER_URL || 'http://127.0.0.1:3001';

const ALLOWED_TARGET_PATTERNS = [
  /^https?:\/\/[a-z0-9-_.]+\.local(:\d+)?$/i,
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
];

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { targetSite } = body;

    if (!targetSite || typeof targetSite !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "targetSite" is required.' },
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

    const isAllowed = ALLOWED_TARGET_PATTERNS.some((p) => p.test(parsed.origin));
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
      response = await fetch(`${API_SERVER_URL}/api/builder/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetSite }),
      });
    } catch {
      return NextResponse.json(
        {
          error: 'NETWORK_ERROR',
          message: 'Unable to reach backend API server at ' + API_SERVER_URL,
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

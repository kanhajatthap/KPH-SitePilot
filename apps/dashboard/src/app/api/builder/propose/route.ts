import { NextRequest, NextResponse } from 'next/server';

const API_SERVER_URL = process.env.API_SERVER_URL || 'http://127.0.0.1:3001';

const ALLOWED_TARGET_PATTERNS = [
  /^https?:\/\/[a-z0-9-_.]+\.local(:\d+)?$/i,
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetSite, builderType, pageIdOrSlug, title, prompt, section, acfData, wooProductData } = body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "prompt" is required and cannot be empty.' },
        { status: 400 }
      );
    }

    if (!targetSite || typeof targetSite !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "targetSite" is required.' },
        { status: 400 }
      );
    }

    if (!builderType || typeof builderType !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "builderType" is required.' },
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

    let response: Response;
    try {
      response = await fetch(`${API_SERVER_URL}/api/builder/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetSite,
          builderType,
          pageIdOrSlug,
          title,
          prompt: prompt.trim(),
          section,
          acfData,
          wooProductData,
        }),
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

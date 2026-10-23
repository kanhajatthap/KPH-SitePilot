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
    const targetSite = body.targetSite || body.siteUrlOrSlug;
    const postId = Number(body.postId);
    const revisionPrompt = body.revisionPrompt || body.instruction;
    const revisedTitle = body.revisedTitle || body.title;
    const revisedContent = body.revisedContent || body.content;

    if (!targetSite || !postId || !revisionPrompt) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'targetSite, postId, and revisionPrompt are required to revise a draft.',
        },
        { status: 400 }
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(targetSite);
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Invalid targetSite format: "${targetSite}"` },
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

    const response = await fetch(`${API_SERVER_URL}/api/draft/revise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetSite,
        postId,
        revisionPrompt,
        revisedTitle,
        revisedContent,
      }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: err?.message || 'Failed to revise draft',
      },
      { status: 500 }
    );
  }
}

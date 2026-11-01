import { NextRequest, NextResponse } from 'next/server';
import { isTargetAllowed } from '../../../../lib/target';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { authorizeTargetSite } from '../../../../lib/auth/site-access';
import { callApi } from '../../../../lib/api-call';

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

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

    const response = await callApi('/api/draft/revise', {
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

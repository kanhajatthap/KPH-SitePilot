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
    const { siteUrlOrSlug, postId, postTitle } = body;

    if (!siteUrlOrSlug || !postId) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Both siteUrlOrSlug and postId are required to propose publication.',
        },
        { status: 400 }
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(siteUrlOrSlug);
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Invalid siteUrlOrSlug format: "${siteUrlOrSlug}"` },
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
          message: `Target "${siteUrlOrSlug}" is not an authorized local development environment.`,
        },
        { status: 403 }
      );
    }

    const siteAccess = await authorizeTargetSite(auth.context, siteUrlOrSlug);
    if (!siteAccess.ok) return siteAccess.response;

    const response = await callApi('/api/publish/propose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetSite: siteUrlOrSlug,
        siteUrlOrSlug,
        postId: Number(postId),
        postTitle,
      }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: err?.message || 'Failed to propose publication',
      },
      { status: 500 }
    );
  }
}

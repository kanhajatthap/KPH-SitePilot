import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { callApi } from '../../../../lib/api-call';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Query parameter taskId is required.' },
        { status: 400 }
      );
    }

    const lastEventId = req.headers.get('Last-Event-ID');

    const upstreamResponse = await callApi(
      `/api/task/stream?taskId=${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
        },
      }
    );

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return NextResponse.json(
        {
          error: 'UPSTREAM_ERROR',
          message: `Failed to open task activity stream from upstream (status: ${upstreamResponse.status})`,
        },
        { status: upstreamResponse.status || 502 }
      );
    }

    return new Response(upstreamResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: err?.message || 'Failed to stream task activity',
      },
      { status: 500 }
    );
  }
}

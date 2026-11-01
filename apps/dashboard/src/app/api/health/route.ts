import { NextResponse } from 'next/server';
import { callApi } from '../../../lib/api-call';

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await callApi('/health', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        dashboard: 'ok',
        apiServer: 'connected',
        apiDetails: data,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      {
        dashboard: 'ok',
        apiServer: 'degraded',
        status: res.status,
      },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        dashboard: 'ok',
        apiServer: 'disconnected',
        error: (err as Error).message,
      },
      { status: 503 }
    );
  }
}

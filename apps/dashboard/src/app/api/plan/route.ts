import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../lib/auth/api';
import { callApi, describeApiTarget } from '../../../lib/api-call';

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();

    let response: Response;
    try {
      response = await callApi('/api/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
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

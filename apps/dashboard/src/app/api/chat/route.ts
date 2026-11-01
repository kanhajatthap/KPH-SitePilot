import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../lib/auth/api';
import { callApi, describeApiTarget } from '../../../lib/api-call';
import { enforceQuota } from '../../../lib/quota';

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  // AI messages are the most expensive thing a free user can repeat in a loop.
  const quota = await enforceQuota(auth.context, 'ai');
  if (!quota.ok) return quota.response;

  try {
    const body = await req.json();
    const { prompt, systemPrompt } = body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "prompt" is required and cannot be empty.' },
        { status: 400 }
      );
    }

    let response: Response;
    try {
      response = await callApi('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          systemPrompt,
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
    return NextResponse.json(data, { status: response.status, headers: quota.headers });
  } catch (err) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: (err as Error).message },
      { status: 500 }
    );
  }
}

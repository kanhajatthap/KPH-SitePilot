import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../lib/auth/api';

const API_SERVER_URL = process.env.API_SERVER_URL || 'http://127.0.0.1:3001';

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { prompt, systemPrompt, conversationHistory } = body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "prompt" is required and cannot be empty.' },
        { status: 400 }
      );
    }

    let response: Response;
    try {
      response = await fetch(`${API_SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          systemPrompt,
          conversationHistory,
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

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: (err as Error).message },
      { status: 500 }
    );
  }
}

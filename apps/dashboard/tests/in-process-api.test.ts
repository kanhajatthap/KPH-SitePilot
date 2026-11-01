import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as handleHealthGet } from '../src/app/api/health/route';
import { POST as handleChatPost } from '../src/app/api/chat/route';

const originalApiUrl = process.env.API_SERVER_URL;

describe('hosted mode: dashboard runs the API core in-process', () => {
  beforeEach(() => {
    // No API_SERVER_URL on Vercel: nothing may reach 127.0.0.1.
    delete process.env.API_SERVER_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiUrl === undefined) delete process.env.API_SERVER_URL;
    else process.env.API_SERVER_URL = originalApiUrl;
  });

  it('serves /api/health without any network hop', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await handleHealthGet();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.dashboard).toBe('ok');
    expect(body.apiServer).toBe('connected');
    expect(body.apiDetails.service).toBe('kph-sitepilot-api');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('proxies /api/chat to the embedded core instead of a localhost server', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await handleChatPost(
      new NextRequest('http://localhost:3002/api/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Write a tagline for a bakery' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.content).toBe('string');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

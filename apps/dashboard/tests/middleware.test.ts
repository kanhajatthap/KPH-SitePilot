import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createServerClient, getUser } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient }));

import { middleware } from '../middleware';

describe('dashboard authentication middleware', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    createServerClient.mockReturnValue({ auth: { getUser } });
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it('leaves the dashboard usable in local mode when Supabase is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const response = await middleware(new NextRequest('http://localhost:3002/'));
    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated API requests when SaaS mode is enabled', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-placeholder';
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });

    const response = await middleware(new NextRequest('http://localhost:3002/api/agent'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: 'Sign in to access this resource.',
    });
  });

  it('blocks authenticated SaaS requests from falling through to the local privileged API', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-placeholder';

    const response = await middleware(new NextRequest('http://localhost:3002/api/mutate/apply'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'EDGE_FUNCTION_REQUIRED' });
  });

  it('allows login and the public health route without an authenticated session', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-placeholder';
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });

    const login = await middleware(new NextRequest('http://localhost:3002/login'));
    const health = await middleware(new NextRequest('http://localhost:3002/api/health'));
    expect(login.status).toBe(200);
    expect(health.status).toBe(200);
  });
});

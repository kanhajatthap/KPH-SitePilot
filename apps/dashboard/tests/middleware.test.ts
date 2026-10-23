import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createServerClient, getUser } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient }));

import { middleware } from '../src/middleware';

function enableSaas() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-placeholder';
}

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

  it('redirects unauthenticated page requests to login with a safe return path', async () => {
    enableSaas();
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });

    const response = await middleware(new NextRequest('http://localhost:3002/projects?tab=active'));
    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('/login?');
    expect(location).toContain('next=%2Fprojects%3Ftab%3Dactive');
  });

  it('marks expired sessions when a Supabase cookie is present', async () => {
    enableSaas();
    getUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error('invalid refresh token'), { code: 'refresh_token_not_found' }),
    });

    const response = await middleware(
      new NextRequest('http://localhost:3002/', {
        headers: { cookie: 'sb-example-auth-token=stale' },
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('reason=session_expired');
  });

  it('rejects unauthenticated API requests with 401 JSON', async () => {
    enableSaas();
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });

    const response = await middleware(new NextRequest('http://localhost:3002/api/agent'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'UNAUTHORIZED',
      code: 'UNAUTHORIZED',
      message: 'Sign in to access this resource.',
    });
  });

  it('lets authenticated API requests reach the route-level guard', async () => {
    enableSaas();

    const response = await middleware(new NextRequest('http://localhost:3002/api/mutate/apply'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('allows all public authentication pages and the health probe', async () => {
    enableSaas();
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });

    for (const path of ['/login', '/register', '/forgot-password', '/reset-password', '/auth/confirm', '/auth/callback', '/api/health']) {
      const response = await middleware(new NextRequest(`http://localhost:3002${path}`));
      expect(response.status, path).toBe(200);
    }
  });

  it('sends signed-in users away from login/register but keeps recovery pages open', async () => {
    enableSaas();

    const login = await middleware(new NextRequest('http://localhost:3002/login?next=%2Fprojects'));
    expect(login.status).toBe(307);
    expect(login.headers.get('location')).toBe('http://localhost:3002/projects');

    const reset = await middleware(new NextRequest('http://localhost:3002/reset-password'));
    expect(reset.status).toBe(200);
  });

  it('ignores unsafe return paths when bouncing a signed-in user', async () => {
    enableSaas();

    const response = await middleware(
      new NextRequest('http://localhost:3002/login?next=https%3A%2F%2Fevil.example')
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3002/');
  });

  it('never redirects to protocol-relative paths from the next parameter', async () => {
    enableSaas();
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });

    const response = await middleware(
      new NextRequest('http://localhost:3002/login?next=%2F%2Fevil.example')
    );
    expect(response.status).toBe(200);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('../src/lib/supabase/server', () => ({ createSupabaseServerClient }));

import { authenticateApiRequest } from '../src/lib/auth/api';

function enableSaas() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-placeholder';
}

describe('authenticateApiRequest', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it('allows the single-user local workspace when Supabase is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const result = await authenticateApiRequest();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.mode).toBe('local');
      expect(result.context.user).toBeNull();
    }
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('rejects a missing session with 401', async () => {
    enableSaas();
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    const result = await authenticateApiRequest();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toMatchObject({ code: 'SESSION_EXPIRED' });
    }
  });

  it('distinguishes an expired refresh token', async () => {
    enableSaas();
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: Object.assign(new Error('Invalid Refresh Token'), { code: 'refresh_token_not_found' }),
        }),
      },
    });

    const result = await authenticateApiRequest();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toMatchObject({ code: 'SESSION_EXPIRED' });
    }
  });

  it('returns the verified identity from the session', async () => {
    enableSaas();
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'user@example.test' } },
          error: null,
        }),
      },
    });

    const result = await authenticateApiRequest();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.mode).toBe('saas');
      expect(result.context.user).toEqual({ id: 'user-1', email: 'user@example.test' });
    }
  });
});

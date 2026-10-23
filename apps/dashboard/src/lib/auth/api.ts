import { NextResponse } from 'next/server';
import { getSupabasePublicConfig } from '../supabase/config';
import { createSupabaseServerClient } from '../supabase/server';

export type AuthMode = 'local' | 'saas';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthContext {
  mode: AuthMode;
  user: AuthenticatedUser | null;
}

export type AuthResult =
  | { ok: true; context: AuthContext }
  | { ok: false; response: NextResponse };

export function isSaasMode(): boolean {
  return getSupabasePublicConfig() !== null;
}

export function unauthorizedResponse(message = 'Sign in to access this resource.'): NextResponse {
  return NextResponse.json(
    { error: 'UNAUTHORIZED', code: 'UNAUTHORIZED', message },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  );
}

export function sessionExpiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'UNAUTHORIZED',
      code: 'SESSION_EXPIRED',
      message: 'Your session has expired. Sign in again to continue.',
    },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * Verifies the caller's identity on the server for every private API request.
 *
 * - Local mode (Supabase not configured): the single-user local workspace is
 *   allowed, matching the existing local-first behaviour.
 * - SaaS mode: a valid Supabase session is mandatory. The browser cannot
 *   impersonate another user because identity always comes from the session
 *   cookie verified against the Auth server.
 */
export async function authenticateApiRequest(): Promise<AuthResult> {
  if (!isSaasMode()) {
    return { ok: true, context: { mode: 'local', user: null } };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: true, context: { mode: 'local', user: null } };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    const code = (error as { code?: string }).code;
    const name = (error as { name?: string }).name;
    const missingSession = name === 'AuthSessionMissingError';
    if (code === 'refresh_token_not_found') {
      return { ok: false, response: sessionExpiredResponse() };
    }
    if (code === 'session_not_found' || missingSession) {
      return { ok: false, response: unauthorizedResponse() };
    }
    return { ok: false, response: unauthorizedResponse('Your session is invalid. Sign in again.') };
  }

  if (!data.user) {
    return { ok: false, response: sessionExpiredResponse() };
  }

  return {
    ok: true,
    context: {
      mode: 'saas',
      user: { id: data.user.id, email: data.user.email ?? '' },
    },
  };
}

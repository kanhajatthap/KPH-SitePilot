import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';
import { safeNextPath } from '../../../lib/auth/redirect';

/**
 * PKCE callback for Supabase Auth (`?code=...`).
 *
 * The email templates in this project use the token-hash flow handled by
 * `/auth/confirm`, but this endpoint keeps compatibility with the default
 * `{{ .ConfirmationURL }}` template and OAuth-style redirects.
 */
export async function GET(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));

  if (!config) {
    return NextResponse.redirect(new URL('/login?error=supabase-not-configured', request.url));
  }

  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth-failed', request.url));
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=supabase-not-configured', request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/login?error=confirmation-invalid', request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}

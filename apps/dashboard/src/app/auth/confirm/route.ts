import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';
import { safeNextPath } from '../../../lib/auth/redirect';

const SUPPORTED_TYPES = ['signup', 'recovery', 'email', 'invite', 'magiclink'] as const;
type OtpType = (typeof SUPPORTED_TYPES)[number];

/**
 * Token-hash confirmation endpoint used by the Supabase email templates.
 *
 * Templates must link to:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/
 */
export async function GET(request: NextRequest) {
  const config = getSupabasePublicConfig();
  if (!config) {
    return NextResponse.redirect(new URL('/login?error=supabase-not-configured', request.url));
  }

  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as OtpType | null;
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  const code = request.nextUrl.searchParams.get('code');

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=supabase-not-configured', request.url));
  }

  // Compatibility with the default {{ .ConfirmationURL }} template, which
  // redirects here with a PKCE `code` instead of a token hash.
  if (code) {
    const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
    if (codeError) {
      return NextResponse.redirect(
        new URL(`/login?error=confirmation-invalid${next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`, request.url)
      );
    }
    return NextResponse.redirect(new URL(next, request.url));
  }

  if (!tokenHash || !type || !SUPPORTED_TYPES.includes(type)) {
    return NextResponse.redirect(new URL('/login?error=confirmation-invalid', request.url));
  }

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=confirmation-invalid${next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}

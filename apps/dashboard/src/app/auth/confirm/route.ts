import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getSupabasePublicConfig } from '../../../lib/supabase/config';

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export async function GET(request: NextRequest) {
  const config = getSupabasePublicConfig();
  if (!config) {
    return NextResponse.redirect(new URL('/login?message=Supabase%20is%20not%20configured', request.url));
  }

  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  if (!tokenHash || !['signup', 'recovery', 'email'].includes(type || '')) {
    return NextResponse.redirect(new URL('/login?message=Confirmation%20link%20is%20invalid', request.url));
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?message=Supabase%20is%20not%20configured', request.url));
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as 'signup' | 'recovery' | 'email',
  });
  if (error) {
    return NextResponse.redirect(new URL('/login?message=Confirmation%20link%20is%20invalid%20or%20expired', request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}

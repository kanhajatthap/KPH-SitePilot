import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabasePublicConfig } from './src/lib/supabase/config';

const PUBLIC_PATHS = ['/login', '/reset-password', '/auth/confirm'];

export async function middleware(request: NextRequest) {
  let config;
  try {
    config = getSupabasePublicConfig();
  } catch {
    return NextResponse.json(
      { error: 'SUPABASE_CONFIGURATION_ERROR', message: 'Supabase URL and anon key must both be configured.' },
      { status: 500 }
    );
  }

  if (!config) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }
  if (pathname === '/api/health') return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, {
          ...options,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
        }));
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (pathname.startsWith('/api/') && pathname !== '/api/health') {
      const unauthorized = NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Sign in to access this resource.' },
        { status: 401 }
      );
      response.cookies.getAll().forEach((cookie) => unauthorized.cookies.set(cookie));
      return unauthorized;
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (pathname.startsWith('/api/') && pathname !== '/api/health') {
    const blocked = NextResponse.json(
      {
        error: 'EDGE_FUNCTION_REQUIRED',
        message: 'SaaS operations must be routed through an authenticated Supabase Edge Function.',
      },
      { status: 503 }
    );
    response.cookies.getAll().forEach((cookie) => blocked.cookies.set(cookie));
    return blocked;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

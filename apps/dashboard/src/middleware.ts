import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabasePublicConfig } from './lib/supabase/config';
import { isApiPath, isPublicApiPath, isPublicPagePath, isSafeStaticPath } from './lib/auth/routes';
import { loginPathWithNext, safeNextPath } from './lib/auth/redirect';

type CookieToSet = { name: string; value: string; options: CookieOptions };

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'));
}

function copyCookies(source: NextResponse, target: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

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

  // Local-first mode: no authentication provider configured, keep the workspace usable.
  if (!config) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (isSafeStaticPath(pathname)) return NextResponse.next();

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
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
          })
        );
      },
    },
  });

  // Verifies the JWT against the Auth server; never trust the cookie alone.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Public authentication pages. Signed-in users skip login/register, but must
  // still be able to reach recovery and confirmation routes.
  if (isPublicPagePath(pathname)) {
    const isEntryPage = pathname === '/login' || pathname === '/register';
    if (user && isEntryPage) {
      const target = safeNextPath(request.nextUrl.searchParams.get('next'));
      return copyCookies(response, NextResponse.redirect(new URL(target, request.url)));
    }
    return response;
  }

  // Public APIs perform their own session logic (health probe, session probe).
  if (isPublicApiPath(pathname)) return response;

  if (!user) {
    if (isApiPath(pathname)) {
      const expired = Boolean(error) && hasSessionCookie(request);
      return copyCookies(
        response,
        NextResponse.json(
          {
            error: 'UNAUTHORIZED',
            code: expired ? 'SESSION_EXPIRED' : 'UNAUTHORIZED',
            message: expired
              ? 'Your session has expired. Sign in again to continue.'
              : 'Sign in to access this resource.',
          },
          { status: 401, headers: { 'Cache-Control': 'no-store' } }
        )
      );
    }

    const reason = Boolean(error) && hasSessionCookie(request) ? 'session_expired' : undefined;
    return copyCookies(
      response,
      NextResponse.redirect(new URL(loginPathWithNext(`${pathname}${search}`, reason), request.url))
    );
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

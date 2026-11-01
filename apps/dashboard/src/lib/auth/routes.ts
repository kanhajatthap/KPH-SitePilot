/**
 * Explicit route inventory for the dashboard.
 *
 * Public: authentication entry points and the health probe only.
 * Everything else is private and requires a verified Supabase session when
 * SaaS mode is enabled.
 */

export const PUBLIC_PAGE_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm',
  '/auth/callback',
] as const;

/**
 * `/api/auth/status` is a diagnostics probe: public, read-only, and free of both
 * secrets and user data. It is what makes "the email never arrived" debuggable
 * without a session.
 */
/**
 * `/api/auth/status` is a diagnostics probe: public, read-only, and free of both
 * secrets and user data. It is what makes "the email never arrived" debuggable
 * without a session.
 */
export const PUBLIC_API_PATHS = ['/api/health', '/api/auth/me', '/api/auth/status'] as const;

/**
 * Endpoints a paired WordPress site calls machine-to-machine.
 *
 * They cannot carry a browser session cookie, so the middleware must not gate
 * them — each one verifies a site HMAC signature (or, for `/pair`, a
 * single-use pairing code under a per-IP rate limit) before doing anything.
 * Everything else under `/api/connector` stays session-protected.
 */
export function isSignedConnectorPath(pathname: string): boolean {
  if (pathname === '/api/connector/pair') return true;
  if (pathname === '/api/connector/heartbeat') return true;
  if (pathname === '/api/connector/unpair') return true;
  if (pathname === '/api/connector/events') return true;
  if (pathname === '/api/connector/jobs/claim') return true;
  return /^\/api\/connector\/jobs\/[0-9a-f-]{36}\/result$/i.test(pathname);
}

/**
 * Cron endpoints are called by Vercel's scheduler, which carries no session
 * cookie. They authenticate with `CRON_SECRET` and fail closed without it, so the
 * session gate must not intercept them first.
 */
export function isCronPath(pathname: string): boolean {
  return pathname === '/api/cron' || pathname.startsWith('/api/cron/');
}

export function isPublicPagePath(pathname: string): boolean {
  return PUBLIC_PAGE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function isPrivatePath(pathname: string): boolean {
  return (
    !isPublicPagePath(pathname) &&
    !isPublicApiPath(pathname) &&
    !isSignedConnectorPath(pathname) &&
    !isCronPath(pathname)
  );
}

export function isSafeStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/manifest.webmanifest'
  );
}

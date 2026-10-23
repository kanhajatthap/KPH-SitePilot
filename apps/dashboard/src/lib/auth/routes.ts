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

export const PUBLIC_API_PATHS = ['/api/health', '/api/auth/me'] as const;

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
  return !isPublicPagePath(pathname) && !isPublicApiPath(pathname);
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

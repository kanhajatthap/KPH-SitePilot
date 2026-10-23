/**
 * Safe internal redirect handling for authentication flows.
 *
 * Only same-origin, absolute-path destinations are accepted. Protocol-relative
 * URLs (`//evil.com`), backslash tricks (`/\evil.com`), control characters and
 * auth pages (which would create redirect loops) fall back to the dashboard.
 */

export const DEFAULT_POST_AUTH_PATH = '/';

const AUTH_PAGE_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm',
  '/auth/callback',
];

const MAX_PATH_LENGTH = 2048;
const INTERNAL_ORIGIN = 'http://sitepilot.internal';

export function isAuthPagePath(pathname: string): boolean {
  return AUTH_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`)
  );
}

/**
 * Returns a safe same-origin path or the provided fallback.
 */
export function safeNextPath(value: unknown, fallback: string = DEFAULT_POST_AUTH_PATH): string {
  if (typeof value !== 'string') return fallback;

  const raw = value.trim();
  if (!raw || raw.length > MAX_PATH_LENGTH) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  // Reject backslashes (normalised to slashes by some parsers) and control chars.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, INTERNAL_ORIGIN);
  } catch {
    return fallback;
  }

  if (url.origin !== INTERNAL_ORIGIN) return fallback;
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) return fallback;

  const normalised = `${url.pathname}${url.search}${url.hash}`;
  if (isAuthPagePath(normalised)) return fallback;

  return normalised;
}

/**
 * Builds a redirect target for a protected page after a successful login.
 */
export function loginPathWithNext(nextPath: string, reason?: string): string {
  const params = new URLSearchParams();
  const safe = safeNextPath(nextPath);
  if (safe !== DEFAULT_POST_AUTH_PATH) params.set('next', safe);
  if (reason) params.set('reason', reason);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

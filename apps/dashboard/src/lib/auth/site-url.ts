/**
 * Resolves the public origin used for authentication email links.
 *
 * A confirmation or recovery email is worthless if the link inside it points at
 * `http://localhost:3002` — which is exactly what the dashboard produced when
 * `NEXT_PUBLIC_SITE_URL` was unset on a deployment. Supabase also rejects a
 * `redirectTo` that is not covered by its allow list, so the wrong origin makes
 * the mail undeliverable *and* the click dead.
 *
 * Resolution order (first match wins):
 *
 *   1. `SITEPILOT_SITE_URL` / `NEXT_PUBLIC_SITE_URL` — explicit operator intent.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — the project's stable production domain.
 *   3. `VERCEL_URL` — this deployment's own URL.
 *   4. The request origin, but only when its host is on a narrow allowlist.
 *   5. `http://localhost:3002` with a warning (local development).
 *
 * Step 4 is the only value an end user can influence, so it is restricted to
 * Vercel hosts and loopback. A spoofed `Host` header can therefore never turn a
 * password-reset link into a pointer at someone else's domain.
 */

export type SiteUrlSource = 'configured' | 'vercel-production' | 'vercel-deployment' | 'request' | 'fallback';

export interface ResolvedSiteUrl {
  /** Origin only — always `scheme://host[:port]`, never a path. */
  url: string;
  source: SiteUrlSource;
  host: string;
  secure: boolean;
  /** True when the value comes from configuration or the platform, not the caller. */
  trusted: boolean;
  warnings: string[];
}

/** Local development fallback. Never sent to users in production without a warning. */
export const FALLBACK_SITE_URL = 'http://localhost:3002';

const REQUEST_HOST_ALLOWLIST = [
  /(^|\.)vercel\.app$/,
  /^localhost$/,
  /^127\.0\.0\.1$/,
  /^\[::1\]$/,
];

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/** Minimal header reader so this module stays free of Next.js imports. */
export interface HeaderReader {
  get(name: string): string | null;
}

function firstValue(value: string | null): string {
  if (!value) return '';
  return value.split(',')[0]!.trim();
}

/**
 * Normalises a configured or platform-provided URL to an origin.
 * Returns `null` for anything that is not a plain http(s) origin.
 */
export function normaliseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedRequestHost(host: string): boolean {
  const hostname = hostnameOf(host);
  if (!hostname) return false;
  return REQUEST_HOST_ALLOWLIST.some((pattern) => pattern.test(hostname));
}

/**
 * Extracts a trustworthy origin from proxy headers.
 *
 * Returns `null` when the headers are missing, malformed, or name a host that is
 * not on the allowlist — callers then fall back to configuration instead of
 * trusting the caller.
 */
export function requestOriginFromHeaders(headers: HeaderReader | null | undefined): string | null {
  if (!headers) return null;

  const host = firstValue(headers.get('x-forwarded-host') ?? headers.get('host')).toLowerCase();
  if (!host || !isAllowedRequestHost(host)) return null;

  const proto = (firstValue(headers.get('x-forwarded-proto')) || 'https').toLowerCase();
  if (proto !== 'https' && proto !== 'http') return null;

  // Loopback only makes sense over plain HTTP; never advertise https://localhost.
  if (proto === 'https' && isAllowedRequestHost(host) && isLoopbackHost(host)) return null;

  return normaliseOrigin(`${proto}://${host}`);
}

function isLoopbackHost(host: string): boolean {
  const hostname = hostnameOf(host);
  return hostname ? LOOPBACK_HOSTNAMES.has(hostname) : false;
}

export interface ResolveSiteUrlOptions {
  env?: Record<string, string | undefined>;
  /** Origin derived from the incoming request, if one is available. */
  requestOrigin?: string | null;
  /** Defaults to `env.NODE_ENV === 'production'`. */
  production?: boolean;
}

/**
 * Resolves the origin that authentication emails should link back to.
 */
export function resolveSiteUrl(options: ResolveSiteUrlOptions = {}): ResolvedSiteUrl {
  const env = options.env ?? process.env;
  const production = options.production ?? env.NODE_ENV === 'production';
  const warnings: string[] = [];

  const candidates: Array<{ source: SiteUrlSource; value: string | null | undefined; trusted: boolean }> = [
    { source: 'configured', value: env.SITEPILOT_SITE_URL, trusted: true },
    { source: 'configured', value: env.NEXT_PUBLIC_SITE_URL, trusted: true },
    { source: 'vercel-production', value: env.VERCEL_PROJECT_PRODUCTION_URL, trusted: true },
    { source: 'vercel-deployment', value: env.VERCEL_URL, trusted: true },
    { source: 'request', value: options.requestOrigin, trusted: false },
  ];

  for (const candidate of candidates) {
    const url = normaliseOrigin(candidate.value);
    if (!url) continue;

    // Configuration wins even when it points at loopback (local development),
    // but a loopback origin in production is almost certainly a mistake.
    const loopback = isLoopbackOrigin(url);
    const secure = url.startsWith('https://');

    if (production && loopback) {
      warnings.push(
        'Auth emails will link to a loopback origin in production. Set NEXT_PUBLIC_SITE_URL to the public deployment URL.'
      );
    }
    if (production && !secure) {
      warnings.push('Auth email links are not HTTPS. Browsers and Supabase may reject them.');
    }

    return {
      url,
      source: candidate.source,
      host: new URL(url).host,
      secure,
      trusted: candidate.trusted,
      warnings,
    };
  }

  warnings.push(
    'No public site URL is configured (NEXT_PUBLIC_SITE_URL). Auth email links fall back to localhost and will not work for anyone else.'
  );

  return {
    url: FALLBACK_SITE_URL,
    source: 'fallback',
    host: new URL(FALLBACK_SITE_URL).host,
    secure: false,
    trusted: false,
    warnings,
  };
}

/** The three URLs Supabase must be allowed to redirect back to. */
export interface EmailRedirectTargets {
  confirm: string;
  callback: string;
  recovery: string;
}

export function emailRedirectTargets(origin: string): EmailRedirectTargets {
  const base = normaliseOrigin(origin) ?? FALLBACK_SITE_URL;
  return {
    confirm: `${base}/auth/confirm`,
    callback: `${base}/auth/callback`,
    recovery: `${base}/auth/confirm?next=%2Freset-password`,
  };
}

/**
 * Builds the `emailRedirectTo` value for a signup confirmation.
 *
 * The `type` parameter is deliberately left out: Supabase appends its own
 * `token_hash` + `type` query (or a PKCE `code`), and pre-filling `type` would
 * make `verifyOtp` read the wrong token type. `/auth/confirm` accepts both
 * shapes. The `next` path is sanitised by `safeNextPath` in the caller.
 */
export function confirmationRedirectUrl(origin: string, next: string): string {
  const base = normaliseOrigin(origin) ?? FALLBACK_SITE_URL;
  const target = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';

  return `${base}/auth/confirm${target}`;
}

/** Builds the `redirectTo` value for a password-recovery email. */
export function recoveryRedirectUrl(origin: string): string {
  const base = normaliseOrigin(origin) ?? FALLBACK_SITE_URL;
  return `${base}/auth/confirm?next=%2Freset-password`;
}

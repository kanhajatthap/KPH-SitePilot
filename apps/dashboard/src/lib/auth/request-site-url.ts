/**
 * Request-scoped access to the site-URL resolver.
 *
 * Split from `site-url.ts` so the pure resolver stays importable from unit tests
 * and scripts that have no Next.js request scope. `next/headers` is loaded
 * lazily and every failure degrades to configuration instead of throwing, which
 * keeps server actions usable in tests and in one-off scripts.
 */

import * as siteUrl from './site-url';

async function readHeaders(): Promise<siteUrl.HeaderReader | null> {
  try {
    const { headers } = await import('next/headers');
    const store = await headers();
    return store as unknown as siteUrl.HeaderReader;
  } catch {
    return null;
  }
}

/** Origin of the current request, or `null` when unavailable/untrusted. */
export async function requestOrigin(): Promise<string | null> {
  return siteUrl.requestOriginFromHeaders(await readHeaders());
}

/** Resolves the public origin for the current request. */
export async function resolveSiteUrlForRequest(
  env: Record<string, string | undefined> = process.env
): Promise<siteUrl.ResolvedSiteUrl> {
  return siteUrl.resolveSiteUrl({ env, requestOrigin: await requestOrigin() });
}

/** Convenience wrapper for callers that only need the origin string. */
export async function siteOrigin(env: Record<string, string | undefined> = process.env): Promise<string> {
  return (await resolveSiteUrlForRequest(env)).url;
}

export type { ResolvedSiteUrl, SiteUrlSource } from './site-url';

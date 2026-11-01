import { NextResponse } from 'next/server';
import { LOCAL_TARGET_PATTERNS, isTargetAllowed } from './target';

export const API_SERVER_URL = process.env.API_SERVER_URL || 'http://127.0.0.1:3001';

/**
 * @deprecated Local-only allowlist. Kept for backwards compatibility with
 * existing imports; new code should use `isTargetAllowed` from `lib/target`.
 */
export const ALLOWED_TARGET_PATTERNS = LOCAL_TARGET_PATTERNS;

export type TargetValidation =
  | { ok: true; targetSite: string }
  | { ok: false; response: NextResponse };

export interface ValidateTargetOptions {
  /**
   * Hosted deployments (Supabase configured) may target any paired site;
   * the caller must follow up with `authorizeTargetSite` for ownership.
   * Local mode keeps the original localhost-only restriction.
   */
  saasMode?: boolean;
}

/**
 * Validates a target site before any request is forwarded to the API server.
 * Structural checks happen here; ownership is enforced separately.
 */
export function validateLocalTarget(
  targetSite: unknown,
  { saasMode = false }: ValidateTargetOptions = {}
): TargetValidation {
  if (!targetSite || typeof targetSite !== 'string') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Field "targetSite" is required.' },
        { status: 400 }
      ),
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(targetSite);
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Invalid target site format: "${targetSite}"` },
        { status: 400 }
      ),
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'TARGET_NOT_ALLOWED', message: 'Target site URLs must not contain credentials.' },
        { status: 403 }
      ),
    };
  }

  const isAllowed = isTargetAllowed(parsed.origin, { saasMode });
  if (!isAllowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'TARGET_NOT_ALLOWED',
          message: saasMode
            ? `Target "${targetSite}" is not an authorized address.`
            : `Target "${targetSite}" is not an authorized local development environment.`,
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, targetSite };
}

export type UpstreamJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

/**
 * Reads an upstream response without assuming it is JSON. If the API server is
 * down or returns an HTML error page, the dashboard route must still respond
 * with JSON so the browser never sees "Unexpected token '<'".
 */
export async function readUpstreamJson(response: Response): Promise<UpstreamJsonResult> {
  const text = await response.text();
  if (!text.trim()) return { ok: true, data: null };

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    return {
      ok: false,
      message: `Upstream ${response.url || 'API'} returned ${contentType} instead of JSON (HTTP ${response.status}).`,
    };
  }
}

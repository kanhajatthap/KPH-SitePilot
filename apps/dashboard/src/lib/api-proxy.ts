import { NextResponse } from 'next/server';

export const API_SERVER_URL = process.env.API_SERVER_URL || 'http://127.0.0.1:3001';

export const ALLOWED_TARGET_PATTERNS = [
  /^https?:\/\/[a-z0-9-_.]+\.local(:\d+)?$/i,
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
];

export type TargetValidation =
  | { ok: true; targetSite: string }
  | { ok: false; response: NextResponse };

/**
 * Validates a target site before any request is forwarded to the local API.
 * This is the same local-only allowlist used by the existing proxy routes.
 */
export function validateLocalTarget(targetSite: unknown): TargetValidation {
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

  const isAllowed = ALLOWED_TARGET_PATTERNS.some((pattern) => pattern.test(parsed.origin));
  if (!isAllowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'TARGET_NOT_ALLOWED',
          message: `Target "${targetSite}" is not an authorized local development environment.`,
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

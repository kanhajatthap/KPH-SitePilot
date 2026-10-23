export interface VerifiedUser {
  id: string;
}

export type Authenticator = (request: Request) => Promise<VerifiedUser | null>;

export function corsHeaders(request: Request, allowedOrigin: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigin && origin === allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function jsonResponse(
  request: Request,
  allowedOrigin: string | undefined,
  body: Record<string, unknown>,
  status = 200
): Response {
  const headers = new Headers(corsHeaders(request, allowedOrigin));
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

export function parseRequestBody(
  request: Request,
  maxBytes: number
): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > maxBytes) return Promise.resolve(null);

  return request.text().then((text) => {
    if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  });
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isLocalWordPressUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username && !url.password && !url.search && !url.hash &&
      (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local'));
  } catch {
    return false;
  }
}

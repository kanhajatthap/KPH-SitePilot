import { createCoreHandler } from '@wp-agent/api-core';

export type ApiCallInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

type CoreHandler = (request: Request) => Promise<Response>;

let coreHandler: CoreHandler | null = null;

/**
 * Optional override. When set, calls go over HTTP to a separately running API
 * server (useful for debugging or a split deployment). When unset — the default
 * on Vercel — the dashboard runs the API core in-process, so nothing ever has
 * to reach `127 .0.0.1:3001` from the hosted app.
 */
export function getApiServerUrl(): string | undefined {
  const value = process.env.API_SERVER_URL?.trim();
  return value ? value.replace(/\/+$/, '') : undefined;
}

/** Human-readable description of where API calls are going. */
export function describeApiTarget(): string {
  return getApiServerUrl() ?? 'the in-process API core';
}

/**
 * Calls a KPH SitePilot core endpoint from a dashboard route handler.
 *
 * The single entry point keeps one contract for every route: same paths, same
 * JSON semantics, and no duplicated proxy code.
 */
export async function callApi(path: string, init: ApiCallInit = {}): Promise<Response> {
  const method = init.method ?? 'GET';
  const base = getApiServerUrl();

  if (base) {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    const hasContentType = Object.keys(headers).some(
      (name) => name.toLowerCase() === 'content-type'
    );
    if (init.body !== undefined && !hasContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(`${base}${path}`, {
      method,
      headers,
      body: init.body,
      signal: init.signal,
    });
  }

  coreHandler ??= createCoreHandler();
  const headers = new Headers(init.headers ?? {});
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return coreHandler(
    new Request(`http://dashboard.internal${path}`, {
      method,
      headers,
      body: init.body,
      signal: init.signal,
    })
  );
}

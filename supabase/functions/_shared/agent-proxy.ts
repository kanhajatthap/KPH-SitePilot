import {
  Authenticator,
  corsHeaders,
  isUuid,
  isLocalWordPressUrl,
  jsonResponse,
  parseRequestBody,
} from './http.ts';

export interface AgentConnection {
  id: string;
  project_id: string;
  target_site: string;
  status: 'active' | 'revoked';
}

export interface AgentProxyDependencies {
  authenticate: Authenticator;
  isProjectOwner(userId: string, projectId: string): Promise<boolean>;
  getConnection(projectId: string, connectionId: string): Promise<AgentConnection | null>;
  consumeRateLimit(userId: string): Promise<boolean>;
  allowedOrigin?: string;
}

export async function handleAgentProxy(
  request: Request,
  dependencies: AgentProxyDependencies
): Promise<Response> {
  const headers = corsHeaders(request, dependencies.allowedOrigin);
  if (request.method === 'OPTIONS') {
    if (request.headers.has('Origin') && !new Headers(headers).has('Access-Control-Allow-Origin')) {
      return new Response(null, { status: 403, headers });
    }
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'METHOD_NOT_ALLOWED' }, 405);
  }
  if (request.headers.has('Origin') && !new Headers(headers).has('Access-Control-Allow-Origin')) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'ORIGIN_NOT_ALLOWED' }, 403);
  }

  const user = await dependencies.authenticate(request);
  if (!user) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'UNAUTHORIZED' }, 401);
  }

  let body: Record<string, unknown> | null;
  try {
    body = await parseRequestBody(request, 8192);
  } catch {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'INVALID_JSON' }, 400);
  }
  if (!body) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'REQUEST_TOO_LARGE_OR_INVALID' }, 413);
  }

  const { projectId, connectionId, prompt, mode } = body;
  if (
    Object.keys(body).some((key) => !['projectId', 'connectionId', 'prompt', 'mode'].includes(key)) ||
    !isUuid(projectId) || !isUuid(connectionId) ||
    typeof prompt !== 'string' || prompt.trim().length < 1 || prompt.length > 4000 ||
    (mode !== undefined && mode !== 'read_only')
  ) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'VALIDATION_FAILED' }, 400);
  }

  if (!(await dependencies.isProjectOwner(user.id, projectId))) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'PROJECT_NOT_FOUND' }, 404);
  }

  const connection = await dependencies.getConnection(projectId, connectionId);
  if (!connection || connection.project_id !== projectId) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'CONNECTION_NOT_FOUND' }, 404);
  }
  if (connection.status !== 'active') {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'CONNECTION_REVOKED' }, 403);
  }
  if (!isLocalWordPressUrl(connection.target_site)) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'TARGET_NOT_ALLOWED' }, 403);
  }
  if (!(await dependencies.consumeRateLimit(user.id))) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'RATE_LIMITED' }, 429);
  }

  // The SaaS agent bridge is intentionally unavailable until it can consume per-connection
  // credentials without exposing them to model providers or the browser.
  return jsonResponse(
    request,
    dependencies.allowedOrigin,
    { error: 'AGENT_BRIDGE_NOT_CONFIGURED', mode: 'read_only' },
    503
  );
}

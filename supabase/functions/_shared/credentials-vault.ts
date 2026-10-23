import {
  Authenticator,
  corsHeaders,
  isLocalWordPressUrl,
  isUuid,
  jsonResponse,
  parseRequestBody,
} from './http.ts';

export interface ConnectionRecord {
  id: string;
  project_id: string;
  target_site: string;
  status: 'active' | 'revoked';
}

export interface EncryptedCredentials {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  ciphertext: string;
}

export interface VaultDependencies {
  authenticate: Authenticator;
  isProjectOwner(userId: string, projectId: string): Promise<boolean>;
  getConnection(projectId: string, connectionId: string): Promise<ConnectionRecord | null>;
  createConnection(input: {
    id: string;
    projectId: string;
    targetSite: string;
    encryptedCredentials: EncryptedCredentials;
  }): Promise<void>;
  revokeConnection(projectId: string, connectionId: string): Promise<void>;
  encryptionKey: CryptoKey;
  allowedOrigin?: string;
}

const MAX_BODY_BYTES = 8192;

function toBase64(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function encryptCredentials(
  credentials: { username: string; password: string },
  key: CryptoKey,
  projectId: string,
  connectionId: string
): Promise<EncryptedCredentials> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(`${projectId}:${connectionId}`);
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
    key,
    plaintext
  );
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function handleCredentialsVault(
  request: Request,
  dependencies: VaultDependencies
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
    body = await parseRequestBody(request, MAX_BODY_BYTES);
  } catch {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'INVALID_JSON' }, 400);
  }
  if (!body) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'REQUEST_TOO_LARGE_OR_INVALID' }, 413);
  }

  const action = body.action;
  const projectId = body.projectId;
  const connectionId = body.connectionId;
  if (!isUuid(projectId) || !(await dependencies.isProjectOwner(user.id, projectId))) {
    return jsonResponse(request, dependencies.allowedOrigin, { error: 'PROJECT_NOT_FOUND' }, 404);
  }

  if (action === 'connect') {
    const targetSite = body.targetSite;
    const username = body.username;
    const password = body.password;
    if (
      Object.keys(body).some((key) => !['action', 'projectId', 'targetSite', 'username', 'password'].includes(key)) ||
      !isLocalWordPressUrl(targetSite) ||
      typeof username !== 'string' || username.trim().length < 1 || username.length > 256 ||
      typeof password !== 'string' || password.length < 8 || password.length > 512
    ) {
      return jsonResponse(request, dependencies.allowedOrigin, { error: 'VALIDATION_FAILED' }, 400);
    }

    const id = crypto.randomUUID();
    const encryptedCredentials = await encryptCredentials(
      { username: username.trim(), password },
      dependencies.encryptionKey,
      projectId,
      id
    );
    await dependencies.createConnection({ id, projectId, targetSite, encryptedCredentials });

    return jsonResponse(request, dependencies.allowedOrigin, {
      data: { id, projectId, targetSite, environment: 'local', status: 'active' },
    }, 201);
  }

  if (
    action === 'revoke' &&
    Object.keys(body).every((key) => ['action', 'projectId', 'connectionId'].includes(key)) &&
    isUuid(connectionId)
  ) {
    const connection = await dependencies.getConnection(projectId, connectionId);
    if (!connection) {
      return jsonResponse(request, dependencies.allowedOrigin, { error: 'CONNECTION_NOT_FOUND' }, 404);
    }
    await dependencies.revokeConnection(projectId, connectionId);
    return jsonResponse(request, dependencies.allowedOrigin, {
      data: { id: connectionId, projectId, targetSite: connection.target_site, status: 'revoked' },
    });
  }

  return jsonResponse(request, dependencies.allowedOrigin, { error: 'VALIDATION_FAILED' }, 400);
}

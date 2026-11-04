import {
  CONNECTOR_HEADERS,
  verifySignedRequest,
  type ConnectorErrorCode,
} from '@wp-agent/connector-protocol';
import { decryptSecret, SecretDecryptionError } from './crypto';

/**
 * Server-side authentication for signed connector traffic.
 *
 * Order matters and is deliberate:
 *   1. the claimed site id must exist                → 401 before any crypto
 *   2. the connection must not be paused or revoked  → 403
 *   3. the stored secret is decrypted in memory only → never returned or logged
 *   4. the signature must match the raw body         → 401
 *   5. the nonce must be unseen                      → 401 (replay)
 *   6. a per-site request budget applies             → 429
 */

export interface ConnectorSiteRecord {
  id: string;
  project_id: string;
  url: string;
  name: string;
  status: 'active' | 'paused' | 'revoked' | 'offline';
  scopes: string[] | null;
  secret_encrypted: string;
}

export interface ConnectorAuthStore {
  findSiteById(siteId: string): Promise<ConnectorSiteRecord | null>;
  /** Returns false when the nonce was already used (replay). */
  recordNonce(siteId: string, nonce: string): Promise<boolean>;
}

export interface AuthenticatedSite {
  id: string;
  projectId: string;
  url: string;
  name: string;
  scopes: string[];
}

export type ConnectorAuthFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type ConnectorAuthResult =
  | { ok: true; site: AuthenticatedSite; nonce: string; timestamp: number }
  | ConnectorAuthFailure;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, code: string, message: string): ConnectorAuthFailure {
  return { ok: false, status, code, message };
}

const PROTOCOL_STATUS: Record<ConnectorErrorCode, number> = {
  missing_header: 401,
  invalid_timestamp: 401,
  invalid_nonce: 401,
  invalid_signature: 401,
  timestamp_out_of_window: 401,
  body_too_large: 413,
};

function headerValue(headers: Headers, name: string): string | null {
  return headers.get(name);
}

export interface AuthenticateConnectorInput {
  headers: Headers;
  rawBody: string;
  store: ConnectorAuthStore;
  encryptionKey: Buffer;
  nowSeconds?: number;
  /** Per-site budget guard, injected so tests stay deterministic. */
  isRateLimited?: (siteId: string) => boolean;
}

export async function authenticateConnectorRequest({
  headers,
  rawBody,
  store,
  encryptionKey,
  nowSeconds = Math.floor(Date.now() / 1000),
  isRateLimited,
}: AuthenticateConnectorInput): Promise<ConnectorAuthResult> {
  const siteId = headerValue(headers, CONNECTOR_HEADERS.site);

  if (!siteId || !UUID_PATTERN.test(siteId)) {
    return fail(401, 'UNKNOWN_SITE', 'Missing or malformed site identifier.');
  }

  const site = await store.findSiteById(siteId).catch(() => null);
  if (!site) {
    return fail(401, 'UNKNOWN_SITE', 'This site is not connected to KPH SitePilot.');
  }

  if (site.status === 'revoked') {
    return fail(403, 'SITE_REVOKED', 'This connection has been revoked. Pair the site again.');
  }
  if (site.status === 'paused') {
    return fail(403, 'SITE_PAUSED', 'This connection is paused. Resume it in SitePilot.');
  }

  let secret: string;
  try {
    secret = decryptSecret(site.secret_encrypted, encryptionKey);
  } catch (error) {
    const message =
      error instanceof SecretDecryptionError
        ? 'Stored connector secret cannot be decrypted. Re-pair this site.'
        : 'Connector encryption is misconfigured for this deployment.';
    return fail(500, 'SECRET_UNAVAILABLE', message);
  }

  const verification = verifySignedRequest({ secret, headers, body: rawBody, nowSeconds });
  if (!verification.ok) {
    return fail(
      PROTOCOL_STATUS[verification.code] ?? 401,
      verification.code.toUpperCase(),
      verification.message
    );
  }

  if (verification.siteId !== site.id) {
    return fail(401, 'SITE_MISMATCH', 'Signed site header does not match the connected site.');
  }

  const fresh = await store.recordNonce(site.id, verification.nonce).catch(() => false);
  if (!fresh) {
    return fail(401, 'REPLAY_DETECTED', 'This request was already used.');
  }

  // Only authenticated, fresh requests spend this site's budget. A denied
  // request still consumes its nonce; retry with a newly signed request.
  if (isRateLimited?.(site.id)) {
    return fail(429, 'RATE_LIMIT_EXCEEDED', 'Too many connector requests. Retry shortly.');
  }

  return {
    ok: true,
    site: {
      id: site.id,
      projectId: site.project_id,
      url: site.url,
      name: site.name,
      scopes: site.scopes ?? ['read'],
    },
    nonce: verification.nonce,
    timestamp: verification.timestamp,
  };
}

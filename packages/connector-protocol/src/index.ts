import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Signed request protocol shared by the SitePilot platform (TypeScript) and the
 * WordPress connector plugin (PHP).
 *
 * Canonical string:
 *
 *   <timestamp>.<nonce>.<sha256hex(rawBody)>
 *
 * Signature:
 *
 *   hex(HMAC-SHA256(secret, canonicalString))
 *
 * Only the raw body bytes are signed. Callers MUST sign and verify the exact
 * request body, before JSON parsing and without re-serialising it. Re-encoding
 * a parsed object (key order, unicode escaping) produces a different digest and
 * a false `invalid_signature` failure.
 */

export const CONNECTOR_PROTOCOL_VERSION = '2026-11-01';
export const CONNECTOR_TIMESTAMP_WINDOW_SECONDS = 300;
export const CONNECTOR_MAX_BODY_BYTES = 256 * 1024;
export const CONNECTOR_NONCE_PATTERN = /^[a-f0-9]{32}$/;
export const CONNECTOR_SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;

export const CONNECTOR_HEADERS = {
  site: 'x-sitepilot-site',
  timestamp: 'x-sitepilot-timestamp',
  nonce: 'x-sitepilot-nonce',
  signature: 'x-sitepilot-signature',
} as const;

export type ConnectorErrorCode =
  | 'missing_header'
  | 'invalid_timestamp'
  | 'invalid_nonce'
  | 'body_too_large'
  | 'timestamp_out_of_window'
  | 'invalid_signature';

export interface ConnectorVerifySuccess {
  ok: true;
  siteId: string;
  timestamp: number;
  nonce: string;
}

export interface ConnectorVerifyFailure {
  ok: false;
  code: ConnectorErrorCode;
  message: string;
}

export type ConnectorVerifyResult = ConnectorVerifySuccess | ConnectorVerifyFailure;

export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | { get(name: string): string | null };

function assertSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new TypeError('Connector secret must be a string of at least 16 characters.');
  }
}

function toBuffer(body: string | Uint8Array): Buffer {
  return typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
}

export function bodyByteLength(body: string | Uint8Array): number {
  return toBuffer(body).byteLength;
}

export function sha256Hex(body: string | Uint8Array): string {
  return createHash('sha256').update(toBuffer(body)).digest('hex');
}

export function buildCanonicalString(
  timestamp: string | number,
  nonce: string,
  body: string | Uint8Array
): string {
  return `${timestamp}.${nonce}.${sha256Hex(body)}`;
}

export interface SignRequestInput {
  secret: string;
  timestamp: string | number;
  nonce: string;
  body: string | Uint8Array;
}

export function signRequest({ secret, timestamp, nonce, body }: SignRequestInput): string {
  assertSecret(secret);
  return createHmac('sha256', secret)
    .update(buildCanonicalString(timestamp, nonce, body), 'utf8')
    .digest('hex');
}

export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

export interface BuildSignedHeadersInput {
  siteId: string;
  secret: string;
  body: string | Uint8Array;
  nonce?: string;
  nowSeconds?: number;
}

/**
 * Builds the four signed headers for an outbound connector request.
 * `nonce` and `nowSeconds` are injectable so tests and fixtures are stable.
 */
export function buildSignedHeaders({
  siteId,
  secret,
  body,
  nonce = generateNonce(),
  nowSeconds = Math.floor(Date.now() / 1000),
}: BuildSignedHeadersInput): Record<string, string> {
  if (!siteId) throw new TypeError('siteId is required.');
  if (!CONNECTOR_NONCE_PATTERN.test(nonce)) {
    throw new TypeError('nonce must be 32 lowercase hex characters.');
  }
  const timestamp = String(nowSeconds);
  return {
    [CONNECTOR_HEADERS.site]: siteId,
    [CONNECTOR_HEADERS.timestamp]: timestamp,
    [CONNECTOR_HEADERS.nonce]: nonce,
    [CONNECTOR_HEADERS.signature]: signRequest({ secret, timestamp, nonce, body }),
  };
}

function readHeader(headers: HeaderSource, name: string): string | null {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get(name: string): string | null }).get(name);
    return value ?? null;
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const direct = record[name];
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct) && typeof direct[0] === 'string') return direct[0];

  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() !== lower) continue;
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return null;
}

export interface VerifySignedRequestInput {
  secret: string;
  headers: HeaderSource;
  body: string | Uint8Array;
  nowSeconds?: number;
  windowSeconds?: number;
  maxBodyBytes?: number;
}

export function verifySignedRequest({
  secret,
  headers,
  body,
  nowSeconds = Math.floor(Date.now() / 1000),
  windowSeconds = CONNECTOR_TIMESTAMP_WINDOW_SECONDS,
  maxBodyBytes = CONNECTOR_MAX_BODY_BYTES,
}: VerifySignedRequestInput): ConnectorVerifyResult {
  assertSecret(secret);

  const siteId = readHeader(headers, CONNECTOR_HEADERS.site);
  const timestampHeader = readHeader(headers, CONNECTOR_HEADERS.timestamp);
  const nonce = readHeader(headers, CONNECTOR_HEADERS.nonce);
  const signature = readHeader(headers, CONNECTOR_HEADERS.signature);

  if (!siteId || !timestampHeader || !nonce || !signature) {
    return { ok: false, code: 'missing_header', message: 'Missing one or more signed connector headers.' };
  }

  if (!/^\d{1,12}$/.test(timestampHeader)) {
    return { ok: false, code: 'invalid_timestamp', message: 'Timestamp header must be unix seconds.' };
  }

  if (!CONNECTOR_NONCE_PATTERN.test(nonce)) {
    return { ok: false, code: 'invalid_nonce', message: 'Nonce must be 32 lowercase hex characters.' };
  }

  if (!CONNECTOR_SIGNATURE_PATTERN.test(signature)) {
    return { ok: false, code: 'invalid_signature', message: 'Signature must be 64 lowercase hex characters.' };
  }

  if (bodyByteLength(body) > maxBodyBytes) {
    return { ok: false, code: 'body_too_large', message: `Request body exceeds ${maxBodyBytes} bytes.` };
  }

  const timestamp = Number(timestampHeader);
  if (Math.abs(nowSeconds - timestamp) > windowSeconds) {
    return {
      ok: false,
      code: 'timestamp_out_of_window',
      message: `Timestamp is outside the ±${windowSeconds}s window.`,
    };
  }

  const expected = signRequest({ secret, timestamp: timestampHeader, nonce, body });
  const expectedBytes = Buffer.from(expected, 'hex');
  const actualBytes = Buffer.from(signature, 'hex');

  if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) {
    return { ok: false, code: 'invalid_signature', message: 'Signature does not match the request body.' };
  }

  return { ok: true, siteId, timestamp, nonce };
}

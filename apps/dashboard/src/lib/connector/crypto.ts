import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

/**
 * Pairing-code and secret handling for the WordPress connector.
 *
 * Rules enforced here:
 *   - pairing codes are short-lived, single-use and stored only as SHA-256;
 *   - site secrets are 32 random bytes, shown exactly once, and stored
 *     encrypted with AES-256-GCM under `SITEPILOT_ENCRYPTION_KEY`;
 *   - nothing in this module ever logs or returns a stored secret.
 */

/** Crockford-style alphabet: no I, L, O, 0 or 1, so codes survive dictation. */
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_LENGTH = 8;

/** Characters excluded from the alphabet, folded to their nearest allowed key. */
const PAIRING_CODE_FOLDS: Record<string, string> = {
  I: 'J',
  L: 'J',
  '1': 'J',
  O: 'Q',
  '0': 'Q',
};

export class ConnectorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorConfigError';
  }
}

export class SecretDecryptionError extends Error {
  constructor(message = 'Stored connector secret could not be decrypted.') {
    super(message);
    this.name = 'SecretDecryptionError';
  }
}

function pickIndexes(length: number): number[] {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => byte % PAIRING_CODE_ALPHABET.length);
}

/** Generates a pairing code without the display separator (8 characters). */
export function generatePairingCode(): string {
  return pickIndexes(PAIRING_CODE_LENGTH)
    .map((index) => PAIRING_CODE_ALPHABET[index])
    .join('');
}

/** Groups a code as `ABCD-EFGH` for display. */
export function formatPairingCode(code: string): string {
  const clean = normalizePairingCode(code);
  return clean.length === PAIRING_CODE_LENGTH
    ? `${clean.slice(0, 4)}-${clean.slice(4)}`
    : clean;
}

/**
 * Uppercases and strips separators. Also folds the characters the alphabet
 * deliberately omits, so a user who types `O` or `0` is not locked out.
 */
export function normalizePairingCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return [...clean].map((char) => PAIRING_CODE_FOLDS[char] ?? char).join('');
}

/** True when a normalized code has the expected shape. */
export function isValidPairingCodeShape(code: string): boolean {
  if (code.length !== PAIRING_CODE_LENGTH) return false;
  return [...code].every((char) => PAIRING_CODE_ALPHABET.includes(char));
}

/** SHA-256 hex digest, used for pairing codes and site tokens at rest. */
export function hashToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 32 random bytes as hex — the per-site HMAC secret. */
export function generateSiteSecret(): string {
  return randomBytes(32).toString('hex');
}

/** 32 random bytes as hex — the per-site bearer token. */
export function generateSiteToken(): string {
  return randomBytes(32).toString('hex');
}

/** New UUIDv4 for a site row (generated here so the insert can be atomic). */
export function generateSiteId(): string {
  return randomUUID();
}

function decodeKey(raw: string): Buffer {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }

  const base64 = Buffer.from(value, 'base64');
  if (base64.length === 32) {
    return base64;
  }

  throw new ConnectorConfigError(
    'SITEPILOT_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters or base64.'
  );
}

/**
 * Loads the encryption key from the environment. The key is deployment
 * configuration; it is never derived from user input and never logged.
 */
export function getEncryptionKey(
  env: Record<string, string | undefined> = process.env
): Buffer {
  const raw = env.SITEPILOT_ENCRYPTION_KEY;
  if (!raw) {
    throw new ConnectorConfigError(
      'SITEPILOT_ENCRYPTION_KEY is not set, so connector secrets cannot be stored safely.'
    );
  }
  return decodeKey(raw);
}

/**
 * Encrypts a site secret. Format: `v1.<iv>.<tag>.<ciphertext>` with base64url
 * segments, so the wire/storage format stays self-describing and versionable.
 */
export function encryptSecret(secret: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new ConnectorConfigError('Encryption key must be 32 bytes.');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** Decrypts a stored secret, failing closed on tampering or a wrong key. */
export function decryptSecret(payload: string, key: Buffer): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new SecretDecryptionError('Unsupported connector secret format.');
  }
  if (key.length !== 32) {
    throw new ConnectorConfigError('Encryption key must be 32 bytes.');
  }

  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretDecryptionError();
  }
}

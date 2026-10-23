import * as crypto from 'node:crypto';
import { AgentError, ErrorCode, EncryptedCredentialsPayload } from '@wp-agent/contracts';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit recommended for GCM
const KEY_LENGTH_BYTES = 32; // 256-bit

/**
 * Derives a standardized 32-byte key from a secret string or returns a 32-byte buffer.
 */
export function deriveKey(masterSecret: string): Buffer {
  if (!masterSecret || masterSecret.trim().length === 0) {
    throw new AgentError(
      ErrorCode.CONFIGURATION_ERROR,
      'Vault master key is empty or not configured'
    );
  }

  // If already a 64-char hex string, parse directly
  if (/^[0-9a-f]{64}$/i.test(masterSecret.trim())) {
    return Buffer.from(masterSecret.trim(), 'hex');
  }

  // Otherwise derive using SHA-256 HKDF/hash
  return crypto.createHash('sha256').update(masterSecret).digest();
}

/**
 * Encrypts arbitrary text (e.g. WP Application Password) using AES-256-GCM.
 */
export function encryptSecret(
  plaintext: string,
  masterKey: Buffer | string
): EncryptedCredentialsPayload {
  const key = typeof masterKey === 'string' ? deriveKey(masterKey) : masterKey;
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new AgentError(
      ErrorCode.CONFIGURATION_ERROR,
      `Invalid key length: expected ${KEY_LENGTH_BYTES} bytes, got ${key.length}`
    );
  }

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    tag: tag.toString('hex'),
    algorithm: 'aes-256-gcm',
  };
}

/**
 * Decrypts an AES-256-GCM payload and returns the original plaintext.
 * Throws AgentError with UNAUTHORIZED if the ciphertext or authentication tag was tampered with.
 */
export function decryptSecret(
  payload: EncryptedCredentialsPayload,
  masterKey: Buffer | string
): string {
  const key = typeof masterKey === 'string' ? deriveKey(masterKey) : masterKey;

  try {
    const iv = Buffer.from(payload.iv, 'hex');
    const ciphertext = Buffer.from(payload.ciphertext, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    throw new AgentError(
      ErrorCode.UNAUTHORIZED,
      'Failed to decrypt credentials: authentication tag mismatch or payload corrupted',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

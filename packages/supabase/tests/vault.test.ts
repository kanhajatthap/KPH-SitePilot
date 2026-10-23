import { describe, it, expect } from 'vitest';
import { deriveKey, encryptSecret, decryptSecret } from '../src/vault.js';
import { AgentError, ErrorCode } from '@wp-agent/contracts';

describe('Credentials Vault (AES-256-GCM)', () => {
  const masterKey = 'test-secret-vault-master-key-32-bytes-long!';

  it('encrypts and successfully decrypts a WordPress application password', () => {
    const originalSecret = 'abcd-1234-efgh-5678';
    const encrypted = encryptSecret(originalSecret, masterKey);

    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.iv).toHaveLength(24); // 12 bytes in hex = 24 chars
    expect(encrypted.tag).toHaveLength(32); // 16 bytes in hex = 32 chars
    expect(encrypted.ciphertext).not.toBe(originalSecret);

    const decrypted = decryptSecret(encrypted, masterKey);
    expect(decrypted).toBe(originalSecret);
  });

  it('rejects tampered ciphertext with UNAUTHORIZED', () => {
    const encrypted = encryptSecret('secret-token', masterKey);

    // Tamper with ciphertext
    const tamperedCiphertext =
      encrypted.ciphertext.slice(0, -2) +
      (encrypted.ciphertext.endsWith('00') ? 'ff' : '00');

    expect(() =>
      decryptSecret({ ...encrypted, ciphertext: tamperedCiphertext }, masterKey)
    ).toThrowError(AgentError);

    try {
      decryptSecret({ ...encrypted, ciphertext: tamperedCiphertext }, masterKey);
    } catch (e) {
      expect((e as AgentError).code).toBe(ErrorCode.UNAUTHORIZED);
    }
  });

  it('rejects tampered auth tag with UNAUTHORIZED', () => {
    const encrypted = encryptSecret('secret-token', masterKey);

    const tamperedTag =
      '00' + encrypted.tag.slice(2);

    expect(() =>
      decryptSecret({ ...encrypted, tag: tamperedTag }, masterKey)
    ).toThrowError(AgentError);
  });

  it('fails decryption when using a different master key', () => {
    const encrypted = encryptSecret('secret-token', masterKey);
    const wrongKey = 'different-key-wrong-passphrase-9999!';

    expect(() => decryptSecret(encrypted, wrongKey)).toThrowError(AgentError);
  });

  it('handles 64-char hex master keys directly', () => {
    const hexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const original = 'my-app-password';
    const encrypted = encryptSecret(original, hexKey);
    const decrypted = decryptSecret(encrypted, hexKey);
    expect(decrypted).toBe(original);
  });

  it('throws CONFIGURATION_ERROR on empty master key', () => {
    expect(() => deriveKey('')).toThrowError(AgentError);
    try {
      deriveKey('');
    } catch (e) {
      expect((e as AgentError).code).toBe(ErrorCode.CONFIGURATION_ERROR);
    }
  });
});

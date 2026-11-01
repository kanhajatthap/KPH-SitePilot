import { describe, it, expect, beforeEach } from 'vitest';
import {
  PAIRING_CODE_ALPHABET,
  decryptSecret,
  encryptSecret,
  formatPairingCode,
  generatePairingCode,
  getEncryptionKey,
  hashToken,
  isValidPairingCodeShape,
  normalizePairingCode,
  SecretDecryptionError,
} from '../src/lib/connector/crypto';
import {
  FULL_SCOPES,
  pairSite,
  type NewSiteRow,
  type PairingCodeRow,
  type PairingStore,
} from '../src/lib/connector/pairing';
import {
  checkPairingRateLimit,
  resetPairingRateLimit,
} from '../src/lib/connector/rate-limit';

const KEY = Buffer.alloc(32, 7);
const NOW = new Date('2026-11-01T08:00:00.000Z');

class FakeStore implements PairingStore {
  codes: PairingCodeRow[] = [];
  sites: NewSiteRow[] = [];
  used: Array<{ codeId: string; siteId: string }> = [];
  failCreate: Error | null = null;

  async findPairingCode(codeHash: string): Promise<PairingCodeRow | null> {
    return this.codes.find((row) => (row as PairingCodeRow & { code_hash?: string }).code_hash === codeHash) ?? null;
  }

  async createSite(row: NewSiteRow) {
    if (this.failCreate) throw this.failCreate;
    this.sites.push(row);
    return { id: row.id };
  }

  async markPairingCodeUsed(codeId: string, siteId: string) {
    this.used.push({ codeId, siteId });
  }
}

function makeStore(options: { code?: string; expiresAt?: string; usedAt?: string | null } = {}) {
  const store = new FakeStore();
  const code = options.code ?? 'ABCDEFGH';
  store.codes.push({
    id: 'code-1',
    project_id: 'project-1',
    expires_at: options.expiresAt ?? new Date(NOW.getTime() + 60_000).toISOString(),
    used_at: options.usedAt ?? null,
    used_by_site: null,
    // extra column used by findPairingCode in this fake
    ...{ code_hash: hashToken(code) },
  } as PairingCodeRow);
  return store;
}

describe('pairing codes and secrets', () => {
  it('generates codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generatePairingCode();
      expect(code).toHaveLength(8);
      expect(isValidPairingCodeShape(code)).toBe(true);
      for (const char of code) expect(PAIRING_CODE_ALPHABET).toContain(char);
    }
  });

  it('normalizes typed codes, folding characters excluded from the alphabet', () => {
    expect(normalizePairingCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizePairingCode(' O0I1L ')).toBe('QQJJJ');
    expect(formatPairingCode('abcdefgh')).toBe('ABCD-EFGH');
  });

  it('rejects malformed codes', () => {
    expect(isValidPairingCodeShape('ABC')).toBe(false);
    expect(isValidPairingCodeShape('ABCDEFG!')).toBe(false);
  });

  it('hashes deterministically and irreversibly', () => {
    expect(hashToken('ABCDEFGH')).toBe(hashToken('ABCDEFGH'));
    expect(hashToken('ABCDEFGH')).toHaveLength(64);
    expect(hashToken('ABCDEFGH')).not.toContain('ABCDEFGH');
  });
});

describe('secret encryption at rest', () => {
  it('round-trips a site secret', () => {
    const payload = encryptSecret('deadbeef', KEY);
    expect(payload.startsWith('v1.')).toBe(true);
    expect(payload).not.toContain('deadbeef');
    expect(decryptSecret(payload, KEY)).toBe('deadbeef');
  });

  it('uses a fresh IV per encryption', () => {
    expect(encryptSecret('same', KEY)).not.toBe(encryptSecret('same', KEY));
  });

  it('fails closed when the ciphertext is tampered with', () => {
    const payload = encryptSecret('deadbeef', KEY);
    const parts = payload.split('.');
    const corrupted = [parts[0], parts[1], parts[2], Buffer.from('tampered').toString('base64url')].join('.');
    expect(() => decryptSecret(corrupted, KEY)).toThrow(SecretDecryptionError);
  });

  it('fails closed when the key is wrong', () => {
    const payload = encryptSecret('deadbeef', KEY);
    expect(() => decryptSecret(payload, Buffer.alloc(32, 9))).toThrow(SecretDecryptionError);
  });

  it('reads the key from hex or base64 and rejects anything else', () => {
    const hex = KEY.toString('hex');
    expect(getEncryptionKey({ SITEPILOT_ENCRYPTION_KEY: hex }).equals(KEY)).toBe(true);
    expect(
      getEncryptionKey({ SITEPILOT_ENCRYPTION_KEY: KEY.toString('base64') }).equals(KEY)
    ).toBe(true);
    expect(() => getEncryptionKey({})).toThrow(/SITEPILOT_ENCRYPTION_KEY/);
    expect(() => getEncryptionKey({ SITEPILOT_ENCRYPTION_KEY: 'short' })).toThrow();
  });
});

describe('pairSite', () => {
  let store: FakeStore;

  beforeEach(() => {
    store = makeStore();
  });

  const baseInput = {
    code: 'ABCD-EFGH',
    siteUrl: 'https://shop.example.com/wp-admin',
    siteName: 'Shop',
    pluginVersion: '0.2.0',
    wpVersion: '6.7',
    phpVersion: '8.2',
  };

  it('pairs a site with full scopes and stores only derived material', async () => {
    const result = await pairSite(baseInput, { store, encryptionKey: KEY, now: () => NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { credentials } = result;
    expect(credentials.scopes).toEqual([...FULL_SCOPES]);
    expect(credentials.siteUrl).toBe('https://shop.example.com');
    expect(credentials.token).toMatch(/^[0-9a-f]{64}$/);
    expect(credentials.secret).toMatch(/^[0-9a-f]{64}$/);

    expect(store.sites).toHaveLength(1);
    const saved = store.sites[0];
    expect(saved.token_hash).toBe(hashToken(credentials.token));
    expect(saved.token_hash).not.toContain(credentials.token);
    expect(saved.secret_encrypted).not.toContain(credentials.secret);
    expect(decryptSecret(saved.secret_encrypted, KEY)).toBe(credentials.secret);
    expect(saved.scopes).toEqual([...FULL_SCOPES]);
    expect(saved.status).toBe('active');
    expect(store.used).toEqual([{ codeId: 'code-1', siteId: credentials.siteId }]);
  });

  it('rejects a code that was already used', async () => {
    store = makeStore({ usedAt: NOW.toISOString() });
    const result = await pairSite(baseInput, { store, encryptionKey: KEY, now: () => NOW });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PAIRING_CODE_USED');
    expect(result.status).toBe(409);
  });

  it('rejects an expired code', async () => {
    store = makeStore({ expiresAt: new Date(NOW.getTime() - 1000).toISOString() });
    const result = await pairSite(baseInput, { store, encryptionKey: KEY, now: () => NOW });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PAIRING_CODE_EXPIRED');
    expect(result.status).toBe(410);
  });

  it('rejects an unknown code without revealing whether it ever existed', async () => {
    const result = await pairSite(
      { ...baseInput, code: 'ZZZZZZZZ' },
      { store, encryptionKey: KEY, now: () => NOW }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PAIRING_CODE_INVALID');
    expect(result.status).toBe(404);
  });

  it('rejects malformed codes before touching storage', async () => {
    const result = await pairSite(
      { ...baseInput, code: 'nope' },
      { store, encryptionKey: KEY, now: () => NOW }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
    expect(result.status).toBe(400);
  });

  it('rejects unsafe site URLs', async () => {
    for (const siteUrl of ['ftp://example.com', 'https://user:pass@example.com', 'not a url']) {
      const result = await pairSite(
        { ...baseInput, siteUrl },
        { store, encryptionKey: KEY, now: () => NOW }
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(result.status).toBe(400);
    }
  });

  it('refuses to pair a code from another project', async () => {
    const result = await pairSite(
      { ...baseInput, projectId: 'another-project' },
      { store, encryptionKey: KEY, now: () => NOW }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PROJECT_MISMATCH');
    expect(result.status).toBe(403);
  });

  it('reports an already-connected site as a conflict', async () => {
    store.failCreate = new Error('duplicate key value violates unique constraint "sites_project_id_url_key"');
    const result = await pairSite(baseInput, { store, encryptionKey: KEY, now: () => NOW });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SITE_ALREADY_CONNECTED');
    expect(result.status).toBe(409);
  });
});

describe('pairing rate limiting', () => {
  beforeEach(() => {
    resetPairingRateLimit();
  });

  it('allows ten attempts per window and then blocks', () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i += 1) {
      expect(checkPairingRateLimit('1.2.3.4', now).ok).toBe(true);
    }

    const blocked = checkPairingRateLimit('1.2.3.4', now);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    // A different client is unaffected.
    expect(checkPairingRateLimit('5.6.7.8', now).ok).toBe(true);
  });
});

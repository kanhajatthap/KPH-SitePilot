import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isByokProvider,
  listUserKeys,
  saveUserKey,
  testUserKey,
  validateRawApiKey,
  type ByokProvider,
  type StoredUserKeySummary,
  type UserKeyStore,
} from '../src/lib/connector/keys';
import { decryptSecret } from '../src/lib/connector/crypto';

const { authenticateApiRequest, mockStoreRef } = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  mockStoreRef: { current: null as UserKeyStore | null },
}));

vi.mock('../src/lib/auth/api', () => ({ authenticateApiRequest }));
vi.mock('../src/lib/connector/store', () => ({
  createSupabaseUserKeyStore: () => mockStoreRef.current,
}));

import { DELETE, GET, POST } from '../src/app/api/connector/keys/route';

const ENCRYPTION_KEY = Buffer.alloc(32, 0x42);
const TEST_MASTER_KEY_B64 = ENCRYPTION_KEY.toString('base64');
const USER = { id: '6a1c0f5e-1111-4a2b-9c3d-000000000001', email: 'owner@example.test' };

interface InternalRow extends StoredUserKeySummary {
  owner_id: string;
  key_encrypted: string;
}

class InMemoryUserKeyStore implements UserKeyStore {
  rows: InternalRow[] = [];

  async listKeys(ownerId: string): Promise<StoredUserKeySummary[]> {
    return this.rows
      .filter((row) => row.owner_id === ownerId)
      .map(({ provider, last4, status, updated_at }) => ({
        provider,
        last4,
        status,
        updated_at,
      }));
  }

  async getEncryptedKey(
    ownerId: string,
    provider: ByokProvider
  ): Promise<{ key_encrypted: string; status: string } | null> {
    const found = this.rows.find((row) => row.owner_id === ownerId && row.provider === provider);
    return found ? { key_encrypted: found.key_encrypted, status: found.status } : null;
  }

  async upsertKey(input: {
    ownerId: string;
    provider: ByokProvider;
    keyEncrypted: string;
    last4: string;
  }): Promise<StoredUserKeySummary> {
    const existing = this.rows.find(
      (row) => row.owner_id === input.ownerId && row.provider === input.provider
    );
    if (existing) {
      existing.key_encrypted = input.keyEncrypted;
      existing.last4 = input.last4;
      existing.status = 'active';
      existing.updated_at = '2026-11-02T01:00:00.000Z';
      return {
        provider: existing.provider,
        last4: existing.last4,
        status: existing.status,
        updated_at: existing.updated_at,
      };
    }
    const created: InternalRow = {
      owner_id: input.ownerId,
      provider: input.provider,
      key_encrypted: input.keyEncrypted,
      last4: input.last4,
      status: 'active',
      updated_at: '2026-11-02T00:00:00.000Z',
    };
    this.rows.push(created);
    return {
      provider: created.provider,
      last4: created.last4,
      status: created.status,
      updated_at: created.updated_at,
    };
  }

  async deleteKey(ownerId: string, provider: ByokProvider): Promise<boolean> {
    const index = this.rows.findIndex(
      (candidate) => candidate.owner_id === ownerId && candidate.provider === provider
    );
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

describe('BYOK user key service (E3-11)', () => {
  let store: InMemoryUserKeyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SITEPILOT_ENCRYPTION_KEY = TEST_MASTER_KEY_B64;
    store = new InMemoryUserKeyStore();
    mockStoreRef.current = store;
    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: USER } });
  });

  it('validates provider names and key format', () => {
    expect(isByokProvider('openai')).toBe(false);
    expect(isByokProvider('gemini')).toBe(true);
    expect(validateRawApiKey('short').ok).toBe(false);
    expect(validateRawApiKey('has whitespace inside key').ok).toBe(false);

    const valid = validateRawApiKey('  AIzaSyTestKey1234567890abcd  ');
    expect(valid).toEqual({
      ok: true,
      key: 'AIzaSyTestKey1234567890abcd',
      last4: 'abcd',
    });
  });

  it('encrypts with AES-256-GCM at rest and never exposes plaintext in masked views', async () => {
    const rawSecret = 'gsk_live_super_secret_token_9876';
    const saved = await saveUserKey(
      { ownerId: USER.id, provider: 'groq', apiKey: rawSecret, testFirst: false },
      { store, encryptionKey: ENCRYPTION_KEY }
    );

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    expect(saved.key).toEqual({
      provider: 'groq',
      last4: '9876',
      status: 'active',
      updatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(JSON.stringify(saved)).not.toContain(rawSecret);

    // Stored row is encrypted; decrypting with ENCRYPTION_KEY recovers the exact plaintext.
    expect(store.rows[0].key_encrypted).not.toContain(rawSecret);
    expect(decryptSecret(store.rows[0].key_encrypted, ENCRYPTION_KEY)).toBe(rawSecret);

    const listed = await listUserKeys(USER.id, store);
    expect(JSON.stringify(listed)).not.toContain(rawSecret);
    expect(JSON.stringify(listed)).not.toContain(store.rows[0].key_encrypted);
    const groqView = listed.find((item) => item.provider === 'groq');
    expect(groqView?.configured).toBe(true);
    expect(groqView?.last4).toBe('9876');
    expect(groqView?.keyConsoleUrl).toBe('https://console.groq.com/keys');
    expect(groqView?.setupSteps.length).toBeGreaterThanOrEqual(3);

    const geminiView = listed.find((item) => item.provider === 'gemini');
    expect(geminiView?.keyConsoleUrl).toBe('https://aistudio.google.com/apikey');
    expect(geminiView?.setupSteps.length).toBeGreaterThanOrEqual(3);

    const openrouterView = listed.find((item) => item.provider === 'openrouter');
    expect(openrouterView?.keyConsoleUrl).toBe('https://openrouter.ai/keys');
    expect(openrouterView?.setupSteps.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects saving when live provider probe fails', async () => {
    const probeFail = vi.fn(async () => ({ ok: false as const, reason: 'HTTP 401 unauthorized' }));
    const saved = await saveUserKey(
      {
        ownerId: USER.id,
        provider: 'openrouter',
        apiKey: 'sk-or-v1-invalid-test-key-0000',
        testFirst: true,
      },
      { store, encryptionKey: ENCRYPTION_KEY, probeFn: probeFail }
    );

    expect(saved.ok).toBe(false);
    if (!saved.ok) {
      expect(saved.code).toBe('KEY_VERIFICATION_FAILED');
      expect(saved.status).toBe(422);
    }
    expect(store.rows).toHaveLength(0);
  });

  it('verifies a stored encrypted key via testUserKey without returning secrets', async () => {
    await saveUserKey(
      {
        ownerId: USER.id,
        provider: 'gemini',
        apiKey: 'AIzaSyStoredKeyTest123456',
        testFirst: false,
      },
      { store, encryptionKey: ENCRYPTION_KEY }
    );

    const probeOk = vi.fn(async () => ({
      ok: true as const,
      text: '{"ok":true}',
      provider: 'gemini' as const,
      model: 'gemini-2.0-flash',
    }));

    const tested = await testUserKey(
      { ownerId: USER.id, provider: 'gemini' },
      { store, encryptionKey: ENCRYPTION_KEY, probeFn: probeOk }
    );
    expect(tested).toEqual({ ok: true, provider: 'gemini', model: 'gemini-2.0-flash' });
    expect(probeOk).toHaveBeenCalledWith({
      provider: 'gemini',
      apiKey: 'AIzaSyStoredKeyTest123456',
    });
  });
});

describe('/api/connector/keys route (E3-11)', () => {
  let store: InMemoryUserKeyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SITEPILOT_ENCRYPTION_KEY = TEST_MASTER_KEY_B64;
    store = new InMemoryUserKeyStore();
    mockStoreRef.current = store;
    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: USER } });
  });

  it('supports GET, POST, and DELETE without ever returning plaintext secrets', async () => {
    const rawKey = 'sk-or-v1-route-secret-value-4321';

    const postRes = await POST(
      new Request('https://x/api/connector/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'openrouter', apiKey: rawKey, testFirst: false }),
      })
    );
    const postBody = await postRes.json();
    expect(postRes.status).toBe(201);
    expect(postRes.headers.get('Cache-Control')).toBe('no-store');
    expect(postBody.key.last4).toBe('4321');
    expect(JSON.stringify(postBody)).not.toContain(rawKey);

    const getRes = await GET();
    const getBody = await getRes.json();
    expect(getRes.status).toBe(200);
    expect(getBody.keys).toHaveLength(3);
    expect(JSON.stringify(getBody)).not.toContain(rawKey);

    const delRes = await DELETE(
      new Request('https://x/api/connector/keys?provider=openrouter', { method: 'DELETE' })
    );
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ provider: 'openrouter', deleted: true });

    const delAgain = await DELETE(
      new Request('https://x/api/connector/keys?provider=openrouter', { method: 'DELETE' })
    );
    expect(await delAgain.json()).toEqual({ provider: 'openrouter', deleted: false });
  });

  it('requires an authenticated SaaS account', async () => {
    authenticateApiRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    });
    expect((await GET()).status).toBe(401);

    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'local', user: null } });
    expect((await GET()).status).toBe(400);
  });
});

import {
  defaultPlannerModel,
  requestJsonCompletion,
  type JsonCompletionResult,
  type PlannerProvider,
} from '@wp-agent/model-adapters';
import { decryptSecret, encryptSecret } from './crypto';

/**
 * Bring-your-own-key (BYOK) management for the model planner (E3-11 / E9-12).
 *
 * Security invariants:
 *   1. Raw keys are validated in memory, encrypted immediately with AES-256-GCM
 *      under `SITEPILOT_ENCRYPTION_KEY`, and never logged or returned in any
 *      API payload after submission.
 *   2. Read responses carry only `{ provider, last4, status, updatedAt }`.
 *   3. Deleting a key removes the row from `user_api_keys` so ciphertext does
 *      not linger after revocation.
 */

export const BYOK_PROVIDERS = ['gemini', 'openrouter', 'groq'] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

export interface ProviderMetadata {
  provider: ByokProvider;
  label: string;
  placeholder: string;
  freeTierNote: string;
  defaultModel: string;
}

export const PROVIDER_CATALOG: readonly ProviderMetadata[] = [
  {
    provider: 'gemini',
    label: 'Google Gemini',
    placeholder: 'AIza…',
    freeTierNote: 'Free tier via Google AI Studio (recommended primary planner).',
    defaultModel: defaultPlannerModel('gemini'),
  },
  {
    provider: 'openrouter',
    label: 'OpenRouter',
    placeholder: 'sk-or-v1-…',
    freeTierNote: 'Supports free :free models and multi-provider routing.',
    defaultModel: defaultPlannerModel('openrouter'),
  },
  {
    provider: 'groq',
    label: 'Groq',
    placeholder: 'gsk_…',
    freeTierNote: 'Low-latency free tier for fast structured JSON plans.',
    defaultModel: defaultPlannerModel('groq'),
  },
] as const;

export interface StoredUserKeySummary {
  provider: ByokProvider;
  last4: string;
  status: 'active' | 'revoked';
  updated_at: string;
}

export interface UserKeyStore {
  listKeys(ownerId: string): Promise<StoredUserKeySummary[]>;
  getEncryptedKey(
    ownerId: string,
    provider: ByokProvider
  ): Promise<{ key_encrypted: string; status: string } | null>;
  upsertKey(input: {
    ownerId: string;
    provider: ByokProvider;
    keyEncrypted: string;
    last4: string;
  }): Promise<StoredUserKeySummary>;
  deleteKey(ownerId: string, provider: ByokProvider): Promise<boolean>;
}

export interface PublicKeyView {
  provider: ByokProvider;
  label: string;
  placeholder: string;
  freeTierNote: string;
  defaultModel: string;
  configured: boolean;
  last4: string | null;
  status: 'active' | 'not_configured';
  updatedAt: string | null;
}

export type KeyProbeFn = (input: {
  provider: PlannerProvider;
  apiKey: string;
}) => Promise<JsonCompletionResult>;

export function isByokProvider(value: unknown): value is ByokProvider {
  return typeof value === 'string' && (BYOK_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Validates and normalises a user-supplied provider API key.
 * Never echoes the raw value in error messages.
 */
export function validateRawApiKey(
  raw: unknown
): { ok: true; key: string; last4: string } | { ok: false; message: string } {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'Provide an API key string.' };
  }

  const trimmed = raw.trim();
  if (trimmed.length < 12) {
    return { ok: false, message: 'API key is too short (minimum 12 characters).' };
  }
  if (trimmed.length > 512) {
    return { ok: false, message: 'API key exceeds the maximum allowed length (512 characters).' };
  }
  if (/[\s\x00-\x1f\x7f]/.test(trimmed)) {
    return { ok: false, message: 'API key must not contain spaces or control characters.' };
  }

  return {
    ok: true,
    key: trimmed,
    last4: trimmed.slice(-4),
  };
}

const defaultProbe: KeyProbeFn = ({ provider, apiKey }) =>
  requestJsonCompletion({
    provider,
    apiKey,
    systemPrompt: 'Reply with {"ok":true} and nothing else.',
    userPrompt: 'Ping',
    model: defaultPlannerModel(provider),
    timeoutMs: 10_000,
  });

/** Lists all supported providers with masked status for the owner. */
export async function listUserKeys(
  ownerId: string,
  store: UserKeyStore
): Promise<PublicKeyView[]> {
  const rows = await store.listKeys(ownerId);
  const byProvider = new Map<ByokProvider, StoredUserKeySummary>();

  for (const row of rows) {
    if (row.status === 'active') {
      byProvider.set(row.provider, row);
    }
  }

  return PROVIDER_CATALOG.map((meta) => {
    const active = byProvider.get(meta.provider);
    return {
      provider: meta.provider,
      label: meta.label,
      placeholder: meta.placeholder,
      freeTierNote: meta.freeTierNote,
      defaultModel: meta.defaultModel,
      configured: Boolean(active),
      last4: active ? active.last4.slice(-4) : null,
      status: active ? 'active' : 'not_configured',
      updatedAt: active ? active.updated_at : null,
    };
  });
}

export type SaveKeyOutcome =
  | {
      ok: true;
      key: { provider: ByokProvider; last4: string; status: 'active'; updatedAt: string };
      verified: boolean;
      model?: string;
    }
  | { ok: false; status: number; code: string; message: string };

/** Validates, optionally verifies live, encrypts and stores a BYOK key. */
export async function saveUserKey(
  input: {
    ownerId: string;
    provider: ByokProvider;
    apiKey: string;
    testFirst?: boolean;
  },
  deps: {
    store: UserKeyStore;
    encryptionKey: Buffer;
    probeFn?: KeyProbeFn;
  }
): Promise<SaveKeyOutcome> {
  const checked = validateRawApiKey(input.apiKey);
  if (!checked.ok) {
    return { ok: false, status: 400, code: 'VALIDATION_FAILED', message: checked.message };
  }

  let verifiedModel: string | undefined;
  if (input.testFirst) {
    const probe = await (deps.probeFn ?? defaultProbe)({
      provider: input.provider,
      apiKey: checked.key,
    });
    if (!probe.ok) {
      return {
        ok: false,
        status: 422,
        code: 'KEY_VERIFICATION_FAILED',
        message: probe.reason,
      };
    }
    verifiedModel = probe.model;
  }

  const keyEncrypted = encryptSecret(checked.key, deps.encryptionKey);
  const saved = await deps.store.upsertKey({
    ownerId: input.ownerId,
    provider: input.provider,
    keyEncrypted,
    last4: checked.last4,
  });

  return {
    ok: true,
    key: {
      provider: saved.provider,
      last4: saved.last4.slice(-4),
      status: 'active',
      updatedAt: saved.updated_at,
    },
    verified: Boolean(input.testFirst),
    model: verifiedModel,
  };
}

export type TestKeyOutcome =
  | { ok: true; provider: ByokProvider; model: string }
  | { ok: false; status: number; code: string; message: string };

/**
 * Verifies either a freshly typed key or the already-stored encrypted key for
 * `provider`, without returning any secret material.
 */
export async function testUserKey(
  input: {
    ownerId: string;
    provider: ByokProvider;
    apiKey?: string;
  },
  deps: {
    store: UserKeyStore;
    encryptionKey: Buffer;
    probeFn?: KeyProbeFn;
  }
): Promise<TestKeyOutcome> {
  let rawKey: string;

  if (typeof input.apiKey === 'string' && input.apiKey.trim().length > 0) {
    const checked = validateRawApiKey(input.apiKey);
    if (!checked.ok) {
      return { ok: false, status: 400, code: 'VALIDATION_FAILED', message: checked.message };
    }
    rawKey = checked.key;
  } else {
    const stored = await deps.store.getEncryptedKey(input.ownerId, input.provider);
    if (!stored || stored.status !== 'active') {
      return {
        ok: false,
        status: 404,
        code: 'KEY_NOT_FOUND',
        message: `No active ${input.provider} key is stored for your account.`,
      };
    }
    try {
      rawKey = decryptSecret(stored.key_encrypted, deps.encryptionKey);
    } catch {
      return {
        ok: false,
        status: 503,
        code: 'KEY_UNREADABLE',
        message: 'The stored key could not be decrypted. Save a replacement key.',
      };
    }
  }

  const probe = await (deps.probeFn ?? defaultProbe)({
    provider: input.provider,
    apiKey: rawKey,
  });

  if (!probe.ok) {
    return {
      ok: false,
      status: 422,
      code: 'KEY_VERIFICATION_FAILED',
      message: probe.reason,
    };
  }

  return { ok: true, provider: input.provider, model: probe.model };
}

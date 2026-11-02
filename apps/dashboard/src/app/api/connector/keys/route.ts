import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveQuotaLimits } from '@wp-agent/api-core';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { ConnectorConfigError, getEncryptionKey } from '../../../../lib/connector/crypto';
import {
  BYOK_PROVIDERS,
  isByokProvider,
  listUserKeys,
  saveUserKey,
  testUserKey,
} from '../../../../lib/connector/keys';
import { createSupabaseUserKeyStore } from '../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

const PostKeySchema = z
  .object({
    action: z.enum(['save', 'test']).optional(),
    provider: z.enum(BYOK_PROVIDERS),
    apiKey: z.string().max(1024).optional(),
    testFirst: z.boolean().optional(),
  })
  .strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isEncryptionReady(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/connector/keys — masked BYOK status + active daily quotas.
 *
 * Never returns plaintext or encrypted keys: each provider entry contains only
 * `{ provider, label, configured, last4, status, updatedAt }`.
 */
export async function GET() {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to manage model API keys.' },
      400
    );
  }

  const store = createSupabaseUserKeyStore();
  if (!store) {
    return json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Key storage is not configured on this deployment.' },
      503
    );
  }

  try {
    const keys = await listUserKeys(auth.context.user.id, store);
    const quotas = resolveQuotaLimits(process.env);
    return json({
      keys,
      encryptionReady: isEncryptionReady(),
      quotas,
    });
  } catch (error) {
    return json({ error: 'STORAGE_UNAVAILABLE', message: (error as Error).message }, 503);
  }
}

/**
 * POST /api/connector/keys — save (encrypt at rest) or test a provider key.
 */
export async function POST(req: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to manage model API keys.' },
      400
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'VALIDATION_FAILED', message: 'Request body must be valid JSON.' }, 400);
  }

  const parsed = PostKeySchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Provide a supported provider (gemini, openrouter or groq) and valid fields.',
      },
      400
    );
  }

  let encryptionKey: Buffer;
  try {
    encryptionKey = getEncryptionKey();
  } catch (error) {
    const isConfig = error instanceof ConnectorConfigError;
    return json(
      {
        error: isConfig ? 'CONFIG_MISSING' : 'ENCRYPTION_UNAVAILABLE',
        message: 'Model keys cannot be encrypted because SITEPILOT_ENCRYPTION_KEY is not set.',
      },
      503
    );
  }

  const store = createSupabaseUserKeyStore();
  if (!store) {
    return json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Key storage is not configured on this deployment.' },
      503
    );
  }

  const action = parsed.data.action ?? 'save';

  try {
    if (action === 'test') {
      const tested = await testUserKey(
        {
          ownerId: auth.context.user.id,
          provider: parsed.data.provider,
          apiKey: parsed.data.apiKey,
        },
        { store, encryptionKey }
      );

      if (!tested.ok) {
        return json({ error: tested.code, message: tested.message }, tested.status);
      }

      return json({
        status: 'verified',
        provider: tested.provider,
        model: tested.model,
      });
    }

    const saved = await saveUserKey(
      {
        ownerId: auth.context.user.id,
        provider: parsed.data.provider,
        apiKey: parsed.data.apiKey ?? '',
        testFirst: parsed.data.testFirst,
      },
      { store, encryptionKey }
    );

    if (!saved.ok) {
      return json({ error: saved.code, message: saved.message }, saved.status);
    }

    return json(
      {
        key: saved.key,
        verified: saved.verified,
        model: saved.model ?? null,
      },
      201
    );
  } catch (error) {
    return json({ error: 'STORAGE_UNAVAILABLE', message: (error as Error).message }, 503);
  }
}

/**
 * DELETE /api/connector/keys?provider=gemini — remove a stored key.
 */
export async function DELETE(req: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to manage model API keys.' },
      400
    );
  }

  const provider = new URL(req.url).searchParams.get('provider');
  if (!isByokProvider(provider)) {
    return json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Query parameter "provider" must be gemini, openrouter or groq.',
      },
      400
    );
  }

  const store = createSupabaseUserKeyStore();
  if (!store) {
    return json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Key storage is not configured on this deployment.' },
      503
    );
  }

  try {
    const deleted = await store.deleteKey(auth.context.user.id, provider);
    return json({ provider, deleted });
  } catch (error) {
    return json({ error: 'STORAGE_UNAVAILABLE', message: (error as Error).message }, 503);
  }
}

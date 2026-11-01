import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEncryptionKey, ConnectorConfigError } from '../../../../lib/connector/crypto';
import { pairSite } from '../../../../lib/connector/pairing';
import { createSupabasePairingStore } from '../../../../lib/connector/store';
import { checkPairingRateLimit, clientIpFrom } from '../../../../lib/connector/rate-limit';

export const dynamic = 'force-dynamic';

const PairRequestSchema = z.object({
  code: z.string().min(1).max(32),
  siteUrl: z.string().min(1).max(2048),
  siteName: z.string().max(200).optional(),
  environment: z.enum(['local', 'staging', 'production']).optional(),
  pluginVersion: z.string().max(40).optional(),
  wpVersion: z.string().max(40).optional(),
  phpVersion: z.string().max(40).optional(),
  capabilities: z.record(z.unknown()).optional(),
});

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Public pairing endpoint called by the WordPress connector.
 *
 * The pairing code is the credential for this one call. On success the response
 * carries the site token and secret exactly once — the connector stores them,
 * the platform stores only a hash (token) and an encrypted copy (secret).
 */
export async function POST(req: Request) {
  const ip = clientIpFrom(req);
  const limit = checkPairingRateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many pairing attempts. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'VALIDATION_FAILED', message: 'Request body must be JSON.' }, 400);
  }

  const parsed = PairRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Invalid pairing request.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      400
    );
  }

  let encryptionKey: Buffer;
  try {
    encryptionKey = getEncryptionKey();
  } catch (error) {
    if (error instanceof ConnectorConfigError) {
      return json({ error: 'CONFIG_MISSING', message: error.message }, 503);
    }
    return json({ error: 'CONFIG_MISSING', message: 'Connector encryption is misconfigured.' }, 503);
  }

  const store = createSupabasePairingStore();
  if (!store) {
    return json(
      {
        error: 'STORAGE_UNAVAILABLE',
        message: 'Connector storage is not configured for this deployment.',
      },
      503
    );
  }

  const result = await pairSite(parsed.data, { store, encryptionKey });
  if (!result.ok) {
    return json({ error: result.code, message: result.message }, result.status);
  }

  const { credentials } = result;
  return json(
    {
      status: 'paired',
      site: {
        id: credentials.siteId,
        projectId: credentials.projectId,
        url: credentials.siteUrl,
        environment: credentials.environment,
        scopes: credentials.scopes,
      },
      credentials: {
        token: credentials.token,
        secret: credentials.secret,
      },
      note: 'Store these credentials in WordPress now — they are not retrievable later.',
    },
    201
  );
}

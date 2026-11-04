import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEncryptionKey } from '../../../../lib/connector/crypto';
import { pairSite } from '../../../../lib/connector/pairing';
import {
  createSupabasePairingStore,
  enqueueConnectorJob,
} from '../../../../lib/connector/store';
import { clientIpFrom, enforceAbuseLimit } from '../../../../lib/abuse';

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
  // E11-02: per-IP burst guard with a real reset time and typed 429 body.
  const abuse = await enforceAbuseLimit({ action: 'pair', dimension: 'ip', subjectId: clientIpFrom(req) });
  if (!abuse.ok) return abuse.response;

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
  } catch {
    return json({ error: 'CONFIG_MISSING', message: 'Connector encryption is misconfigured.' }, 503);
  }

  try {
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

    // Kick off the first job immediately so the connector can prove the pipeline
    // (and upload its capability manifest) without waiting for a scheduled poll.
    let firstJobId: string | null = null;
    try {
      firstJobId = await enqueueConnectorJob({
        projectId: credentials.projectId,
        siteId: credentials.siteId,
        tool: 'site.info',
        args: {},
        risk: 'R0',
        idempotencyKey: `site.info:${credentials.siteId}:bootstrap`,
      });
    } catch {
      // Pairing succeeded; a missing first job is recoverable via heartbeat.
      firstJobId = null;
    }

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
        firstJobId,
        note: 'Store these credentials in WordPress now — they are not retrievable later.',
      },
      201
    );
  } catch {
    return json({ error: 'STORAGE_UNAVAILABLE', message: 'Pairing could not be confirmed. Check the connection status before requesting a new code.' }, 503);
  }
}

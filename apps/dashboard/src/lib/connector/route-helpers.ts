import { NextResponse } from 'next/server';
import {
  ConnectorConfigError,
  getEncryptionKey,
} from './crypto';
import type { ConnectorHandlerDeps, HandlerOutput } from './handlers';
import { checkConnectorRateLimit } from './rate-limit';
import {
  createSupabaseConnectorAuthStore,
  createSupabaseJobStore,
  createSupabaseSiteWriter,
} from './store';

export type DepsResult =
  | { ok: true; deps: ConnectorHandlerDeps }
  | { ok: false; output: HandlerOutput };

/**
 * Builds the dependency bundle for a signed connector route.
 *
 * Every failure here is a deployment problem, never a client problem, so it is
 * reported as 503 with a clear code instead of a generic 500.
 */
export function buildConnectorDeps(): DepsResult {
  let encryptionKey: Buffer;
  try {
    encryptionKey = getEncryptionKey();
  } catch (error) {
    return {
      ok: false,
      output: {
        status: 503,
        body: {
          error: 'CONFIG_MISSING',
          message:
            error instanceof ConnectorConfigError
              ? error.message
              : 'Connector encryption is misconfigured.',
        },
      },
    };
  }

  const authStore = createSupabaseConnectorAuthStore();
  const jobStore = createSupabaseJobStore();
  const siteWriter = createSupabaseSiteWriter();

  if (!authStore || !jobStore || !siteWriter) {
    return {
      ok: false,
      output: {
        status: 503,
        body: {
          error: 'STORAGE_UNAVAILABLE',
          message: 'Connector storage is not configured for this deployment.',
        },
      },
    };
  }

  return {
    ok: true,
    deps: {
      authStore,
      jobStore,
      siteWriter,
      encryptionKey,
      isRateLimited: (siteId: string) => !checkConnectorRateLimit(siteId).ok,
    },
  };
}

/** JSON response with no-store semantics for connector traffic. */
export function connectorJson(output: HandlerOutput): NextResponse {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (output.status === 429) headers['Retry-After'] = '30';
  return NextResponse.json(output.body, { status: output.status, headers });
}

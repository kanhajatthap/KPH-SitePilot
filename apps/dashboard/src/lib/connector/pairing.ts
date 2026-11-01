import {
  ConnectorConfigError,
  encryptSecret,
  generateSiteId,
  generateSiteSecret,
  generateSiteToken,
  hashToken,
  isValidPairingCodeShape,
  normalizePairingCode,
} from './crypto';

/** Full capability set granted by an administrator-initiated pairing. */
export const FULL_SCOPES = [
  'read',
  'content',
  'media',
  'site_ops',
  'commerce',
  'files',
  'code',
] as const;

export type ConnectorScope = (typeof FULL_SCOPES)[number];

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

export interface PairingCodeRow {
  id: string;
  project_id: string;
  expires_at: string;
  used_at: string | null;
  used_by_site: string | null;
}

export interface NewSiteRow {
  id: string;
  project_id: string;
  url: string;
  name: string;
  environment: 'local' | 'staging' | 'production';
  status: 'active';
  scopes: ConnectorScope[];
  token_hash: string;
  secret_encrypted: string;
  plugin_version: string | null;
  wp_version: string | null;
  php_version: string | null;
  capabilities: Record<string, unknown>;
  created_by: string | null;
  last_seen_at: string;
}

/**
 * Storage port. The Supabase implementation lives in `./store`; tests use an
 * in-memory implementation, which keeps the pairing rules unit-testable.
 */
export interface PairingStore {
  findPairingCode(codeHash: string): Promise<PairingCodeRow | null>;
  createSite(row: NewSiteRow): Promise<{ id: string }>;
  markPairingCodeUsed(codeId: string, siteId: string): Promise<void>;
}

export interface PairSiteInput {
  code: string;
  siteUrl: string;
  siteName?: string;
  environment?: string;
  projectId?: string;
  createdBy?: string | null;
  pluginVersion?: string;
  wpVersion?: string;
  phpVersion?: string;
  capabilities?: Record<string, unknown>;
}

export interface PairedSiteCredentials {
  siteId: string;
  projectId: string;
  siteUrl: string;
  token: string;
  secret: string;
  scopes: ConnectorScope[];
  environment: 'local' | 'staging' | 'production';
}

export type PairingFailureCode =
  | 'VALIDATION_FAILED'
  | 'PAIRING_CODE_INVALID'
  | 'PAIRING_CODE_EXPIRED'
  | 'PAIRING_CODE_USED'
  | 'PROJECT_MISMATCH'
  | 'SITE_ALREADY_CONNECTED'
  | 'CONFIG_MISSING'
  | 'STORAGE_UNAVAILABLE';

export type PairingResult =
  | { ok: true; credentials: PairedSiteCredentials }
  | { ok: false; code: PairingFailureCode; message: string; status: number };

export interface PairSiteDependencies {
  store: PairingStore;
  encryptionKey: Buffer;
  now?: () => Date;
}

function failure(
  code: PairingFailureCode,
  message: string,
  status: number
): PairingResult {
  return { ok: false, code, message, status };
}

function normalizeEnvironment(value: string | undefined) {
  if (value === 'local' || value === 'staging' || value === 'production') {
    return value;
  }
  return 'production' as const;
}

function normalizeSiteUrl(raw: string | undefined):
  | { ok: true; url: string }
  | { ok: false; message: string } {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, message: 'siteUrl is required.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, message: 'siteUrl must be an absolute http(s) URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'siteUrl must use http or https.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: 'siteUrl must not contain credentials.' };
  }

  return { ok: true, url: parsed.origin };
}

/**
 * Pairs a WordPress site with a platform project using a one-time code.
 *
 * The code is single-use and short-lived; the returned token and secret are the
 * only copy the platform will ever hand out in plaintext. The platform keeps a
 * hash of the token and an encrypted copy of the secret, which is exactly what
 * the connector stores on the WordPress side.
 */
export async function pairSite(
  input: PairSiteInput,
  deps: PairSiteDependencies
): Promise<PairingResult> {
  const normalizedCode = normalizePairingCode(input.code ?? '');
  if (!isValidPairingCodeShape(normalizedCode)) {
    return failure(
      'VALIDATION_FAILED',
      'Pairing codes are 8 characters drawn from A–Z and 2–9 (for example ABCD-EFGH).',
      400
    );
  }

  const siteUrl = normalizeSiteUrl(input.siteUrl);
  if (!siteUrl.ok) {
    return failure('VALIDATION_FAILED', siteUrl.message, 400);
  }

  let codeRow: PairingCodeRow | null;
  try {
    codeRow = await deps.store.findPairingCode(hashToken(normalizedCode));
  } catch {
    return failure('STORAGE_UNAVAILABLE', 'Pairing storage is unavailable. Try again.', 503);
  }

  if (!codeRow) {
    return failure('PAIRING_CODE_INVALID', 'That pairing code is not recognised.', 404);
  }
  if (codeRow.used_at) {
    return failure('PAIRING_CODE_USED', 'That pairing code has already been used.', 409);
  }

  const now = (deps.now ?? (() => new Date()))();
  if (new Date(codeRow.expires_at).getTime() <= now.getTime()) {
    return failure('PAIRING_CODE_EXPIRED', 'That pairing code has expired. Generate a new one.', 410);
  }
  if (input.projectId && input.projectId !== codeRow.project_id) {
    return failure('PROJECT_MISMATCH', 'That pairing code belongs to a different project.', 403);
  }

  const token = generateSiteToken();
  const secret = generateSiteSecret();
  const siteId = generateSiteId();

  let secretEncrypted: string;
  try {
    secretEncrypted = encryptSecret(secret, deps.encryptionKey);
  } catch (error) {
    if (error instanceof ConnectorConfigError) {
      return failure('CONFIG_MISSING', error.message, 503);
    }
    return failure('CONFIG_MISSING', 'Connector encryption is misconfigured.', 503);
  }

  const row: NewSiteRow = {
    id: siteId,
    project_id: codeRow.project_id,
    url: siteUrl.url,
    name: (input.siteName || siteUrl.url).slice(0, 200),
    environment: normalizeEnvironment(input.environment),
    status: 'active',
    scopes: [...FULL_SCOPES],
    token_hash: hashToken(token),
    secret_encrypted: secretEncrypted,
    plugin_version: input.pluginVersion ?? null,
    wp_version: input.wpVersion ?? null,
    php_version: input.phpVersion ?? null,
    capabilities: input.capabilities ?? {},
    created_by: input.createdBy ?? null,
    last_seen_at: now.toISOString(),
  };

  try {
    await deps.store.createSite(row);
  } catch (error) {
    const message = (error as Error).message || '';
    if (/duplicate|unique/i.test(message)) {
      return failure(
        'SITE_ALREADY_CONNECTED',
        'This site is already connected to the project. Disconnect it first, then pair again.',
        409
      );
    }
    return failure('STORAGE_UNAVAILABLE', 'The site could not be saved. Try again.', 503);
  }

  try {
    await deps.store.markPairingCodeUsed(codeRow.id, siteId);
  } catch {
    // The site exists; a stale code can be cleaned up by the expiry job.
  }

  return {
    ok: true,
    credentials: {
      siteId,
      projectId: codeRow.project_id,
      siteUrl: siteUrl.url,
      token,
      secret,
      scopes: [...FULL_SCOPES],
      environment: row.environment,
    },
  };
}

import { VerifiedUser } from './http.ts';

interface RuntimeEnvironment {
  get(name: string): string | undefined;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function authenticateRequest(
  request: Request,
  env: RuntimeEnvironment
): Promise<VerifiedUser | null> {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('Authorization') || '');
  const url = env.get('SUPABASE_URL');
  const anonKey = env.get('SUPABASE_ANON_KEY');
  if (!match || !url || !anonKey) return null;

  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${match[1]}` },
  });
  if (!response.ok) return null;

  const user: unknown = await response.json();
  if (
    !user || typeof user !== 'object' ||
    !('id' in user) || typeof user.id !== 'string' ||
    !UUID_PATTERN.test(user.id) ||
    !('role' in user) || user.role !== 'authenticated'
  ) return null;
  return { id: user.id };
}

export function serviceEnvironment(env: RuntimeEnvironment) {
  const url = env.get('SUPABASE_URL');
  const serviceRoleKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) throw new Error('Supabase service configuration is missing.');
  return { url: url.replace(/\/$/, ''), serviceRoleKey };
}

export async function serviceRequest<T>(
  env: RuntimeEnvironment,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { url, serviceRoleKey } = serviceEnvironment(env);
  const headers = new Headers(init.headers);
  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) throw new Error(`Supabase service request failed (${response.status}).`);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function importVaultKey(env: RuntimeEnvironment): Promise<CryptoKey> {
  const encoded = env.get('VAULT_MASTER_KEY');
  if (!encoded) throw new Error('Vault key is not configured.');

  let raw: Uint8Array;
  if (/^[0-9a-f]{64}$/i.test(encoded)) {
    raw = new Uint8Array(encoded.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  } else {
    try {
      raw = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    } catch {
      throw new Error('Vault key must be 32-byte hex or base64.');
    }
  }
  if (raw.byteLength !== 32) throw new Error('Vault key must decode to exactly 32 bytes.');
  const keyMaterial = new ArrayBuffer(raw.byteLength);
  new Uint8Array(keyMaterial).set(raw);
  return await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt']);
}

export const isUuidValue = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock('../src/lib/supabase/admin', () => ({ createSupabaseAdminClient }));

import { rotateSiteCredentials, updateOwnedSite } from '../src/lib/connector/store';

const TEST_MASTER_KEY = Buffer.alloc(32, 0x24).toString('base64');
const OWNER_ID = '6a1c0f5e-1111-4a2b-9c3d-000000000001';
const SITE_ID = '11111111-2222-4333-8444-555555555555';

const OWNED_ROW = {
  id: SITE_ID,
  project_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  url: 'https://shop.example.com',
  name: 'Shop',
  environment: 'production',
  status: 'active',
  scopes: ['read', 'content'],
  plugin_version: '0.8.0',
  wp_version: '6.8',
  php_version: '8.2',
  last_seen_at: null,
  created_at: '2026-11-02T00:00:00.000Z',
  site_metadata: [{ capabilities: {} }],
};

function buildMockDb(ownedRow: typeof OWNED_ROW | null) {
  const updateCalls: Array<Record<string, unknown>> = [];
  let selectCount = 0;

  const client = {
    from: vi.fn((table: string) => {
      expect(table).toBe('sites');
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                selectCount += 1;
                return { data: ownedRow, error: null };
              }),
            })),
          })),
        })),
        update: vi.fn((patch: Record<string, unknown>) => {
          updateCalls.push(patch);
          return {
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: ownedRow ? { id: ownedRow.id } : null,
                  error: null,
                })),
              })),
            })),
          };
        }),
      };
    }),
  };

  return { client, updateCalls, getSelectCount: () => selectCount };
}

describe('store ownership pre-check before mutation (E2-15 / E2-17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SITEPILOT_ENCRYPTION_KEY = TEST_MASTER_KEY;
  });

  it('never calls .update() when updateOwnedSite is invoked for another tenant\'s site', async () => {
    const { client, updateCalls } = buildMockDb(null);
    createSupabaseAdminClient.mockReturnValue(client);

    const result = await updateOwnedSite(OWNER_ID, SITE_ID, { status: 'paused' });

    expect(result).toBeNull();
    expect(updateCalls).toHaveLength(0);
  });

  it('never calls .update() when rotateSiteCredentials is invoked for another tenant\'s site', async () => {
    const { client, updateCalls } = buildMockDb(null);
    createSupabaseAdminClient.mockReturnValue(client);

    const result = await rotateSiteCredentials(OWNER_ID, SITE_ID);

    expect(result).toBeNull();
    expect(updateCalls).toHaveLength(0);
  });

  it('updates and returns the site after verifying ownership', async () => {
    const { client, updateCalls, getSelectCount } = buildMockDb(OWNED_ROW);
    createSupabaseAdminClient.mockReturnValue(client);

    const updated = await updateOwnedSite(OWNER_ID, SITE_ID, { status: 'paused' });

    expect(updated?.id).toBe(SITE_ID);
    expect(getSelectCount()).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ status: 'paused' });
  });

  it('rotates token_hash and secret_encrypted after verifying ownership', async () => {
    const { client, updateCalls } = buildMockDb(OWNED_ROW);
    createSupabaseAdminClient.mockReturnValue(client);

    const rotated = await rotateSiteCredentials(OWNER_ID, SITE_ID);

    expect(rotated).not.toBeNull();
    expect(rotated?.token).toMatch(/^[a-f0-9]{64}$/);
    expect(rotated?.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(updateCalls[0].token_hash).not.toBe(rotated?.token);
    expect(String(updateCalls[0].secret_encrypted)).not.toContain(rotated?.secret ?? '');
  });
});

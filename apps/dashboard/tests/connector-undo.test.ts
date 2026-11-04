import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveUndoJob, sanitizeSettingsValues, WRITABLE_SETTINGS_KEYS } from '../src/lib/connector/undo';

const {
  authenticateApiRequest,
  createSupabaseAdminClient,
  enqueueConnectorJob,
  getSnapshot,
  siteBelongsToUser,
} = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  enqueueConnectorJob: vi.fn(),
  getSnapshot: vi.fn(),
  siteBelongsToUser: vi.fn(),
}));

vi.mock('../src/lib/auth/api', () => ({ authenticateApiRequest }));
vi.mock('../src/lib/supabase/admin', () => ({ createSupabaseAdminClient }));
vi.mock('../src/lib/connector/store', () => ({
  enqueueConnectorJob,
  getSnapshot,
  siteBelongsToUser,
}));

import { POST } from '../src/app/api/connector/snapshots/[id]/undo/route';

const SNAPSHOT_ID = '11111111-2222-4333-8444-555555555555';
const PROJECT_ID = '99999999-8888-4777-8666-555555555555';
const SITE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER = { id: '6a1c0f5e-1111-4a2b-9c3d-000000000001', email: 'owner@example.test' };

describe('resolveUndoJob & sanitizeSettingsValues (E3-09 / E6-01)', () => {
  it('excludes siteurl and home from WRITABLE_SETTINGS_KEYS', () => {
    expect(WRITABLE_SETTINGS_KEYS).not.toContain('siteurl');
    expect(WRITABLE_SETTINGS_KEYS).not.toContain('home');
    expect(WRITABLE_SETTINGS_KEYS).not.toContain('admin_email');
  });

  it('resolves post:<id> snapshots to content.restore', () => {
    const resolved = resolveUndoJob({
      resource: 'post:42',
      before: { id: 42, title: 'Original heading', status: 'publish' },
    });

    expect(resolved).toEqual({
      ok: true,
      tool: 'content.restore',
      args: {
        before: { id: 42, title: 'Original heading', status: 'publish' },
      },
      risk: 'R1',
    });
  });

  it('resolves settings snapshots (both wrapped and flat) to settings.restore', () => {
    const wrapped = resolveUndoJob({
      resource: 'settings',
      before: {
        values: {
          blogname: 'Before Title',
          blogdescription: 'Before Tagline',
        },
      },
    });

    expect(wrapped).toEqual({
      ok: true,
      tool: 'settings.restore',
      args: {
        before: {
          values: {
            blogname: 'Before Title',
            blogdescription: 'Before Tagline',
          },
        },
      },
      risk: 'R1',
    });
  });

  it('fails closed when a snapshot contains non-allowlisted keys or irreversible resources', () => {
    expect(
      sanitizeSettingsValues({
        blogname: 'Safe',
        siteurl: 'https://tampered.example',
      })
    ).toBeNull();

    const badSettings = resolveUndoJob({
      resource: 'settings',
      before: { values: { siteurl: 'https://bad.example' } },
    });
    expect(badSettings.ok).toBe(false);
    if (!badSettings.ok) expect(badSettings.code).toBe('SNAPSHOT_UNUSABLE');

    const irreversible = resolveUndoJob({
      resource: 'irreversible:db_migration',
      before: { version: 1 },
    });
    expect(irreversible).toEqual({
      ok: false,
      code: 'ROLLBACK_UNAVAILABLE',
      message: 'This operation cannot be undone automatically.',
    });
  });

  it('resolves seo:<id>, media:<id>, featured:<id>, and menu:<id> snapshots cleanly and blocks arbitrary meta keys', () => {
    expect(
      resolveUndoJob({
        resource: 'seo:12',
        before: {
          id: 12,
          provider: 'yoast',
          meta: { _yoast_wpseo_title: 'Before SEO Title', _yoast_wpseo_metadesc: 'Before Desc' },
        },
      })
    ).toEqual({
      ok: true,
      tool: 'seo.meta.restore',
      args: {
        id: 12,
        provider: 'yoast',
        meta: { _yoast_wpseo_title: 'Before SEO Title', _yoast_wpseo_metadesc: 'Before Desc' },
      },
      risk: 'R1',
    });

    // Reject non-allowlisted meta key injection
    const poisonedSeo = resolveUndoJob({
      resource: 'seo:12',
      before: { id: 12, meta: { wp_capabilities: 'a:1:{s:13:"administrator";b:1;}' } },
    });
    expect(poisonedSeo.ok).toBe(false);

    expect(
      resolveUndoJob({
        resource: 'media:5',
        before: { id: 5, alt: 'Old alt', title: 'Hero', caption: '', description: '' },
      })
    ).toEqual({
      ok: true,
      tool: 'media.restore',
      args: { id: 5, alt: 'Old alt', title: 'Hero', caption: '', description: '' },
      risk: 'R1',
    });

    expect(
      resolveUndoJob({
        resource: 'featured:12',
        before: { id: 12, mediaId: 0 },
      })
    ).toEqual({
      ok: true,
      tool: 'media.restore_featured',
      args: { id: 12, mediaId: 0 },
      risk: 'R1',
    });

    expect(
      resolveUndoJob({
        resource: 'menu:3',
        before: {
          menuId: 3,
          items: [{ title: 'Home', url: 'https://example.com/' }],
          locations: { primary: 3 },
        },
      })
    ).toEqual({
      ok: true,
      tool: 'menus.restore',
      args: {
        menuId: 3,
        items: [{ title: 'Home', url: 'https://example.com/' }],
        locations: { primary: 3 },
      },
      risk: 'R1',
    });
  });
});

describe('POST /api/connector/snapshots/[id]/undo route (E3-09 / E6-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: USER } });
    createSupabaseAdminClient.mockReturnValue({});
    siteBelongsToUser.mockResolvedValue(true);
  });

  it('enqueues settings.restore for a settings snapshot without marking it restored', async () => {
    getSnapshot.mockResolvedValue({
      id: SNAPSHOT_ID,
      project_id: PROJECT_ID,
      site_id: SITE_ID,
      job_id: 'job-1',
      resource: 'settings',
      before: { values: { blogname: 'Previous Name' } },
      after: { values: { blogname: 'Current Name' } },
      restored_at: null,
      created_at: '2026-11-02T00:00:00.000Z',
    });
    enqueueConnectorJob.mockResolvedValue('undo-job-1');

    const res = await POST(new Request('https://x/undo', { method: 'POST' }), {
      params: Promise.resolve({ id: SNAPSHOT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(enqueueConnectorJob).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      siteId: SITE_ID,
      tool: 'settings.restore',
      args: { before: { values: { blogname: 'Previous Name' } } },
      risk: 'R1',
      idempotencyKey: `undo:${SNAPSHOT_ID}`,
    });

    expect(body).toEqual({
      status: 'queued',
      jobId: 'undo-job-1',
      tool: 'settings.restore',
      resource: 'settings',
    });
  });

  it('returns 409 when a snapshot has already been restored and 404 when unowned', async () => {
    getSnapshot.mockResolvedValue({
      id: SNAPSHOT_ID,
      project_id: PROJECT_ID,
      site_id: SITE_ID,
      job_id: 'job-1',
      resource: 'post:12',
      before: { id: 12, title: 'Old' },
      after: { id: 12, title: 'New' },
      restored_at: '2026-11-02T01:00:00.000Z',
      created_at: '2026-11-02T00:00:00.000Z',
    });

    const conflict = await POST(new Request('https://x/undo', { method: 'POST' }), {
      params: Promise.resolve({ id: SNAPSHOT_ID }),
    });
    expect(conflict.status).toBe(409);
    expect(enqueueConnectorJob).not.toHaveBeenCalled();

    siteBelongsToUser.mockResolvedValue(false);
    const unowned = await POST(new Request('https://x/undo', { method: 'POST' }), {
      params: Promise.resolve({ id: SNAPSHOT_ID }),
    });
    expect(unowned.status).toBe(404);
  });
});

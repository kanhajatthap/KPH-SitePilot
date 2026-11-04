import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(), findOwnedSite: vi.fn(), updateOwnedSite: vi.fn(),
  revokeSiteForUser: vi.fn(), getSnapshot: vi.fn(), siteBelongsToUser: vi.fn(),
  enqueueConnectorJob: vi.fn(), markSnapshotRestored: vi.fn(), createSupabaseAdminClient: vi.fn(),
}));
vi.mock('../src/lib/auth/api', () => ({ authenticateApiRequest: mocks.authenticateApiRequest }));
vi.mock('../src/lib/connector/store', () => mocks);
vi.mock('../src/lib/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
import { GET, PATCH, DELETE } from '../src/app/api/connector/sites/[id]/route';
import { POST } from '../src/app/api/connector/snapshots/[id]/undo/route';
const id = '11111111-2222-4333-8444-555555555555';
const context = () => ({ params: Promise.resolve({ id }) });
const request = () => new Request('https://app.example/api', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Shop' }),
});
const internal = 'PRIVATE_BACKEND_DETAIL /srv/internal/database.ts tenant-row';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: { id: 'owner' } } });
  mocks.getSnapshot.mockResolvedValue({ id, project_id: id, site_id: id, resource: 'post:42', before: { id: 42 }, restored_at: null });
  mocks.siteBelongsToUser.mockResolvedValue(true);
  mocks.createSupabaseAdminClient.mockReturnValue({});
  mocks.enqueueConnectorJob.mockResolvedValue('job-id');
});

async function assertSafe(response: Response, code: string) {
  expect(response.status).toBe(503);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = await response.json();
  expect(body.error).toBe(code);
  expect(body.message).toBeTruthy();
  expect(JSON.stringify(body)).not.toContain(internal);
  expect(Object.keys(body).sort()).toEqual(['error', 'message']);
}

describe('connector client-safe storage failures', () => {
  it.each([
    ['GET', 'findOwnedSite', GET], ['PATCH', 'updateOwnedSite', PATCH],
    ['DELETE', 'revokeSiteForUser', DELETE],
  ] as const)('%s hides backend error details', async (_name, dependency, handler) => {
    mocks[dependency].mockRejectedValue(new Error(internal));
    await assertSafe(await handler(request(), context()), 'STORAGE_UNAVAILABLE');
  });

  it.each(['getSnapshot', 'siteBelongsToUser', 'enqueueConnectorJob', 'markSnapshotRestored'] as const)(
    'undo safely handles failure from %s', async (dependency) => {
      mocks[dependency].mockRejectedValue(new Error(internal));
      const response = await POST(request(), context());
      const body = await response.clone().json();
      expect(body.message).toContain('Check Activity for an existing restore job');
      await assertSafe(response, 'UNDO_FAILED');
      if (dependency === 'getSnapshot' || dependency === 'siteBelongsToUser') {
        expect(mocks.enqueueConnectorJob).not.toHaveBeenCalled();
      }
    }
  );

  it('handles non-Error thrown values without echoing them', async () => {
    mocks.enqueueConnectorJob.mockRejectedValue({ message: internal });
    await assertSafe(await POST(request(), context()), 'UNDO_FAILED');
  });
});

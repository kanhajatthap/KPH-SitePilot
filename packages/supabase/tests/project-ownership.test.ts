import { describe, expect, it } from 'vitest';
import {
  authorizeProjectAccess,
  isValidProjectId,
  type ProjectOwnerLookup,
} from '../src/auth/project-ownership.js';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const USER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';

function lookupReturning(ownerId: string | null): ProjectOwnerLookup {
  return async () => (ownerId ? { owner_id: ownerId } : null);
}

describe('E1-08 project ownership policy', () => {
  it('validates UUID-shaped project ids', () => {
    expect(isValidProjectId(PROJECT)).toBe(true);
    expect(isValidProjectId('project-1')).toBe(false);
    expect(isValidProjectId('')).toBe(false);
  });

  it('answers 401 for an unauthenticated caller without a lookup', async () => {
    let called = 0;
    const outcome = await authorizeProjectAccess({
      projectId: PROJECT,
      userId: null,
      lookup: async () => {
        called += 1;
        return { owner_id: USER };
      },
    });
    expect(outcome).toMatchObject({ ok: false, reason: 'unauthenticated', status: 401, code: 'UNAUTHORIZED' });
    expect(called).toBe(0);
  });

  it('answers 404 for a malformed or missing id', async () => {
    for (const projectId of ['not-a-uuid', '', null, undefined]) {
      const outcome = await authorizeProjectAccess({
        projectId,
        userId: USER,
        lookup: lookupReturning(USER),
      });
      expect(outcome).toMatchObject({ ok: false, status: 404, code: 'PROJECT_NOT_FOUND' });
    }
    const missing = await authorizeProjectAccess({
      projectId: OTHER,
      userId: USER,
      lookup: lookupReturning(null),
    });
    expect(missing).toMatchObject({ ok: false, reason: 'not-found', status: 404 });
  });

  it('answers 404 (not 403) for another user, with the same body as not-found', async () => {
    const outcome = await authorizeProjectAccess({
      projectId: PROJECT,
      userId: USER,
      lookup: lookupReturning(STRANGER),
    });
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'other-owner',
      status: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Project not found.',
    });
  });

  it('allows the verified owner and passes the id to the lookup', async () => {
    const seen: string[] = [];
    const outcome = await authorizeProjectAccess({
      projectId: PROJECT,
      userId: USER,
      lookup: async (projectId) => {
        seen.push(projectId);
        return { owner_id: USER };
      },
    });
    expect(outcome).toEqual({ ok: true, projectId: PROJECT, userId: USER });
    expect(seen).toEqual([PROJECT]);
  });

  it('turns a database failure into a typed 503', async () => {
    const outcome = await authorizeProjectAccess({
      projectId: PROJECT,
      userId: USER,
      lookup: async () => {
        throw new Error('connection refused');
      },
    });
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'lookup-error',
      status: 503,
      code: 'OWNERSHIP_UNAVAILABLE',
    });
    expect(JSON.stringify(outcome)).not.toContain('connection refused');
  });
});

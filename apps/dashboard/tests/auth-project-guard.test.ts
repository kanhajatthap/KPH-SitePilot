import { describe, expect, it } from 'vitest';
import type { AuthResult } from '../src/lib/auth/api';
import { requireOwnedProject, type ProjectGuardDeps } from '../src/lib/auth/project-guard';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const USER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';

function saasAuth(userId: string | null = USER): () => Promise<AuthResult> {
  return async () => ({
    ok: true,
    context: {
      mode: 'saas',
      user: userId ? { id: userId, email: 'owner@example.com' } : null,
    },
  });
}

function localAuth(): () => Promise<AuthResult> {
  return async () => ({ ok: true, context: { mode: 'local', user: null } });
}

function deps(overrides: Partial<ProjectGuardDeps> = {}): ProjectGuardDeps {
  return { authenticate: saasAuth(), lookup: async () => ({ owner_id: USER }), ...overrides };
}

async function body(result: Awaited<ReturnType<typeof requireOwnedProject>>) {
  if (result.ok) return null;
  return { status: result.response.status, json: await result.response.json() };
}

describe('E1-08 shared project guard', () => {
  it('propagates an unauthenticated session as 401', async () => {
    const authenticate = async (): Promise<AuthResult> => ({
      ok: false,
      response: new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }) as never,
    });
    const result = await requireOwnedProject(PROJECT, deps({ authenticate }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('allows the single-user local workspace without a lookup', async () => {
    let called = 0;
    const result = await requireOwnedProject(
      PROJECT,
      deps({
        authenticate: localAuth(),
        lookup: async () => {
          called += 1;
          return { owner_id: USER };
        },
      })
    );
    expect(result).toEqual({ ok: true, mode: 'local', userId: null });
    expect(called).toBe(0);
  });

  it('allows the verified owner', async () => {
    const result = await requireOwnedProject(PROJECT, deps());
    expect(result).toEqual({ ok: true, mode: 'saas', userId: USER, projectId: PROJECT });
  });

  it('returns 404 for another user\'s project with no existence oracle', async () => {
    const result = await body(
      await requireOwnedProject(PROJECT, deps({ lookup: async () => ({ owner_id: STRANGER }) }))
    );
    expect(result).toEqual({
      status: 404,
      json: { error: 'PROJECT_NOT_FOUND', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' },
    });
  });

  it('returns 404 for a missing project and 401 for a missing user', async () => {
    const missing = await body(
      await requireOwnedProject(PROJECT, deps({ lookup: async () => null }))
    );
    expect(missing?.status).toBe(404);
    const noUser = await body(
      await requireOwnedProject(PROJECT, deps({ authenticate: saasAuth(null) }))
    );
    expect(noUser?.status).toBe(401);
  });

  it('returns a typed 503 on a database failure and never echoes the error', async () => {
    const result = await body(
      await requireOwnedProject(
        PROJECT,
        deps({
          lookup: async () => {
            throw new Error('secret connection string: postgres://admin:hunter2@db');
          },
        })
      )
    );
    expect(result?.status).toBe(503);
    expect(result?.json.code).toBe('OWNERSHIP_UNAVAILABLE');
    expect(JSON.stringify(result?.json)).not.toContain('hunter2');
    expect(JSON.stringify(result?.json)).not.toContain('connection string');
  });

  it('marks every denial no-store', async () => {
    const result = await requireOwnedProject('bad-id', deps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.headers.get('Cache-Control')).toBe('no-store');
  });
});

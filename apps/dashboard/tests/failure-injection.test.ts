import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createInMemoryRepositoryClient,
  createRepositories,
  createSupabaseRepositoryClient,
  type SupabaseLike,
} from '@wp-agent/supabase';
import {
  FAILURE_GUIDANCE,
  FAILURE_SCENARIOS,
  checkReadBack,
  classifyFailure,
  guidanceFor,
  guidanceForRepositoryError,
  scrubFailureDetail,
  type FailureKind,
} from '../src/lib/failure-guidance';
import { sessionExpiredResponse } from '../src/lib/auth/api';

const RAW: Record<FailureKind, string> = {
  offline: 'fetch failed: network unreachable at /home/user/app/route.ts:12',
  timeout: 'AbortError: connector timed out after 30000ms',
  fatal: 'Fatal error: Uncaught Error in /home/user/wp-content/plugins/connector.php\nStack trace:\n#0 {main}',
  'tampered-result':
    'checksum mismatch expected sha256:abc got sha256:def Bearer sk-abcdefghijklmnopqrstuvwxyz123456',
  'expired-token':
    'refresh_token_not_found Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue',
  'db-error': 'postgres://admin:hunter2@db.internal:5432/sitepilot connection refused',
};

function erroringSupabase(): SupabaseLike {
  const response = { data: null, error: { message: 'permission denied', code: '42501' } };
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    single: () => query,
    then: (onfulfilled?: any, onrejected?: any): PromiseLike<any> =>
      Promise.resolve(response).then(onfulfilled, onrejected),
  };
  return {
    from: () => ({ select: () => query, insert: () => query, update: () => query }),
  };
}

function throwingSupabase(): SupabaseLike {
  return {
    from: () => {
      throw new Error('socket hang up: postgres://admin:hunter2@db.internal');
    },
  };
}

describe('E11-03 failure-injection suite', () => {
  it('defines exactly six scenarios, each with a typed code and one UI action', () => {
    expect(FAILURE_SCENARIOS).toEqual([
      'offline',
      'timeout',
      'fatal',
      'tampered-result',
      'expired-token',
      'db-error',
    ]);
    for (const kind of FAILURE_SCENARIOS) {
      const outcome = FAILURE_GUIDANCE[kind];
      expect(outcome.kind, kind).toBe(kind);
      expect(outcome.code, kind).toMatch(/^[A-Z_]+$/);
      expect(outcome.status, kind).toBeGreaterThanOrEqual(400);
      expect(outcome.message.length, kind).toBeGreaterThan(10);
      expect(outcome.action.length, kind).toBeGreaterThan(10);
      expect(typeof outcome.retryable, kind).toBe('boolean');
    }
    expect(guidanceFor('timeout')).toBe(FAILURE_GUIDANCE.timeout);
  });

  it('classifies every injected failure and never leaks the raw error', () => {
    for (const kind of FAILURE_SCENARIOS) {
      const classified = classifyFailure(kind, RAW[kind]);
      expect(classified.code, kind).toBe(FAILURE_GUIDANCE[kind].code);
      expect(classified.action, kind).toBe(FAILURE_GUIDANCE[kind].action);
      expect(classified.safeDetail === null || typeof classified.safeDetail === 'string', kind).toBe(true);
      const serialised = JSON.stringify(classified);
      for (const forbidden of [
        'hunter2',
        'sk-abcdefghijklmnopqrstuvwxyz',
        '/home/user',
        'Stack trace',
        'eyJhbGciOiJIUzI1NiJ9',
        'postgres://',
      ]) {
        expect(serialised.includes(forbidden), `${kind} leaked ${forbidden}`).toBe(false);
      }
    }
  });

  it('scrubs secrets, URLs, paths and stack frames from a diagnostic', () => {
    expect(scrubFailureDetail(new Error('boom\n at Object.<anonymous> (/home/user/a.js:1:1)'))).toBe('boom');
    expect(scrubFailureDetail('Bearer sk-abcdefghijklmnopqrstuvwxyz')).toBe('Bearer [redacted]');
    expect(scrubFailureDetail('https://user:pass@example.com/token')).toBe('[redacted-url]');
    expect(scrubFailureDetail(null)).toBe('');
    expect(scrubFailureDetail('x'.repeat(500))).toHaveLength(160);
  });

  it('offline: an injected repository failure produces a typed offline error', async () => {
    const repos = createRepositories(createInMemoryRepositoryClient({ failWith: 'network unreachable' }));
    const result = await repos.sites.listActive('00000000-0000-4000-8000-000000000001');
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('INJECTED_FAILURE');
    expect(guidanceForRepositoryError(result.error!).kind).toBe('offline');
  });

  it('db-error: a Supabase permission error stays typed', async () => {
    const result = await createSupabaseRepositoryClient(erroringSupabase()).read({ table: 'plans' });
    expect(result.error).toEqual({ code: '42501', message: 'permission denied' });
    expect(guidanceForRepositoryError(result.error!).kind).toBe('db-error');
  });

  it('offline: a thrown transport error is typed, not an exception', async () => {
    const result = await createSupabaseRepositoryClient(throwingSupabase()).read({ table: 'jobs' });
    expect(result.error?.code).toBe('REPOSITORY_ERROR');
    expect(guidanceForRepositoryError(result.error!).kind).toBe('offline');
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });

  it('expired-token: the session response maps to sign-in guidance', async () => {
    const response = sessionExpiredResponse();
    const payload = await response.json();
    expect(response.status).toBe(401);
    expect(payload.code).toBe('SESSION_EXPIRED');
    expect(guidanceFor('expired-token').status).toBe(401);
    expect(guidanceFor('expired-token').action).toContain('Sign in');
  });

  it('surfaces the same guidance to users on the troubleshooting page', () => {
    const page = fs.readFileSync(
      path.resolve(__dirname, '../src/app/docs/troubleshooting/page.tsx'),
      'utf8'
    );
    expect(page).toContain('FAILURE_SCENARIOS');
    expect(page).toContain('guidanceFor(kind)');
    expect(page).toContain('Injected failures');
    expect(page).toContain('Next action:');
  });

  it('tampered-result: a checksum mismatch blocks a retry and points at undo', () => {
    expect(checkReadBack('sha256:abc', 'sha256:abc')).toEqual({ ok: true });
    const mismatch = checkReadBack('sha256:abc', 'sha256:def');
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.kind).toBe('tampered-result');
      expect(mismatch.outcome.code).toBe('READ_BACK_MISMATCH');
      expect(mismatch.outcome.retryable).toBe(false);
      expect(mismatch.outcome.action).toContain('undo');
    }
  });
});

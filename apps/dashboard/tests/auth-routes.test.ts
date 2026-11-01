import { describe, expect, it } from 'vitest';
import { isPrivatePath, isSignedConnectorPath } from '../src/lib/auth/routes';

describe('signed connector paths', () => {
  it('lets a paired site reach the machine-to-machine endpoints', () => {
    for (const path of [
      '/api/connector/pair',
      '/api/connector/heartbeat',
      '/api/connector/unpair',
      '/api/connector/events',
      '/api/connector/jobs/claim',
      '/api/connector/jobs/33333333-3333-4333-8333-333333333333/result',
    ]) {
      expect(isSignedConnectorPath(path)).toBe(true);
    }
  });

  it('keeps every browser-facing connector route session-protected', () => {
    for (const path of [
      '/api/connector/jobs',
      '/api/connector/sites',
      '/api/connector/sites/33333333-3333-4333-8333-333333333333',
      '/api/connector/pairing-codes',
      '/api/connector/config',
      '/api/connector/plans',
      '/api/connector/plans/33333333-3333-4333-8333-333333333333/execute',
      '/api/connector/snapshots/33333333-3333-4333-8333-333333333333/undo',
    ]) {
      expect(isSignedConnectorPath(path)).toBe(false);
      expect(isPrivatePath(path)).toBe(true);
    }
  });

  it('does not accept a job result with a non-UUID id', () => {
    expect(isSignedConnectorPath('/api/connector/jobs/../result')).toBe(false);
    expect(isSignedConnectorPath('/api/connector/jobs/1/result')).toBe(false);
    expect(isSignedConnectorPath('/api/connector/jobs/claim/../claim')).toBe(false);
  });
});

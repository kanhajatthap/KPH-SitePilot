import { describe, expect, it } from 'vitest';
import { isPrivatePath, isPublicPagePath, isSafeStaticPath, isSignedConnectorPath } from '../src/lib/auth/routes';

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

  it('does not gate the public landing page or documentation', () => {
    for (const path of ['/', '/docs', '/docs/connector', '/docs/tools', '/docs/safety', '/docs/troubleshooting', '/docs/faq']) {
      expect(isPublicPagePath(path), path).toBe(true);
      expect(isPrivatePath(path), path).toBe(false);
    }
    expect(isPrivatePath('/api/connector/sites')).toBe(true);
  });

  it('serves connector ZIP downloads as safe static assets', () => {
    expect(isSafeStaticPath('/downloads/kph-sitepilot-connector.zip')).toBe(true);
    expect(isSafeStaticPath('/downloads/kph-sitepilot-connector-0.9.0.zip')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { loginPathWithNext, safeNextPath } from '../src/lib/auth/redirect';
import { isPublicApiPath, isPublicPagePath, shouldWatchSession } from '../src/lib/auth/routes';

describe('safeNextPath', () => {
  it('allows same-origin absolute paths with query and hash', () => {
    expect(safeNextPath('/projects?tab=active#top')).toBe('/projects?tab=active#top');
    expect(safeNextPath('/')).toBe('/');
  });

  it('blocks absolute URLs and protocol-relative URLs', () => {
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('http://evil.example/path')).toBe('/');
  });

  it('blocks backslash and control-character tricks', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('/\u0000evil')).toBe('/');
    expect(safeNextPath('/\tevil')).toBe('/');
  });

  it('blocks auth pages to prevent redirect loops', () => {
    expect(safeNextPath('/login')).toBe('/');
    expect(safeNextPath('/register?next=/projects')).toBe('/');
    expect(safeNextPath('/reset-password')).toBe('/');
  });

  it('rejects non-string and oversized input', () => {
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(42)).toBe('/');
    expect(safeNextPath(`/${'a'.repeat(3000)}`)).toBe('/');
  });

  it('encodes the return path when building a login URL', () => {
    expect(loginPathWithNext('/projects?tab=active')).toBe(
      `/login?next=${encodeURIComponent('/projects?tab=active')}`
    );
    expect(loginPathWithNext('//evil.example')).toBe('/login');
    expect(loginPathWithNext('/', 'session_expired')).toBe('/login?reason=session_expired');
  });
});

describe('route inventory', () => {
  it('keeps auth pages, the landing page and every docs page public', () => {
    for (const path of [
      '/login',
      '/register',
      '/forgot-password',
      '/reset-password',
      '/auth/confirm',
      '/auth/callback',
      '/',
      '/docs',
      '/docs/connector',
      '/docs/tools',
      '/docs/safety',
      '/docs/troubleshooting',
      '/docs/faq',
    ]) {
      expect(isPublicPagePath(path), path).toBe(true);
    }
    for (const path of ['/studio', '/connect', '/projects', '/settings/site', '/api/agent', '/dashboard']) {
      expect(isPublicPagePath(path), path).toBe(false);
    }
  });

  it('does not make unrelated paths public just because / and /docs are', () => {
    for (const path of ['/docsanything', '/documentation', '/api/docs', '//docs', '/settings/site']) {
      expect(isPublicPagePath(path), path).toBe(false);
    }
    // Nested docs pages are intentionally public; the connector guide is one.
    expect(isPublicPagePath('/docs/connector')).toBe(true);
  });

  it('keeps the session watcher on the workspace but off public pages', () => {
    expect(shouldWatchSession('/', true)).toBe(true); // workspace marks itself
    expect(shouldWatchSession('/', false)).toBe(false); // landing page does not
    expect(shouldWatchSession('/docs', false)).toBe(false);
    expect(shouldWatchSession('/docs/tools?risk=R2', false)).toBe(false);
    expect(shouldWatchSession('/login', false)).toBe(false);
    expect(shouldWatchSession('/studio', false)).toBe(true);
    expect(shouldWatchSession('/connect', true)).toBe(true);
  });

  it('keeps only health and session probe APIs public', () => {
    expect(isPublicApiPath('/api/health')).toBe(true);
    expect(isPublicApiPath('/api/auth/me')).toBe(true);
    expect(isPublicApiPath('/api/agent')).toBe(false);
    expect(isPublicApiPath('/api/mutate/apply')).toBe(false);
  });
});

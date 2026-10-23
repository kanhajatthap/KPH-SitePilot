import { describe, expect, it } from 'vitest';
import { loginPathWithNext, safeNextPath } from '../src/lib/auth/redirect';
import { isPublicApiPath, isPublicPagePath } from '../src/lib/auth/routes';

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
  it('keeps only authentication pages public', () => {
    for (const path of ['/login', '/register', '/forgot-password', '/reset-password', '/auth/confirm', '/auth/callback']) {
      expect(isPublicPagePath(path), path).toBe(true);
    }
    for (const path of ['/', '/projects', '/api/agent', '/dashboard']) {
      expect(isPublicPagePath(path), path).toBe(false);
    }
  });

  it('keeps only health and session probe APIs public', () => {
    expect(isPublicApiPath('/api/health')).toBe(true);
    expect(isPublicApiPath('/api/auth/me')).toBe(true);
    expect(isPublicApiPath('/api/agent')).toBe(false);
    expect(isPublicApiPath('/api/mutate/apply')).toBe(false);
  });
});

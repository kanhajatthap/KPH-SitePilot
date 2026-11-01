import { describe, expect, it, vi } from 'vitest';
import {
  confirmationRedirectUrl,
  emailRedirectTargets,
  normaliseOrigin,
  recoveryRedirectUrl,
  requestOriginFromHeaders,
  resolveSiteUrl,
} from '../src/lib/auth/site-url';

function headers(map: Record<string, string>) {
  const lowered = new Map(Object.entries(map).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name: string) => lowered.get(name.toLowerCase()) ?? null };
}

describe('site URL resolution for auth emails', () => {
  it('prefers explicit configuration over every platform hint', () => {
    const resolved = resolveSiteUrl({
      env: {
        NEXT_PUBLIC_SITE_URL: 'https://kph-sitepilot.vercel.app/',
        VERCEL_PROJECT_PRODUCTION_URL: 'other.vercel.app',
        VERCEL_URL: 'preview-123.vercel.app',
      },
      requestOrigin: 'https://third-party.example',
      production: true,
    });

    expect(resolved.url).toBe('https://kph-sitepilot.vercel.app');
    expect(resolved.source).toBe('configured');
    expect(resolved.trusted).toBe(true);
    expect(resolved.warnings).toEqual([]);
  });

  it('falls back to the Vercel deployment origin when no URL is configured', () => {
    const resolved = resolveSiteUrl({
      env: { VERCEL_URL: 'kph-sitepilot-abc.vercel.app' },
      production: true,
    });

    expect(resolved.url).toBe('https://kph-sitepilot-abc.vercel.app');
    expect(resolved.source).toBe('vercel-deployment');
    expect(resolved.secure).toBe(true);
  });

  it('never returns localhost on a deployment that knows its own host', () => {
    const resolved = resolveSiteUrl({
      env: { VERCEL_PROJECT_PRODUCTION_URL: 'kph-sitepilot.vercel.app' },
      requestOrigin: 'https://kph-sitepilot.vercel.app',
      production: true,
    });

    expect(resolved.url).not.toContain('localhost');
    expect(emailRedirectTargets(resolved.url).confirm).toBe('https://kph-sitepilot.vercel.app/auth/confirm');
  });

  it('accepts the request origin only from an allowlisted host', () => {
    expect(requestOriginFromHeaders(headers({ host: 'kph-sitepilot.vercel.app', 'x-forwarded-proto': 'https' }))).toBe(
      'https://kph-sitepilot.vercel.app'
    );
    expect(requestOriginFromHeaders(headers({ 'x-forwarded-host': 'preview-1.vercel.app', 'x-forwarded-proto': 'https' }))).toBe(
      'https://preview-1.vercel.app'
    );
    expect(requestOriginFromHeaders(headers({ host: 'localhost:3002', 'x-forwarded-proto': 'http' }))).toBe(
      'http://localhost:3002'
    );

    // A spoofed Host header must never become an email link target.
    expect(requestOriginFromHeaders(headers({ host: 'evil.example', 'x-forwarded-proto': 'https' }))).toBeNull();
    expect(requestOriginFromHeaders(headers({ host: 'vercel.app.evil.example' }))).toBeNull();
    expect(requestOriginFromHeaders(headers({ host: 'kph-sitepilot.vercel.app', 'x-forwarded-proto': 'javascript' }))).toBeNull();
    expect(requestOriginFromHeaders(null)).toBeNull();
  });

  it('warns loudly when production would link to loopback', () => {
    const resolved = resolveSiteUrl({ env: { NEXT_PUBLIC_SITE_URL: 'http://localhost:3002' }, production: true });

    expect(resolved.url).toBe('http://localhost:3002');
    expect(resolved.secure).toBe(false);
    expect(resolved.warnings.join(' ')).toMatch(/loopback origin in production/);
    expect(resolved.warnings.join(' ')).toMatch(/not HTTPS/);
  });

  it('reports the localhost fallback as untrusted', () => {
    const resolved = resolveSiteUrl({ env: {}, production: false });

    expect(resolved.source).toBe('fallback');
    expect(resolved.url).toBe('http://localhost:3002');
    expect(resolved.trusted).toBe(false);
    expect(resolved.warnings[0]).toMatch(/No public site URL is configured/);
  });

  it('builds redirect targets without leaking a path or credentials', () => {
    expect(normaliseOrigin('https://user:pass@example.com')).toBeNull();
    expect(normaliseOrigin('ftp://example.com')).toBeNull();
    expect(normaliseOrigin('kph-sitepilot.vercel.app/some/path')).toBe('https://kph-sitepilot.vercel.app');

    expect(confirmationRedirectUrl('https://kph-sitepilot.vercel.app', '/projects?tab=active')).toBe(
      'https://kph-sitepilot.vercel.app/auth/confirm?next=%2Fprojects%3Ftab%3Dactive'
    );
    expect(confirmationRedirectUrl('https://kph-sitepilot.vercel.app', '/')).toBe(
      'https://kph-sitepilot.vercel.app/auth/confirm'
    );
    expect(recoveryRedirectUrl('https://kph-sitepilot.vercel.app')).toBe(
      'https://kph-sitepilot.vercel.app/auth/confirm?next=%2Freset-password'
    );

    // The `type` parameter stays out of the URL: Supabase appends its own and a
    // duplicate would make verifyOtp read the wrong token type.
    expect(confirmationRedirectUrl('https://kph-sitepilot.vercel.app', '/')).not.toContain('type=');
  });
});

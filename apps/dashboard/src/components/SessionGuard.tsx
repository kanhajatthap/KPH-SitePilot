'use client';

import { useEffect } from 'react';
import { isPublicPagePath } from '../lib/auth/routes';

interface SessionGuardProps {
  enabled: boolean;
}

/**
 * Watches the auth session while the workspace is open.
 *
 * Server-side middleware already blocks page loads. This covers the long-lived
 * client case: a session that expires or is revoked while the tab stays open is
 * detected on focus and every minute, then the user is sent to /login with a
 * safe return path.
 */
export function SessionGuard({ enabled }: SessionGuardProps) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const check = async () => {
      if (isPublicPagePath(window.location.pathname)) return;

      try {
        const response = await fetch('/api/auth/me', {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (cancelled || response.status !== 401) return;

        const next = `${window.location.pathname}${window.location.search}`;
        const params = new URLSearchParams({ reason: 'session_expired' });
        if (next && next !== '/') params.set('next', next);
        window.location.assign(`/login?${params.toString()}`);
      } catch {
        // Network hiccups are not proof of an expired session.
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return null;
}

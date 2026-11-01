/**
 * Small in-memory sliding-window limiter for the public pairing endpoint.
 *
 * Pairing is a low-volume, high-value operation: a fixed cap per client is
 * enough to stop code guessing, and keeping it in memory avoids a database
 * round-trip on every attempt. Multi-instance deployments get a per-instance
 * budget, which is acceptable because codes expire after ten minutes.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, number[]>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export function checkPairingRateLimit(key: string, now = Date.now()): RateLimitResult {
  const recent = (attempts.get(key) ?? []).filter((stamp) => now - stamp < WINDOW_MS);

  if (recent.length >= MAX_ATTEMPTS) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    attempts.set(key, recent);
    return { ok: false, retryAfterSeconds };
  }

  recent.push(now);
  attempts.set(key, recent);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (attempts.size > 5_000) {
    for (const [candidate, stamps] of attempts) {
      if (stamps.every((stamp) => now - stamp >= WINDOW_MS)) attempts.delete(candidate);
    }
  }

  return { ok: true, remaining: MAX_ATTEMPTS - recent.length };
}

/** Resets the limiter (tests only). */
export function resetPairingRateLimit(): void {
  attempts.clear();
}

/** Best-effort client identity for rate limiting. */
export function clientIpFrom(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  const realIp = req.headers.get('x-real-ip');
  return realIp?.trim() || 'unknown';
}

/* -------------------------------------------------------------------------- */
/* Signed connector traffic: per-site budget                                  */
/* -------------------------------------------------------------------------- */

const CONNECTOR_WINDOW_MS = 60_000;
const CONNECTOR_MAX_REQUESTS = 240;

const connectorHits = new Map<string, number[]>();

/**
 * Per-site request budget for signed connector calls.
 *
 * A connector polls once a minute, plus immediate polls after a job, so 240
 * requests/minute leaves plenty of headroom while stopping a runaway loop from
 * exhausting the free tier.
 */
export function checkConnectorRateLimit(key: string, now = Date.now()): RateLimitResult {
  const recent = (connectorHits.get(key) ?? []).filter((stamp) => now - stamp < CONNECTOR_WINDOW_MS);

  if (recent.length >= CONNECTOR_MAX_REQUESTS) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((CONNECTOR_WINDOW_MS - (now - oldest)) / 1000));
    connectorHits.set(key, recent);
    return { ok: false, retryAfterSeconds };
  }

  recent.push(now);
  connectorHits.set(key, recent);

  if (connectorHits.size > 2_000) {
    for (const [candidate, stamps] of connectorHits) {
      if (stamps.every((stamp) => now - stamp >= CONNECTOR_WINDOW_MS)) connectorHits.delete(candidate);
    }
  }

  return { ok: true, remaining: CONNECTOR_MAX_REQUESTS - recent.length };
}

/** Resets the connector limiter (tests only). */
export function resetConnectorRateLimit(): void {
  connectorHits.clear();
}

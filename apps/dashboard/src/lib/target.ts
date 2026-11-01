/**
 * Target-site URL policy.
 *
 * Hosted SitePilot connects to **any** WordPress site the signed-in user has
 * paired. Ownership is enforced by `authorizeTargetSite` against the connector
 * `sites` table, so this module only answers two narrow questions:
 *
 *   1. is the URL structurally safe (http/https, no embedded credentials)?
 *   2. is it an address the platform must never call, even for an owned site
 *      (cloud metadata endpoints)?
 *
 * In local mode (no Supabase configured) the original localhost/LocalWP-only
 * restriction is preserved, because there is no account to prove ownership.
 */

export const LOCAL_TARGET_PATTERNS = [
  /^https?:\/\/[a-z0-9-_.]+\.local(:\d+)?$/i,
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
];

/** Addresses that are never a legitimate WordPress site, owned or not. */
export const BLOCKED_TARGET_PATTERNS = [
  /^https?:\/\/169\.254\.169\.254(:\d+)?$/i,
  /^https?:\/\/metadata\.google\.internal(:\d+)?$/i,
  /^https?:\/\/\[fd00:ec2::254\](:\d+)?$/i,
];

export function isLocalOrigin(origin: string): boolean {
  return LOCAL_TARGET_PATTERNS.some((pattern) => pattern.test(origin));
}

export function isBlockedOrigin(origin: string): boolean {
  return BLOCKED_TARGET_PATTERNS.some((pattern) => pattern.test(origin));
}

export interface TargetPolicyOptions {
  /** Hosted deployments allow any owned site; local mode stays localhost-only. */
  saasMode: boolean;
}

/** Decides whether a request may be sent to this origin at all. */
export function isTargetAllowed(origin: string, { saasMode }: TargetPolicyOptions): boolean {
  if (isBlockedOrigin(origin)) return false;
  if (!saasMode) return isLocalOrigin(origin);
  return true;
}

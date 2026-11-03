/**
 * Pure state helpers for the three-step onboarding wizard.
 *
 * The page owns the fetch/poll loop; everything that decides *what the wizard
 * believes* lives here so it can be unit-tested without a browser, a network
 * or a mock server.
 */

export type WizardStep = 1 | 2 | 3;
export type SiteProgress = 'waiting' | 'found' | 'scanning' | 'ready';

export interface WizardSite {
  id: string;
  name: string;
  url: string;
  status: string;
  plugin_version: string | null;
  wp_version: string | null;
  capabilities: Record<string, unknown> | null;
  last_seen_at: string | null;
}

/** Only the step is persisted. A pairing code is single-use and never stored. */
export const WIZARD_STORAGE_KEY = 'sitepilot.onboarding.step';

export const POLL_INTERVAL_MS = 3_000;
/** Stop asking for a capability manifest after this long — a live site is enough. */
export const SCAN_GRACE_MS = 45_000;
/** Give up waiting for a first heartbeat and offer recovery. */
export const MAX_WAIT_MS = 180_000;

export function parseStoredStep(raw: string | null | undefined): WizardStep {
  const value = (raw ?? '').trim();
  if (value === '2') return 2;
  if (value === '3') return 3;
  return 1;
}

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function hasCapabilityManifest(capabilities: unknown): boolean {
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return false;
  return Object.keys(capabilities as Record<string, unknown>).length > 0;
}

/**
 * Finds the site the user just paired, ignoring every site that already existed
 * when the wizard opened. Active sites win over paused/offline ones.
 */
export function findNewSite(sites: WizardSite[], baselineIds: readonly string[]): WizardSite | null {
  const baseline = new Set(baselineIds);
  const fresh = sites.filter((site) => site && typeof site.id === 'string' && !baseline.has(site.id));
  if (fresh.length === 0) return null;
  return fresh.find((site) => site.status === 'active') ?? fresh[0];
}

/**
 * Step 3 has four honest states. A live site is "ready" as soon as its
 * capability manifest arrives; after `SCAN_GRACE_MS` we stop waiting for the
 * manifest rather than holding the user hostage to a slow heartbeat.
 */
export function siteProgress(site: WizardSite | null, elapsedMs: number): SiteProgress {
  if (!site) return 'waiting';
  if (site.status !== 'active') return 'found';
  if (hasCapabilityManifest(site.capabilities)) return 'ready';
  if (elapsedMs >= SCAN_GRACE_MS) return 'ready';
  return 'scanning';
}

export function shouldStopWaiting(elapsedMs: number): boolean {
  return elapsedMs >= MAX_WAIT_MS;
}

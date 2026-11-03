import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STEPS,
  describeDeploymentIssue,
  describeOnboardingFailure,
  describeSiteState,
  describeWaitTimeout,
} from '../src/lib/onboarding/errors';
import {
  MAX_WAIT_MS,
  SCAN_GRACE_MS,
  findNewSite,
  formatCountdown,
  hasCapabilityManifest,
  parseStoredStep,
  shouldStopWaiting,
  siteProgress,
  type WizardSite,
} from '../src/lib/onboarding/wizard';

function site(overrides: Partial<WizardSite> = {}): WizardSite {
  return {
    id: 'site-1',
    name: 'My Blog',
    url: 'https://example.test',
    status: 'active',
    plugin_version: '1.0.0',
    wp_version: '6.8',
    capabilities: null,
    last_seen_at: null,
    ...overrides,
  };
}

describe('onboarding wizard pure state', () => {
  it('exposes exactly three ordered steps', () => {
    expect(ONBOARDING_STEPS.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(ONBOARDING_STEPS.every((entry) => entry.title && entry.hint)).toBe(true);
  });

  it('restores only valid steps from session storage', () => {
    expect(parseStoredStep(null)).toBe(1);
    expect(parseStoredStep(undefined)).toBe(1);
    expect(parseStoredStep('')).toBe(1);
    expect(parseStoredStep('1')).toBe(1);
    expect(parseStoredStep(' 2 ')).toBe(2);
    expect(parseStoredStep('3')).toBe(3);
    expect(parseStoredStep('4')).toBe(1);
    expect(parseStoredStep('garbage')).toBe(1);
  });

  it('formats a pairing-code countdown safely', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-30)).toBe('0:00');
    expect(formatCountdown(Number.NaN)).toBe('0:00');
  });

  it('recognises a real capability manifest, not empty shapes', () => {
    expect(hasCapabilityManifest(null)).toBe(false);
    expect(hasCapabilityManifest({})).toBe(false);
    expect(hasCapabilityManifest([])).toBe(false);
    expect(hasCapabilityManifest('nope')).toBe(false);
    expect(hasCapabilityManifest({ theme: 'twentytwentyfive' })).toBe(true);
  });

  it('finds only the newly paired site and prefers an active one', () => {
    const existing = site({ id: 'old' });
    const offline = site({ id: 'new-offline', status: 'offline' });
    const active = site({ id: 'new-active', status: 'active' });

    expect(findNewSite([], [])).toBeNull();
    expect(findNewSite([existing], ['old'])).toBeNull();
    expect(findNewSite([existing, offline, active], ['old'])?.id).toBe('new-active');
    expect(findNewSite([existing, offline], ['old'])?.id).toBe('new-offline');
  });

  it('moves through waiting → found → scanning → ready', () => {
    expect(siteProgress(null, 0)).toBe('waiting');
    expect(siteProgress(site({ status: 'offline' }), 0)).toBe('found');
    expect(siteProgress(site(), 0)).toBe('scanning');
    expect(siteProgress(site({ capabilities: { theme: 'x' } }), 0)).toBe('ready');
    expect(siteProgress(site(), SCAN_GRACE_MS)).toBe('ready');
    expect(siteProgress(site(), SCAN_GRACE_MS - 1)).toBe('scanning');
  });

  it('stops waiting only after the configured ceiling', () => {
    expect(shouldStopWaiting(0)).toBe(false);
    expect(shouldStopWaiting(MAX_WAIT_MS - 1)).toBe(false);
    expect(shouldStopWaiting(MAX_WAIT_MS)).toBe(true);
  });
});

describe('onboarding error surfaces — one action each', () => {
  it('names a network failure and offers a retry', () => {
    const result = describeOnboardingFailure({ network: true });
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.action).toEqual({ kind: 'retry', label: 'Retry' });
  });

  it('sends an expired session to sign-in with the wizard as the return path', () => {
    const byStatus = describeOnboardingFailure({ status: 401, message: 'ignored' });
    const byCode = describeOnboardingFailure({ code: 'SESSION_EXPIRED' });
    expect(byStatus.code).toBe('SIGN_IN_REQUIRED');
    expect(byCode.code).toBe('SIGN_IN_REQUIRED');
    expect(byStatus.action).toMatchObject({ kind: 'link', href: '/login?next=%2Fonboarding' });
  });

  it('points a half-configured deployment at the setup guide', () => {
    const result = describeOnboardingFailure({ code: 'CONFIG_MISSING', status: 503 });
    expect(result.code).toBe('DEPLOYMENT_NOT_READY');
    expect(result.action).toMatchObject({ kind: 'link', href: '/docs/connector' });
  });

  it('offers a fresh code when the pairing code expired or was used', () => {
    for (const code of ['PAIRING_CODE_EXPIRED', 'PAIRING_CODE_USED', 'PAIRING_CODE_INVALID']) {
      const result = describeOnboardingFailure({ code });
      expect(result.code).toBe('CODE_UNUSABLE');
      expect(result.action.kind).toBe('regenerate');
    }
  });

  it('asks the user to wait on a rate limit', () => {
    expect(describeOnboardingFailure({ status: 429 }).action.kind).toBe('wait');
    expect(describeOnboardingFailure({ code: 'RATE_LIMIT_EXCEEDED' }).action.kind).toBe('wait');
  });

  it('retries a 5xx and always gives an action for an unknown failure', () => {
    expect(describeOnboardingFailure({ status: 503 }).action.kind).toBe('retry');
    const unknown = describeOnboardingFailure({ status: 418, message: 'teapot' });
    expect(unknown.code).toBe('UNKNOWN_ERROR');
    expect(unknown.detail).toContain('teapot');
    expect(unknown.action.kind).toBe('retry');
  });

  it('never echoes key material or stack frames into the UI', () => {
    const leaked = describeOnboardingFailure({
      message: 'failed at handler (src/lib/secret.ts:42) with key re_abcdefgh1234',
    });
    expect(leaked.detail).toBe('The deployment returned an unexpected response. Try again.');
    expect(JSON.stringify(leaked)).not.toContain('re_abcdefgh1234');
    expect(JSON.stringify(leaked)).not.toContain('secret.ts');
  });

  it('joins deployment hints without losing the one action', () => {
    const result = describeDeploymentIssue(['Sign-in is not configured.', 'Encryption key missing.']);
    expect(result.detail).toContain('Sign-in is not configured.');
    expect(result.detail).toContain('Encryption key missing.');
    expect(result.action.kind).toBe('link');
  });

  it('maps every non-active site status to exactly one action', () => {
    expect(describeSiteState({ status: 'active' })).toBeNull();
    expect(describeSiteState({ name: 'My Blog', status: 'offline' })).toMatchObject({
      code: 'SITE_OFFLINE',
      action: { kind: 'refresh' },
    });
    expect(describeSiteState({ status: 'paused' })?.action.kind).toBe('link');
    expect(describeSiteState({ status: 'revoked' })?.action.kind).toBe('regenerate');
    expect(describeSiteState({ status: 'weird' })?.action.kind).toBe('refresh');
  });

  it('turns a silent three-minute wait into a concrete recovery step', () => {
    const result = describeWaitTimeout();
    expect(result.code).toBe('NO_SITE_CHECKED_IN');
    expect(result.action.kind).toBe('regenerate');
  });

  it('maps the connected-sites error taxonomy used outside the wizard', () => {
    expect(
      describeOnboardingFailure({ status: 503, code: 'CONNECTOR_STORAGE_UNAVAILABLE' }).code
    ).toBe('DEPLOYMENT_NOT_READY');
    expect(describeOnboardingFailure({ code: 'SITE_ALREADY_CONNECTED' })).toMatchObject({
      code: 'ALREADY_CONNECTED',
      action: { kind: 'link', href: '/connect' },
    });
    expect(describeOnboardingFailure({ code: 'PROJECT_NOT_FOUND' }).action.kind).toBe('refresh');
    expect(describeOnboardingFailure({ code: 'SITE_NOT_ACTIVE' }).action.kind).toBe('link');
    expect(describeOnboardingFailure({ code: 'TOOL_NOT_ALLOWED' }).action.kind).toBe('retry');
  });

  it('keeps a plain-language fallback when deployment hints are empty', () => {
    const result = describeDeploymentIssue([]);
    expect(result.detail).toContain('Nothing is wrong on the WordPress side');
    expect(result.action.kind).toBe('link');
  });

  it('does not print an empty site name', () => {
    expect(describeSiteState({ name: '   ', status: 'offline' })?.title).toContain('This site');
  });
});

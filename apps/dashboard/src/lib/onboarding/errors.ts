/**
 * One-action error surfaces for the first-run wizard (E9-03 / E9-14).
 *
 * The connector has a wide error taxonomy (`PAIRING_CODE_EXPIRED`,
 * `STORAGE_UNAVAILABLE`, `SITE_PAUSED`, 429s, …). A wizard that prints those
 * raw strings gives the user nothing to do. Every failure here is mapped to a
 * plain-language title, an honest detail and **exactly one** next action —
 * a retry, a fresh code, a link, or a deliberate wait.
 *
 * All of this is pure and dependency-free so it can be tested without a DOM.
 * Server messages are sanitised: stack traces, file paths and key prefixes
 * never reach the screen.
 */

export type OnboardingIssueTone = 'error' | 'warning' | 'info';

export type OnboardingAction =
  | { kind: 'retry'; label: string }
  | { kind: 'regenerate'; label: string }
  | { kind: 'refresh'; label: string }
  | { kind: 'wait'; label: string }
  | { kind: 'link'; label: string; href: string };

export interface OnboardingIssue {
  /** Stable, UI-safe code shown in small print for support. */
  code: string;
  title: string;
  detail: string;
  action: OnboardingAction;
  tone: OnboardingIssueTone;
}

export interface FailureInput {
  status?: number | null;
  /** API `error` / `code` field, not the human message. */
  code?: string | null;
  message?: string | null;
  /** The fetch itself threw (offline, DNS, CORS). */
  network?: boolean;
}

export const ONBOARDING_STEPS = [
  { id: 1, title: 'Install the plugin', hint: 'Download & activate the connector ZIP' },
  { id: 2, title: 'Pair your site', hint: 'Create a single-use 10-minute code' },
  { id: 3, title: 'Verify & scan', hint: 'Wait for the first heartbeat' },
] as const;

const MAX_DETAIL_LENGTH = 240;

/** Never echo a stack frame, an internal path or a key prefix into the UI. */
function safeDetail(message: string | null | undefined, fallback: string): string {
  const trimmed = (message ?? '').trim();
  if (!trimmed) return fallback;
  if (/\beyJ|sk-or-|gsk_|re_[A-Za-z0-9]{8,}|\bat\s+\w+\s*\(|\n|\.ts:\d+/.test(trimmed)) {
    return fallback;
  }
  return trimmed.slice(0, MAX_DETAIL_LENGTH);
}

function issue(
  code: string,
  title: string,
  detail: string,
  action: OnboardingAction,
  tone: OnboardingIssueTone = 'error'
): OnboardingIssue {
  return { code, title, detail, action, tone };
}

/**
 * Maps an API/network failure to one action. The order matters: a network
 * failure has no response to inspect, and a 401 must beat any generic 5xx.
 */
export function describeOnboardingFailure(input: FailureInput): OnboardingIssue {
  const code = (input.code ?? '').toUpperCase();
  const detail = safeDetail(input.message, 'Try again in a moment.');
  const status = input.status ?? null;

  if (input.network) {
    return issue(
      'NETWORK_ERROR',
      'Cannot reach SitePilot',
      'Your browser could not reach the deployment. Check your connection and try again.',
      { kind: 'retry', label: 'Retry' }
    );
  }

  if (status === 401 || code === 'SESSION_EXPIRED' || code === 'UNAUTHORIZED' || code === 'CONNECTOR_REQUIRES_ACCOUNT') {
    return issue(
      'SIGN_IN_REQUIRED',
      'Sign in to continue',
      'Your session expired, or hosted pairing needs an account. Sign in again — the wizard keeps your place.',
      { kind: 'link', label: 'Sign in again', href: '/login?next=%2Fonboarding' },
      'warning'
    );
  }

  if (
    code === 'CONFIG_MISSING' ||
    code === 'STORAGE_UNAVAILABLE' ||
    code === 'CONNECTOR_STORAGE_UNAVAILABLE' ||
    code === 'ENCRYPTION_UNAVAILABLE' ||
    code === 'SECRET_UNAVAILABLE' ||
    code === 'PLAN_STORAGE_UNAVAILABLE'
  ) {
    return issue(
      'DEPLOYMENT_NOT_READY',
      'This deployment cannot pair sites yet',
      detail === 'Try again in a moment.'
        ? 'A server-side setting is missing on the deployment. Nothing is wrong on the WordPress side.'
        : detail,
      { kind: 'link', label: 'Open setup guide', href: '/docs/connector' },
      'warning'
    );
  }

  if (code === 'PAIRING_CODE_EXPIRED' || code === 'PAIRING_CODE_USED' || code === 'PAIRING_CODE_INVALID') {
    return issue(
      'CODE_UNUSABLE',
      'That pairing code cannot be used',
      detail === 'Try again in a moment.'
        ? 'Codes are single-use and expire after ten minutes. Generate a new one.'
        : detail,
      { kind: 'regenerate', label: 'Generate a new code' },
      'warning'
    );
  }

  if (code === 'RATE_LIMIT_EXCEEDED' || status === 429) {
    return issue(
      'RATE_LIMITED',
      'Too many attempts',
      'The deployment is protecting itself from repeated requests. Wait a minute, then try again.',
      { kind: 'wait', label: 'Wait, then try again' },
      'warning'
    );
  }

  if (code === 'SITE_ALREADY_CONNECTED') {
    return issue(
      'ALREADY_CONNECTED',
      'This site is already connected',
      'Open the connected-sites page to manage it instead of pairing it twice.',
      { kind: 'link', label: 'View connected sites', href: '/connect' },
      'info'
    );
  }

  if (code === 'SITE_NOT_ACTIVE' || code === 'SITE_PAUSED' || code === 'SITE_REVOKED' || code === 'SITE_OFFLINE') {
    return issue(
      'SITE_UNAVAILABLE',
      'The site is not available right now',
      detail === 'Try again in a moment.' ? 'Resume or reconnect it on the connected-sites page.' : detail,
      { kind: 'link', label: 'Open connected sites', href: '/connect' },
      'warning'
    );
  }

  if (code === 'PROJECT_NOT_FOUND' || code === 'PROJECT_MISMATCH' || code === 'PROJECT_REQUIRED') {
    return issue(
      'PROJECT_MISSING',
      'Project workspace not found',
      'Reload your projects, then create a fresh pairing code.',
      { kind: 'refresh', label: 'Reload projects' }
    );
  }

  if (status === 503 || (typeof status === 'number' && status >= 500) || code === 'INTERNAL_ERROR') {
    return issue(
      'SERVICE_UNAVAILABLE',
      'The service is temporarily unavailable',
      detail === 'Try again in a moment.' ? 'The deployment could not complete the request. Retry shortly.' : detail,
      { kind: 'retry', label: 'Retry' }
    );
  }

  if (code === 'VALIDATION_FAILED' || code === 'TOOL_NOT_ALLOWED' || code === 'WRITE_REQUIRES_PLAN') {
    return issue('REQUEST_REJECTED', 'That request was rejected', detail, { kind: 'retry', label: 'Try again' });
  }

  return issue(
    'UNKNOWN_ERROR',
    'Something went wrong',
    detail === 'Try again in a moment.' ? 'The deployment returned an unexpected response. Try again.' : detail,
    { kind: 'retry', label: 'Retry' }
  );
}

/** `GET /api/connector/config` says the platform itself is misconfigured. */
export function describeDeploymentIssue(hints: string[]): OnboardingIssue {
  const clean = hints
    .map((hint) => safeDetail(hint, ''))
    .filter(Boolean)
    .join(' ');
  return issue(
    'DEPLOYMENT_NOT_READY',
    'This deployment cannot pair sites yet',
    clean || 'Sign-in, storage or encryption is missing on the deployment. Nothing is wrong on the WordPress side.',
    { kind: 'link', label: 'Open setup guide', href: '/docs/connector' },
    'warning'
  );
}

/** A site appeared but is offline / paused / revoked — one action each. */
export function describeSiteState(site: { name?: string; status: string }): OnboardingIssue | null {
  const name = site.name?.trim() || 'This site';
  if (site.status === 'active') return null;

  if (site.status === 'offline') {
    return issue(
      'SITE_OFFLINE',
      `${name} has not checked in`,
      'Make sure the connector plugin is active and the site can reach this deployment. It polls every minute.',
      { kind: 'refresh', label: 'Check again' },
      'warning'
    );
  }
  if (site.status === 'paused') {
    return issue(
      'SITE_PAUSED',
      `${name} is paused`,
      'Resume it on the connected-sites page before opening Studio.',
      { kind: 'link', label: 'Open connected sites', href: '/connect' },
      'warning'
    );
  }
  if (site.status === 'revoked') {
    return issue(
      'SITE_REVOKED',
      `${name} was disconnected`,
      'Its credentials no longer work. Generate a new pairing code and pair it again.',
      { kind: 'regenerate', label: 'Generate a new code' },
      'warning'
    );
  }
  return issue(
    'SITE_STATUS_UNKNOWN',
    `${name} is not ready yet`,
    `The site reports status “${site.status}”. Check the connector status page in WordPress.`,
    { kind: 'refresh', label: 'Check again' },
    'warning'
  );
}

/** Three minutes with no heartbeat: stop guessing and offer a fresh code. */
export function describeWaitTimeout(): OnboardingIssue {
  return issue(
    'NO_SITE_CHECKED_IN',
    'No site has checked in yet',
    'Check that the plugin is active and the code was pasted into SitePilot → Connect. Codes expire after ten minutes.',
    { kind: 'regenerate', label: 'Generate a new code' },
    'warning'
  );
}

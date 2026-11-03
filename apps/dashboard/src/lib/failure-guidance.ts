/**
 * E11-03 — typed failure-injection outcomes with UI guidance.
 *
 * Every injected failure (offline, timeout, fatal plugin error, tampered
 * result, expired token, database error) resolves to one stable code, an HTTP
 * status and ONE next action the UI can show. Raw transport/DB details are
 * scrubbed before they ever reach a rendered message: no stack frames, no
 * connection strings, no tokens.
 */

export type FailureKind =
  | 'offline'
  | 'timeout'
  | 'fatal'
  | 'tampered-result'
  | 'expired-token'
  | 'db-error';

export interface FailureOutcome {
  kind: FailureKind;
  code: string;
  status: number;
  message: string;
  action: string;
  retryable: boolean;
}

export const FAILURE_SCENARIOS: readonly FailureKind[] = [
  'offline',
  'timeout',
  'fatal',
  'tampered-result',
  'expired-token',
  'db-error',
];

export const FAILURE_GUIDANCE: Record<FailureKind, FailureOutcome> = {
  offline: {
    kind: 'offline',
    code: 'SITE_OFFLINE',
    status: 503,
    message: 'The WordPress site is not reachable.',
    action: 'Check the site URL and plugin status, then retry the read.',
    retryable: true,
  },
  timeout: {
    kind: 'timeout',
    code: 'SITE_TIMEOUT',
    status: 504,
    message: 'The connector took too long to answer.',
    action: 'Retry once; if it repeats, check the site host load.',
    retryable: true,
  },
  fatal: {
    kind: 'fatal',
    code: 'PLUGIN_FATAL',
    status: 502,
    message: 'The connector reported a fatal plugin error.',
    action: 'Update the connector plugin, then re-run the plan.',
    retryable: false,
  },
  'tampered-result': {
    kind: 'tampered-result',
    code: 'READ_BACK_MISMATCH',
    status: 409,
    message: 'Read-back verification did not match the snapshot.',
    action: 'Do not retry the write — use the one-click undo and inspect the diff.',
    retryable: false,
  },
  'expired-token': {
    kind: 'expired-token',
    code: 'SESSION_EXPIRED',
    status: 401,
    message: 'Your session expired.',
    action: 'Sign in again; the plan is kept safe.',
    retryable: false,
  },
  'db-error': {
    kind: 'db-error',
    code: 'STORAGE_ERROR',
    status: 503,
    message: 'Saved state could not be read or written.',
    action: 'Retry shortly; nothing was written to WordPress without a snapshot.',
    retryable: true,
  },
};

export function guidanceFor(kind: FailureKind): FailureOutcome {
  return FAILURE_GUIDANCE[kind];
}

/** Maps a repository error code to the right user-facing failure kind. */
export function guidanceForRepositoryError(error: {
  code: string;
  message: string;
}): FailureOutcome {
  if (error.code === 'INJECTED_FAILURE' || error.code === 'REPOSITORY_ERROR') {
    return FAILURE_GUIDANCE.offline;
  }
  if (
    error.code === 'OWNERSHIP_UNAVAILABLE' ||
    error.code === 'SUPABASE_ERROR' ||
    /^(?:[0-9]{5}|PGRST|08|53|57)/.test(error.code)
  ) {
    return FAILURE_GUIDANCE['db-error'];
  }
  return FAILURE_GUIDANCE.fatal;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+\S+/gi, 'Bearer [redacted]'],
  [/sk-[A-Za-z0-9_-]{16,}/gi, '[redacted]'],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted]'],
  [/(?:postgres|mysql|https?):\/\/[^\s"']+/gi, '[redacted-url]'],
  [/\/home\/[^\s"']+/g, '[redacted-path]'],
  [/\/Users\/[^\s"']+/g, '[redacted-path]'],
];

/** First line only, secrets removed, paths removed, length capped. */
export function scrubFailureDetail(raw: unknown): string {
  let text: string;
  if (typeof raw === 'string') text = raw;
  else if (raw instanceof Error) text = raw.message;
  else if (raw === null || raw === undefined) text = '';
  else text = String(raw);

  const firstLine = text.split(/\r?\n/)[0].replace(/\s+at\s+.+$/, '').trim();
  let safe = firstLine;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    safe = safe.replace(pattern, replacement);
  }
  return safe.slice(0, 160);
}

/**
 * Read-back verification is the guard against a tampered or partial result.
 * A mismatch is a typed `tampered-result`, never a silent success.
 */
export function checkReadBack(
  expected: string,
  actual: string
): { ok: true } | { ok: false; kind: 'tampered-result'; outcome: FailureOutcome } {
  return expected === actual
    ? { ok: true }
    : { ok: false, kind: 'tampered-result', outcome: FAILURE_GUIDANCE['tampered-result'] };
}

export interface ClassifiedFailure extends FailureOutcome {
  /** Scrubbed, optional diagnostic detail — never the raw error. */
  safeDetail: string | null;
}

export function classifyFailure(kind: FailureKind, raw?: unknown): ClassifiedFailure {
  const detail = scrubFailureDetail(raw);
  return { ...FAILURE_GUIDANCE[kind], safeDetail: detail.length > 0 ? detail : null };
}

/**
 * View model for the assistant turn (E9-05).
 *
 * The React component is a thin renderer over `buildAssistantTurnView`, so all
 * six turn states — planning, running, waiting, completed, failed, cancelled —
 * can be asserted without a DOM, a browser or a snapshot serializer. Durations
 * come from the task's own `startedAt` / `finishedAt` timestamps; retries are
 * counted from repeated tool calls rather than invented.
 */

import type { AgentExecutionTask, TaskStatus, TaskStep } from '@wp-agent/contracts';

export type TurnState = 'planning' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export interface TurnError {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

export interface AssistantStepView {
  key: string;
  name: string;
  toolName: string | null;
  status: TaskStep['status'];
  durationLabel: string;
  attempt: number;
  error: TurnError | null;
}

export interface AssistantTurnView {
  state: TurnState;
  statusLabel: string;
  mode: string;
  showStop: boolean;
  progressLabel: string;
  elapsedLabel: string;
  retryCount: number;
  steps: AssistantStepView[];
  taskError: TurnError | null;
}

const STATE_LABEL: Record<TurnState, string> = {
  planning: 'Planning',
  running: 'Working',
  waiting: 'Waiting for approval',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Stopped',
};

export function turnState(status: TaskStatus): TurnState {
  switch (status) {
    case 'planning':
      return 'planning';
    case 'running':
    case 'verifying':
      return 'running';
    case 'queued':
    case 'waiting_for_input':
    case 'waiting_for_approval':
      return 'waiting';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

export function turnStatusLabel(state: TurnState): string {
  return STATE_LABEL[state];
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

/** Elapsed time for one step; a running step is measured against `now`. */
export function stepDurationMs(
  step: Pick<TaskStep, 'startedAt' | 'finishedAt' | 'status'>,
  now: number
): number | null {
  if (!step.startedAt) return null;
  const start = Date.parse(step.startedAt);
  if (!Number.isFinite(start)) return null;
  let end: number;
  if (step.finishedAt) {
    end = Date.parse(step.finishedAt);
    if (!Number.isFinite(end)) return null;
  } else if (step.status === 'running') {
    end = now;
  } else {
    return null;
  }
  return Math.max(0, end - start);
}

export function totalDurationMs(steps: readonly TaskStep[], now: number): number {
  return steps.reduce((total, step) => total + (stepDurationMs(step, now) ?? 0), 0);
}

const SECRET_PATTERN = /\beyJ|sk-or-|gsk_|re_[A-Za-z0-9]{8,}|-----BEGIN|\.ts:\d+|\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.(?:ts|js|php):\d+/;
const CODE_PATTERN = /^([A-Z][A-Z0-9_]{3,})\s*[:\-]?\s*(.*)$/s;

function cleanMessage(message: string | null | undefined, fallback: string): string {
  const trimmed = (message ?? '').trim();
  if (!trimmed || SECRET_PATTERN.test(trimmed) || trimmed.includes('\n')) return fallback;
  return trimmed.slice(0, 240);
}

interface ErrorRule {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

const ERROR_RULES: Record<string, ErrorRule> = {
  TOOL_NOT_ALLOWED: {
    title: 'Tool blocked by this site',
    detail: "The site's scopes do not allow this tool. Nothing was written.",
    actionLabel: 'Review site scopes',
    href: '/connect',
  },
  SITE_OFFLINE: {
    title: 'Site has not checked in',
    detail: 'The connector is not polling right now. Check that the plugin is active.',
    actionLabel: 'Open connected sites',
    href: '/connect',
  },
  SITE_NOT_ACTIVE: {
    title: 'Site is not active',
    detail: 'Resume or reconnect the site before running another plan.',
    actionLabel: 'Open connected sites',
    href: '/connect',
  },
  SITE_PAUSED: {
    title: 'Site is paused',
    detail: 'Resume the site before running another plan.',
    actionLabel: 'Open connected sites',
    href: '/connect',
  },
  RATE_LIMIT_EXCEEDED: {
    title: 'Too many requests',
    detail: 'Wait a minute, then retry. Nothing was written while rate limited.',
    actionLabel: 'Wait and retry',
    href: '/activity',
  },
  QUOTA_EXCEEDED: {
    title: 'Model quota reached',
    detail: 'Add your own model key or wait for the quota to reset.',
    actionLabel: 'Open AI keys',
    href: '/settings/keys',
  },
  MODEL_UNAVAILABLE: {
    title: 'Model unavailable',
    detail: 'The model did not answer. Add a BYOK key or retry shortly.',
    actionLabel: 'Open AI keys',
    href: '/settings/keys',
  },
  SESSION_EXPIRED: {
    title: 'Session expired',
    detail: 'Sign in again. The plan was not applied.',
    actionLabel: 'Sign in again',
    href: '/login',
  },
  UNAUTHORIZED: {
    title: 'Session expired',
    detail: 'Sign in again. The plan was not applied.',
    actionLabel: 'Sign in again',
    href: '/login',
  },
  SNAPSHOT_UNUSABLE: {
    title: 'Safe undo unavailable',
    detail: 'No write was applied because the before-snapshot could not be trusted.',
    actionLabel: 'Review activity log',
    href: '/activity',
  },
  ROLLBACK_UNAVAILABLE: {
    title: 'Rollback unavailable',
    detail: 'The snapshot could not be restored. Review the activity log before retrying.',
    actionLabel: 'Review activity log',
    href: '/activity',
  },
  VERIFICATION_FAILED: {
    title: 'Read-back verification failed',
    detail: 'The write could not be confirmed, so the result is not claimed as success.',
    actionLabel: 'Review activity log',
    href: '/activity',
  },
  TOOL_FAILED: {
    title: 'Tool call failed',
    detail: 'The connector returned an error. Nothing is claimed as applied.',
    actionLabel: 'Review activity log',
    href: '/activity',
  },
  PLAN_NOT_FOUND: {
    title: 'Plan expired',
    detail: 'Start a new prompt to generate a fresh plan.',
    actionLabel: 'Start again',
    href: '/studio',
  },
};

const GENERIC_ERROR: ErrorRule = {
  title: 'This step failed',
  detail: 'The result could not be verified. Nothing is claimed as applied.',
  actionLabel: 'Review activity log',
  href: '/activity',
};

/**
 * Maps a raw tool/step error to one honest message and one next action.
 * `TOOL_FAILED: <detail>` strings from the job pipeline are parsed too.
 */
export function describeTurnError(
  raw: string | { code?: string; message?: string } | null | undefined
): TurnError | null {
  if (!raw) return null;
  let code = '';
  let message = '';
  if (typeof raw === 'string') {
    const parsed = CODE_PATTERN.exec(raw.trim());
    if (parsed) {
      code = parsed[1];
      message = parsed[2] ?? '';
    } else {
      message = raw;
    }
  } else {
    code = (raw.code ?? '').toUpperCase();
    message = raw.message ?? '';
  }

  const rule = ERROR_RULES[code] ?? GENERIC_ERROR;
  const fallback = rule.detail;
  const detail = cleanMessage(message, fallback);
  return {
    title: rule.title,
    detail: detail === fallback || !detail ? rule.detail : detail,
    actionLabel: rule.actionLabel,
    href: rule.href,
  };
}

/** Repeated calls to the same tool are shown as honest retries (attempt 2, 3…). */
export function toAssistantSteps(steps: readonly TaskStep[], now: number): AssistantStepView[] {
  const attempts = new Map<string, number>();
  return steps.map((step, index) => {
    const toolName = step.toolName ?? null;
    const key = toolName || step.name || `step-${index}`;
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    const durationLabel = formatDuration(stepDurationMs(step, now));
    const rawError = step.error ?? null;
    const needsError = step.status === 'failed';
    return {
      key: step.id || `${key}-${index}`,
      name: step.name,
      toolName,
      status: step.status,
      durationLabel,
      attempt,
      error: needsError
        ? (describeTurnError(rawError) ?? describeTurnError('TOOL_FAILED'))
        : null,
    };
  });
}

export function buildAssistantTurnView(
  task: Pick<AgentExecutionTask, 'status' | 'mode' | 'steps' | 'error' | 'createdAt'>,
  now: number = Date.now()
): AssistantTurnView {
  const state = turnState(task.status);
  const steps = toAssistantSteps(task.steps ?? [], now);
  const completed = steps.filter((step) => step.status === 'completed').length;
  const retryCount = steps.reduce((sum, step) => sum + Math.max(0, step.attempt - 1), 0);
  const elapsed = totalDurationMs(task.steps ?? [], now);
  const hasElapsed = (task.steps ?? []).some((step) => stepDurationMs(step, now) !== null);

  return {
    state,
    statusLabel: turnStatusLabel(state),
    mode: task.mode,
    showStop: state === 'running' || state === 'planning',
    progressLabel: steps.length > 0 ? `${completed}/${steps.length} steps` : 'Preparing steps',
    elapsedLabel: hasElapsed ? formatDuration(elapsed) : '—',
    retryCount,
    steps,
    // A failed step already carries its own actionable card; don't shout twice.
    taskError: task.error && !steps.some((item) => item.status === 'failed')
      ? describeTurnError(task.error)
      : null,
  };
}

import { describe, expect, it } from 'vitest';
import type { AgentExecutionTask, TaskStatus, TaskStep } from '@wp-agent/contracts';
import {
  COMPOSER_SHORTCUT_HINT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_CONTEXT_CHARS,
  buildComposerSuggestions,
  classifyPrompt,
  formatAttachmentContext,
  shouldSubmitOnKeyDown,
  validateAttachmentFile,
} from '../src/lib/composer';
import {
  buildAssistantTurnView,
  describeTurnError,
  formatDuration,
  stepDurationMs,
  toAssistantSteps,
  totalDurationMs,
  turnState,
  turnStatusLabel,
  type TurnState,
} from '../src/lib/assistant-turn';

function step(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Inspect site health',
    status: 'pending',
    ...overrides,
  };
}

type TurnTask = Pick<AgentExecutionTask, 'status' | 'mode' | 'steps' | 'error' | 'createdAt'>;

function task(overrides: Partial<TurnTask> = {}): TurnTask {
  return {
    status: 'running',
    mode: 'agent',
    steps: [],
    createdAt: '2026-11-03T07:00:00.000Z',
    ...overrides,
  };
}

describe('E9-04 Composer v2 — keyboard rules', () => {
  it('sends on plain Enter and on ⌘/Ctrl+Enter, even with Shift held', () => {
    expect(shouldSubmitOnKeyDown({ key: 'Enter' })).toBe(true);
    expect(shouldSubmitOnKeyDown({ key: 'Enter', metaKey: true })).toBe(true);
    expect(shouldSubmitOnKeyDown({ key: 'Enter', ctrlKey: true })).toBe(true);
    expect(shouldSubmitOnKeyDown({ key: 'Enter', metaKey: true, shiftKey: true })).toBe(true);
  });

  it('keeps Shift+Enter as a newline and ignores other keys', () => {
    expect(shouldSubmitOnKeyDown({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(shouldSubmitOnKeyDown({ key: 'a' })).toBe(false);
    expect(shouldSubmitOnKeyDown({ key: 'Escape', metaKey: true })).toBe(false);
  });

  it('never submits during IME composition (Hindi typing)', () => {
    expect(shouldSubmitOnKeyDown({ key: 'Enter', isComposing: true })).toBe(false);
    expect(shouldSubmitOnKeyDown({ key: 'Enter', metaKey: true, isComposing: true })).toBe(false);
  });

  it('documents the shortcut in the composer hint', () => {
    expect(COMPOSER_SHORTCUT_HINT).toContain('⌘/Ctrl + ↵');
    expect(COMPOSER_SHORTCUT_HINT).toContain('Shift + Enter');
  });
});

describe('E9-04 Composer v2 — local text attachments', () => {
  it('accepts small plain-text files, case-insensitively', () => {
    expect(validateAttachmentFile({ name: 'notes.md', size: 120 })).toEqual({ ok: true });
    expect(validateAttachmentFile({ name: 'DATA.JSON', size: 10 })).toEqual({ ok: true });
  });

  it('rejects binaries, empty files and oversized files with a reason', () => {
    const binary = validateAttachmentFile({ name: 'hero.png', size: 100 });
    expect(binary.ok).toBe(false);
    if (!binary.ok) expect(binary.reason).toContain('text files');
    expect(validateAttachmentFile({ name: 'empty.txt', size: 0 }).ok).toBe(false);
    const large = validateAttachmentFile({ name: 'big.txt', size: MAX_ATTACHMENT_BYTES + 1 });
    expect(large.ok).toBe(false);
    if (!large.ok) expect(large.reason).toContain('64 KB');
  });

  it('leaves the prompt untouched when nothing is attached', () => {
    expect(formatAttachmentContext([], 'Inspect my site')).toBe('Inspect my site');
  });

  it('appends file text as clearly-labelled local context', () => {
    const result = formatAttachmentContext(
      [{ name: 'brief.md', size: 30, text: 'Brand tone: calm.' }],
      'Write a hero'
    );
    expect(result.startsWith('Write a hero')).toBe(true);
    expect(result).toContain('Attached context');
    expect(result).toContain('### brief.md');
    expect(result).toContain('Brand tone: calm.');
    expect(result).toContain('nothing is uploaded');
  });

  it('enforces a hard prompt budget and marks truncated files', () => {
    const long = 'x'.repeat(MAX_ATTACHMENT_CONTEXT_CHARS + 500);
    const result = formatAttachmentContext(
      [
        { name: 'first.txt', size: 100, text: long },
        { name: 'second.txt', size: 100, text: 'more' },
      ],
      'p'
    );
    expect(result).toContain('[truncated to fit the prompt budget]');
    expect(result).not.toContain('more');
    expect(result.length).toBeLessThan(MAX_ATTACHMENT_CONTEXT_CHARS + 200);
  });

  it('never lets a newline in a filename break out of the context block', () => {
    const result = formatAttachmentContext(
      [{ name: 'evil\nname.txt', size: 10, text: 'safe' }],
      'p'
    );
    expect(result).toContain('### evil name.txt');
    expect(result).not.toContain('### evil\nname');
  });
});

describe('E9-04 Composer v2 — capability-aware suggestions', () => {
  it('shows only model-only prompts in Chat mode', () => {
    const cards = buildComposerSuggestions({ mode: 'chat' });
    expect(cards).toHaveLength(4);
    expect(cards.every((card) => card.hint.includes('no site tools'))).toBe(true);
    expect(cards.every((card) => card.readOnly)).toBe(true);
  });

  it('starts with a read-only inspect card when no capability manifest exists', () => {
    const cards = buildComposerSuggestions({ mode: 'agent', siteLabel: 'example.test' });
    expect(cards).toHaveLength(4);
    expect(cards[0].label).toBe('Inspect this site');
    expect(cards[0].readOnly).toBe(true);
    expect(cards[0].hint).toContain('manifest');
    expect(cards[0].prompt).toContain('example.test');
  });

  it('only offers write prompts the site scopes actually allow', () => {
    const readOnly = buildComposerSuggestions({
      mode: 'writes',
      site: { name: 'Blog', scopes: ['read'], capabilities: null },
    });
    expect(readOnly.every((card) => card.readOnly)).toBe(true);

    const writable = buildComposerSuggestions({
      mode: 'writes',
      site: { name: 'Blog', scopes: ['read', 'content'], capabilities: { theme: 'twentytwentyfive' } },
    });
    expect(writable.some((card) => !card.readOnly)).toBe(true);
    expect(writable.some((card) => card.label === 'Edit a post safely')).toBe(true);
  });

  it('warns honestly when a write suggestion is shown in read-only mode', () => {
    const cards = buildComposerSuggestions({
      mode: 'agent',
      site: { name: 'Blog', scopes: ['read', 'content'], capabilities: null },
    });
    const writes = cards.filter((card) => !card.readOnly);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((card) => card.hint.includes('Switch to Writes'))).toBe(true);
  });

  it('labels prompts from their actual tool family', () => {
    expect(classifyPrompt('Update SEO meta of post #12').label).toBe('Improve SEO metadata');
    expect(classifyPrompt('Update alt text of media #5').label).toBe('Fix media alt text');
    expect(classifyPrompt('Change site tagline to "x"').label).toBe('Update site settings');
    expect(classifyPrompt('Design a modern homepage with hero').label).toBe('Design the homepage');
    expect(classifyPrompt('Change the title of post #12').label).toBe('Edit a post safely');
    expect(classifyPrompt('Check site health and report versions').write).toBe(false);
  });
});

describe('E9-05 Assistant turn — durations & retries', () => {
  it('formats milliseconds, seconds and minutes', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(250)).toBe('250ms');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(65_000)).toBe('1m 05s');
  });

  it('measures completed, running and unstarted steps honestly', () => {
    const now = Date.parse('2026-11-03T07:00:02.000Z');
    expect(
      stepDurationMs(
        { startedAt: '2026-11-03T07:00:00.000Z', finishedAt: '2026-11-03T07:00:01.500Z', status: 'completed' },
        now
      )
    ).toBe(1500);
    expect(
      stepDurationMs({ startedAt: '2026-11-03T07:00:00.000Z', status: 'running' }, now)
    ).toBe(2000);
    expect(stepDurationMs({ status: 'pending' }, now)).toBeNull();
    expect(
      stepDurationMs({ startedAt: '2026-11-03T07:00:00.000Z', status: 'pending' }, now)
    ).toBeNull();
    expect(
      stepDurationMs({ startedAt: 'not-a-date', finishedAt: undefined, status: 'completed' }, now)
    ).toBeNull();
  });

  it('sums step durations, ignoring steps without timing', () => {
    const now = Date.parse('2026-11-03T07:00:05.000Z');
    const steps = [
      step({ startedAt: '2026-11-03T07:00:00.000Z', finishedAt: '2026-11-03T07:00:01.000Z', status: 'completed' }),
      step({ startedAt: '2026-11-03T07:00:01.000Z', finishedAt: '2026-11-03T07:00:03.000Z', status: 'completed' }),
      step({ status: 'pending' }),
    ];
    expect(totalDurationMs(steps, now)).toBe(3000);
  });

  it('counts repeated tool calls as retries and derives duration labels', () => {
    const now = Date.parse('2026-11-03T07:00:05.000Z');
    const steps = [
      step({ id: 'a', name: 'Read site health', toolName: 'site.health', status: 'failed', startedAt: '2026-11-03T07:00:00.000Z', finishedAt: '2026-11-03T07:00:01.000Z' }),
      step({ id: 'b', name: 'Retry site health', toolName: 'site.health', status: 'completed', startedAt: '2026-11-03T07:00:01.000Z', finishedAt: '2026-11-03T07:00:02.500Z' }),
    ];
    const views = toAssistantSteps(steps, now);
    expect(views[0].attempt).toBe(1);
    expect(views[1].attempt).toBe(2);
    expect(views[0].durationLabel).toBe('1.0s');
    expect(views[1].durationLabel).toBe('1.5s');
    expect(views[0].error?.title).toBe('Tool call failed');
    expect(views[1].error).toBeNull();
  });

  it('does not invent an error for an intentionally skipped step', () => {
    const views = toAssistantSteps([step({ status: 'skipped' })], Date.now());
    expect(views[0].error).toBeNull();
  });
});

describe('E9-05 Assistant turn — honest error mapping', () => {
  it('maps typed codes to one action each', () => {
    expect(describeTurnError({ code: 'TOOL_NOT_ALLOWED', message: 'denied' })).toMatchObject({
      title: 'Tool blocked by this site',
      actionLabel: 'Review site scopes',
      href: '/connect',
    });
    expect(describeTurnError('RATE_LIMIT_EXCEEDED: slow down')?.detail).toContain('slow down');
    expect(describeTurnError('SNAPSHOT_UNUSABLE')?.href).toBe('/activity');
  });

  it('never prints key material or stack frames', () => {
    const result = describeTurnError({
      code: 'TOOL_FAILED',
      message: 'failed at handler (src/lib/secret.ts:42) with key re_abcdefgh1234',
    });
    expect(result?.detail).toBe('The connector returned an error. Nothing is claimed as applied.');
    expect(JSON.stringify(result)).not.toContain('re_abcdefgh1234');
  });

  it('falls back to a plain message for unknown errors and null for no error', () => {
    expect(describeTurnError(null)).toBeNull();
    expect(describeTurnError('Something odd happened')).toMatchObject({
      title: 'This step failed',
      href: '/activity',
    });
  });
});

describe('E9-05 Assistant turn — all six states', () => {
  const cases: Array<{ status: TaskStatus; state: TurnState; label: string; stop: boolean }> = [
    { status: 'planning', state: 'planning', label: 'Planning', stop: true },
    { status: 'running', state: 'running', label: 'Working', stop: true },
    { status: 'waiting_for_approval', state: 'waiting', label: 'Waiting for approval', stop: false },
    { status: 'completed', state: 'completed', label: 'Completed', stop: false },
    { status: 'failed', state: 'failed', label: 'Failed', stop: false },
    { status: 'cancelled', state: 'cancelled', label: 'Stopped', stop: false },
  ];

  for (const entry of cases) {
    it(`renders the ${entry.state} state honestly`, () => {
      const steps = [
        step({ id: 's1', status: 'completed', startedAt: '2026-11-03T07:00:00.000Z', finishedAt: '2026-11-03T07:00:01.000Z' }),
        step({ id: 's2', status: entry.status === 'failed' ? 'failed' : 'pending', error: entry.status === 'failed' ? 'TOOL_NOT_ALLOWED' : undefined }),
      ];
      const view = buildAssistantTurnView(
        task({ status: entry.status, steps, error: entry.status === 'failed' ? 'TOOL_FAILED' : undefined }),
        Date.parse('2026-11-03T07:00:03.000Z')
      );
      expect(turnState(entry.status)).toBe(entry.state);
      expect(turnStatusLabel(entry.state)).toBe(entry.label);
      expect(view.state).toBe(entry.state);
      expect(view.statusLabel).toBe(entry.label);
      expect(view.showStop).toBe(entry.stop);
      expect(view.mode).toBe('agent');
      expect(view.progressLabel).toBe('1/2 steps');
      expect(view.elapsedLabel).toBe('1.0s');
      expect(view.steps).toHaveLength(2);
      if (entry.status === 'failed') {
        expect(view.steps[1].error?.title).toBe('Tool blocked by this site');
        expect(view.taskError).toBeNull(); // step already explains the failure
      } else {
        expect(view.taskError).toBeNull();
      }
    });
  }

  it('surfaces a task-level error when no step failed', () => {
    const view = buildAssistantTurnView(
      task({ status: 'failed', steps: [step({ status: 'completed' })], error: 'QUOTA_EXCEEDED' })
    );
    expect(view.taskError?.title).toBe('Model quota reached');
    expect(view.taskError?.href).toBe('/settings/keys');
  });

  it('reports retries in the turn view', () => {
    const view = buildAssistantTurnView(
      task({
        status: 'completed',
        steps: [
          step({ id: 'a', toolName: 'site.info', status: 'completed' }),
          step({ id: 'b', toolName: 'site.info', status: 'completed' }),
        ],
      })
    );
    expect(view.retryCount).toBe(1);
    expect(view.steps[1].attempt).toBe(2);
  });
});

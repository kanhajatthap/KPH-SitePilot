'use client';

import React from 'react';
import type { AgentExecutionTask } from '@wp-agent/contracts';
import { buildAssistantTurnView, type AssistantStepView, type TurnState } from '../lib/assistant-turn';

const STATE_TONE: Record<TurnState, string> = {
  planning: 'bg-pink-500',
  running: 'bg-pink-500',
  waiting: 'bg-amber-500',
  completed: 'bg-emerald-500',
  failed: 'bg-rose-500',
  cancelled: 'bg-stone-400',
};

function Icon({ d, className = 'h-3 w-3' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function StepMarker({ status }: { status: AssistantStepView['status'] }) {
  if (status === 'completed') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Icon d="M20 6L9 17l-5-5" className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (status === 'running') {
    return <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />;
  }
  if (status === 'failed') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
        <Icon d="M6 6l12 12M18 6L6 18" className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
        <Icon d="M5 12h14" className="h-2.5 w-2.5" />
      </span>
    );
  }
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />;
}

function ErrorCard({ error }: { error: NonNullable<AssistantStepView['error']> }) {
  return (
    <div className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] leading-relaxed text-rose-800">
      <p className="font-semibold">{error.title}</p>
      <p className="mt-0.5 text-rose-700/90">{error.detail}</p>
      <a href={error.href} className="mt-1 inline-block font-semibold text-rose-700 underline underline-offset-2">
        {error.actionLabel}
      </a>
    </div>
  );
}

/**
 * Assistant turn (E9-05): reasoning timeline, per-tool durations, honest retry
 * counts and one-action error cards. Pure view model lives in
 * `lib/assistant-turn.ts` so all six states are testable without a DOM.
 */
export function AssistantTurn({
  task,
  onStop,
  now,
}: {
  task: AgentExecutionTask;
  onStop?: () => void;
  now?: number;
}) {
  const view = buildAssistantTurnView(task, now);

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-white" aria-label="Assistant turn">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5" aria-live="polite">
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-ink">
          <span className="relative flex h-2 w-2 shrink-0">
            {view.showStop ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pink-400 opacity-60" />
            ) : null}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${STATE_TONE[view.state]}`} />
          </span>
          <span className="truncate">{view.statusLabel}</span>
          <span className="rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink-muted">
            {view.mode}
          </span>
          <span className="hidden font-mono text-[9px] font-normal text-ink-muted sm:inline">
            {view.elapsedLabel}
          </span>
        </span>
        {view.showStop && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium text-ink-muted transition hover:bg-rose-50 hover:text-rose-600"
          >
            Stop
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/70 bg-paper/60 px-3 py-1.5 text-[9.5px] text-ink-muted">
        <span>{view.progressLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{view.retryCount > 0 ? `${view.retryCount} retry${view.retryCount === 1 ? '' : 's'}` : 'no retries'}</span>
        <span aria-hidden="true">·</span>
        <span>elapsed {view.elapsedLabel}</span>
      </div>

      {view.steps.length > 0 ? (
        <ol className="space-y-1 px-3 py-2.5">
          {view.steps.map((step) => (
            <li key={step.key} className="text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <StepMarker status={step.status} />
                  <span
                    className={`truncate ${
                      step.status === 'running'
                        ? 'font-medium text-ink'
                        : step.status === 'completed'
                          ? 'text-ink-soft'
                          : 'text-ink-muted'
                    }`}
                  >
                    {step.name}
                  </span>
                  {step.attempt > 1 ? (
                    <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-800">
                      retry {step.attempt}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {step.toolName ? (
                    <span className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[9px] text-ink-muted">
                      {step.toolName}
                    </span>
                  ) : null}
                  <span className="w-12 text-right font-mono text-[9px] text-ink-muted" title="Step duration">
                    {step.durationLabel}
                  </span>
                </span>
              </div>
              {step.error ? <ErrorCard error={step.error} /> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-3 py-2.5 text-[10px] text-ink-muted">
          No steps reported yet. The timeline fills in as the plan runs.
        </p>
      )}

      {view.taskError && view.steps.every((step) => step.status !== 'failed') ? (
        <div className="px-3 pb-3">
          <ErrorCard error={view.taskError} />
        </div>
      ) : null}
    </section>
  );
}

'use client';

import Link from 'next/link';
import type {
  OnboardingAction,
  OnboardingIssue,
  OnboardingIssueTone,
} from '../../lib/onboarding/errors';

const TONE_CLASS: Record<OnboardingIssueTone, string> = {
  error: 'border-rose-200 bg-rose-50 text-rose-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  info: 'border-sky-200 bg-sky-50 text-sky-950',
};

/**
 * Shared first-run / connected-sites failure surface (E9-14).
 *
 * One honest message, one visible next action, and a small stable code for
 * support. Link actions render as real anchors; every other action is handed
 * back to the page, which knows which request to repeat.
 */
export function RecoveryNotice({
  issue,
  onAction,
}: {
  issue: OnboardingIssue;
  onAction: (action: OnboardingAction) => void;
}) {
  return (
    <section role="alert" className={`mt-6 rounded-2xl border p-4 ${TONE_CLASS[issue.tone]}`}>
      <p className="text-sm font-semibold">{issue.title}</p>
      <p className="mt-1 text-sm leading-relaxed opacity-90">{issue.detail}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {issue.action.kind === 'link' ? (
          <Link
            href={issue.action.href}
            className="rounded-lg bg-white/80 px-3 py-1.5 text-xs font-semibold underline-offset-4 hover:underline"
          >
            {issue.action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onAction(issue.action)}
            className="rounded-lg bg-white/80 px-3 py-1.5 text-xs font-semibold hover:bg-white"
          >
            {issue.action.label}
          </button>
        )}
        <span className="text-[11px] opacity-70">code: {issue.code}</span>
      </div>
    </section>
  );
}

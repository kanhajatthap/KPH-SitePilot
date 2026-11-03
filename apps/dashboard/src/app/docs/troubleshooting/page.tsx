import type { Metadata } from 'next';
import Link from 'next/link';
import {
  describeOnboardingFailure,
  type FailureInput,
  type OnboardingIssue,
} from '../../../lib/onboarding/errors';
import { describeTurnError, type TurnError } from '../../../lib/assistant-turn';
import { FAILURE_SCENARIOS, guidanceFor } from '../../../lib/failure-guidance';

export const metadata: Metadata = {
  title: 'Troubleshooting & error codes — KPH SitePilot Docs',
  description:
    'What each SitePilot error means and the single next action that clears it, generated from the same taxonomy the UI uses.',
};

interface TroubleRow {
  code: string;
  title: string;
  detail: string;
  actionLabel: string;
  href?: string;
}

function fromOnboarding(code: string, input: FailureInput): TroubleRow {
  const issue: OnboardingIssue = describeOnboardingFailure(input);
  const href = issue.action.kind === 'link' ? issue.action.href : undefined;
  return {
    code: `${code} · ${issue.code}`,
    title: issue.title,
    detail: issue.detail,
    actionLabel: issue.action.label,
    href,
  };
}

function fromTurn(code: string): TroubleRow {
  const issue: TurnError | null = describeTurnError(code);
  return {
    code,
    title: issue?.title ?? 'Unknown error',
    detail: issue?.detail ?? 'Retry the prompt.',
    actionLabel: issue?.actionLabel ?? 'Review activity log',
    href: issue?.href ?? '/activity',
  };
}

const ROWS: TroubleRow[] = [
  fromOnboarding('401', { status: 401 }),
  fromOnboarding('SESSION_EXPIRED', { code: 'SESSION_EXPIRED' }),
  fromOnboarding('CONFIG_MISSING', { code: 'CONFIG_MISSING' }),
  fromOnboarding('CONNECTOR_STORAGE_UNAVAILABLE', { code: 'CONNECTOR_STORAGE_UNAVAILABLE', status: 503 }),
  fromOnboarding('PAIRING_CODE_EXPIRED', { code: 'PAIRING_CODE_EXPIRED' }),
  fromOnboarding('PAIRING_CODE_USED', { code: 'PAIRING_CODE_USED' }),
  fromOnboarding('RATE_LIMIT_EXCEEDED', { status: 429 }),
  fromOnboarding('PROJECT_NOT_FOUND', { code: 'PROJECT_NOT_FOUND' }),
  fromOnboarding('SITE_ALREADY_CONNECTED', { code: 'SITE_ALREADY_CONNECTED' }),
  fromOnboarding('NETWORK_ERROR', { network: true }),
  fromTurn('TOOL_NOT_ALLOWED'),
  fromTurn('SITE_OFFLINE'),
  fromTurn('QUOTA_EXCEEDED'),
  fromTurn('MODEL_UNAVAILABLE'),
  fromTurn('SNAPSHOT_UNUSABLE'),
  fromTurn('VERIFICATION_FAILED'),
  fromTurn('ROLLBACK_UNAVAILABLE'),
];

export default function TroubleshootingDocsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link href="/docs" className="text-sm text-ink-muted underline-offset-4 hover:underline">
        ← All docs
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Troubleshooting &amp; error codes</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Every row below is generated from the exact same mapping the onboarding wizard, the
        connected-sites page and the assistant turn use — so the docs cannot drift from the UI.
        Each error has one honest next action, not a stack trace.
      </p>

      <div className="mt-8 space-y-2">
        {ROWS.map((row) => (
          <section key={row.code} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">{row.title}</h2>
              <code className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[9px] text-ink-muted">
                {row.code}
              </code>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{row.detail}</p>
            <p className="mt-2 text-[11px]">
              <span className="font-semibold text-ink">Next action: </span>
              {row.href ? (
                <Link href={row.href} className="font-medium text-pink-700 underline underline-offset-2">
                  {row.actionLabel} →
                </Link>
              ) : (
                <span className="text-ink-soft">{row.actionLabel}</span>
              )}
            </p>
          </section>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Injected failures (E11-03)</h2>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-muted">
          These six failures are exercised by the failure-injection suite. Each resolves to one typed
          code and one next action; raw transport details are scrubbed before they are ever shown.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {FAILURE_SCENARIOS.map((kind) => {
            const outcome = guidanceFor(kind);
            return (
              <div key={kind} className="rounded-xl border border-line bg-white p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-ink">{outcome.message}</span>
                  <code className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[9px] text-ink-muted">
                    {outcome.code}
                  </code>
                </span>
                <span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">
                  Next action: {outcome.action}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-semibold">Still stuck?</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-ink-muted">
          <li>
            Check <Link href="/api/health" className="text-pink-700 underline">/api/health</Link> —
            it reports the deployed commit and whether auth, storage and encryption are ready.
          </li>
          <li>
            On the WordPress side, open <strong>SitePilot → Connection</strong> to see the connector&apos;s
            own status and last heartbeat.
          </li>
          <li>
            Re-read the <Link href="/docs/connector" className="text-pink-700 underline">install guide</Link> if
            pairing never completes; most failures are an expired code or an inactive plugin.
          </li>
        </ul>
      </section>
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Safety, snapshots & undo — KPH SitePilot Docs',
  description:
    'Why every WordPress write needs a plan, an approval, a snapshot, read-back verification and a one-click undo.',
};

const FLOW = [
  {
    step: '1',
    title: 'Describe, don’t execute',
    detail:
      'A prompt produces a plan, never an immediate write. Read-only tools (R0) can run without approval because they cannot change the site.',
  },
  {
    step: '2',
    title: 'Review the plan',
    detail:
      'Each step names a tool, its arguments, its risk level and its integrity hash (SHA-256). The planner can raise risk, never lower the catalog floor.',
  },
  {
    step: '3',
    title: 'Approve explicitly',
    detail:
      'R2 plans need the typed word CONFIRM; R3 plans need the plan-id prefix. Editing a plan invalidates its hash, so an old approval cannot be replayed.',
  },
  {
    step: '4',
    title: 'Snapshot before the write',
    detail:
      'The connector captures the exact before-state of the resource — post content, meta, media, menu, featured image or site setting — and stores it for undo.',
  },
  {
    step: '5',
    title: 'Write, then read back',
    detail:
      'After applying the change the connector reads the same resource again. If it does not match the intent, the result is reported as unverified, never as success.',
  },
  {
    step: '6',
    title: 'Undo in one click',
    detail:
      'Snapshots are listed in the Activity timeline and in Studio. Undo restores the before-state through the same signed job queue, then verifies again.',
  },
];

export default function SafetyDocsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/docs" className="text-sm text-ink-muted underline-offset-4 hover:underline">
        ← All docs
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Safety, snapshots &amp; one-click undo</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        The short version: <strong className="font-semibold text-ink">nothing writes silently</strong>.
        Here is the whole path a change takes.
      </p>

      <div className="mt-8 space-y-3">
        {FLOW.map((item) => (
          <section key={item.step} className="flex gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-paper-deep font-mono text-[11px] font-semibold text-pink-600">
              {item.step}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">{item.title}</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{item.detail}</p>
            </div>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-semibold text-amber-950">If something goes wrong</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-amber-900/85">
          <li>A failed verification never claims success — the activity entry says what happened.</li>
          <li>If a snapshot is unusable, no write is applied at all (<code>SNAPSHOT_UNUSABLE</code>).</li>
          <li>If undo itself is unavailable, the UI says so instead of pretending the site is restored.</li>
          <li>Expired sessions, rate limits and offline sites each have one clear next action.</li>
        </ul>
        <Link href="/docs/troubleshooting" className="mt-3 inline-block text-xs font-semibold text-amber-900 underline">
          Open troubleshooting →
        </Link>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-semibold">What is deliberately not shipped</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          There is no &ldquo;just do it&rdquo; button, no auto-publish from a chat message, and no
          tool that runs a WordPress write without an approval record. WooCommerce writes, file
          edits and code injection are roadmap items, not hidden features.
        </p>
        <Link href="/docs/tools" className="mt-3 inline-block text-xs font-medium text-pink-700 underline">
          See what the 34 shipped tools can actually do →
        </Link>
      </section>
    </main>
  );
}

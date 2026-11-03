import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsSearch } from '../../components/docs/DocsSearch';
import { DOCS_ENTRIES, docsBySection } from '../../lib/docs';

export const metadata: Metadata = {
  title: 'Documentation — KPH SitePilot',
  description:
    'Everything you need to connect a WordPress site, understand the tool catalog and make a safe, reversible first change.',
};

export default function DocsHubPage() {
  const sections = docsBySection();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link href="/" className="text-sm text-ink-muted underline-offset-4 hover:underline">
        ← Back to SitePilot
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Documentation</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        A small, searchable library: connect a site, see exactly which tools can run, understand
        the safety model, and fix the errors you might hit. Every page is static — no login needed.
      </p>

      <DocsSearch entries={[...DOCS_ENTRIES]} />

      <div className="mt-10 space-y-10">
        {sections.map((group) => (
          <section key={group.section}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {group.section}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {group.entries.map((entry) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="group rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-md"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold text-ink">{entry.title}</span>
                    <span className="shrink-0 text-[10px] text-ink-muted">{entry.readingMinutes} min</span>
                  </span>
                  <span className="mt-1.5 block text-[12px] leading-relaxed text-ink-muted">
                    {entry.summary}
                  </span>
                  {entry.note ? (
                    <span className="mt-2 mr-2 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      {entry.note}
                    </span>
                  ) : null}
                  <span className="mt-2 inline-block text-[11px] font-medium text-pink-700 group-hover:underline">
                    Open →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12 rounded-2xl border border-pink-200 bg-pink-50 p-5">
        <h2 className="text-sm font-semibold text-pink-950">Ready to try it?</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-pink-900/80">
          The guided setup takes about two minutes: download the plugin, paste a pairing code, and
          watch the first heartbeat arrive.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/onboarding" className="rounded-lg bg-pink-600 px-4 py-2 text-xs font-semibold text-white hover:bg-pink-700">
            Start guided setup
          </Link>
          <Link href="/api/health" className="rounded-lg border border-pink-300 px-4 py-2 text-xs font-medium text-pink-900">
            Live health status
          </Link>
        </div>
      </section>
    </main>
  );
}

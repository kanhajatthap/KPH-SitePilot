import Link from 'next/link';
import {
  LANDING_CTA,
  LANDING_FOOTER_LINKS,
  LANDING_GUARANTEES,
  LANDING_SECONDARY,
  LANDING_STEPS,
} from '../../lib/landing';

function Sparkle({ className = 'h-4 w-4' }: { className?: string }) {
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
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    </svg>
  );
}

/** Static CSS product preview — no screenshot, no external asset, no LCP cost. */
function ProductPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-pink-200/50 via-orange-100/40 to-purple-200/40 blur-2xl" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_70px_-30px_rgba(27,25,23,0.5)]">
        <div className="flex items-center gap-2 border-b border-line bg-paper-deep px-3 py-2">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-rose-300" />
            <span className="h-2 w-2 rounded-full bg-amber-300" />
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
          </span>
          <span className="truncate font-mono text-[9px] text-ink-muted">
            kph-sitepilot.vercel.app/studio
          </span>
        </div>

        <div className="grid grid-cols-5 gap-0">
          {/* Conversation pane */}
          <div className="col-span-2 border-r border-line p-3">
            <p className="flex items-center gap-1.5 text-[9px] font-semibold text-ink">
              <span className="brand-gradient flex h-4 w-4 items-center justify-center rounded text-white">
                <Sparkle className="h-2.5 w-2.5" />
              </span>
              SitePilot Agent
            </p>
            <div className="mt-3 ml-auto w-[88%] rounded-lg rounded-br-sm bg-paper-deep px-2 py-1.5 text-[9px] leading-snug text-ink-soft">
              Change the homepage hero headline to &ldquo;Built for teams that ship&rdquo;
            </div>

            <div className="mt-3 space-y-1.5 rounded-lg border border-line bg-white p-2">
              <p className="text-[8px] font-semibold uppercase tracking-wide text-ink-muted">
                Working · 2/3 steps
              </p>
              {[
                ['Inspect site health', '0.8s', true],
                ['Snapshot hero block', '1.2s', true],
                ['Write + read-back verify', 'running', false],
              ].map(([name, duration, done]) => (
                <div key={String(name)} className="flex items-center justify-between gap-1 text-[9px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-ink-soft">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? 'bg-emerald-500' : 'bg-pink-500'}`}
                    />
                    <span className="truncate">{name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[8px] text-ink-muted">{duration}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[8px] leading-snug text-ink-muted">
              Real durations and retries come from the task timeline — no fabricated progress.
            </p>
          </div>

          {/* Plan pane */}
          <div className="col-span-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-semibold text-ink">Plan · R2 write</p>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-semibold text-amber-800">
                WAITING FOR APPROVAL
              </span>
            </div>
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2">
              <p className="text-[9px] font-semibold text-amber-900">Update hero headline</p>
              <p className="mt-0.5 text-[8px] leading-snug text-amber-800/80">
                Snapshot taken before the write. The old value is kept for one-click undo.
              </p>
            </div>
            <ol className="mt-2 space-y-1 text-[9px] text-ink-soft">
              <li className="flex items-center gap-1.5">
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-emerald-100 text-[7px] text-emerald-700">✓</span>
                blocks.parse · read the current hero
              </li>
              <li className="flex items-center gap-1.5">
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-emerald-100 text-[7px] text-emerald-700">✓</span>
                snapshot.create · before state
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                blocks.replace · then read back to verify
              </li>
            </ol>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
              <span className="truncate font-mono text-[8px] text-ink-muted">sha256: 7f3a…c91</span>
              <span className="rounded-md bg-ink px-2 py-1 text-[8px] font-semibold text-white">
                Type CONFIRM to approve
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[9px] text-ink-muted">
        Product preview — real UI copy, rendered as a static mock (no screenshot or GIF).
      </p>
    </div>
  );
}

/**
 * Public landing page (E9-18). Rendered for signed-out visitors at `/`; signed-in
 * visitors still get the workspace from the same URL. Entirely static markup —
 * no client JS, no external images — so the hero is the LCP element and stays fast.
 */
export function LandingPage() {
  return (
    <div data-public-page="landing" className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-white/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="brand-gradient flex h-7 w-7 items-center justify-center rounded-[10px] text-white">
              <Sparkle className="h-3.5 w-3.5" />
            </span>
            KPH SitePilot
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-5 text-xs">
            <Link href={LANDING_SECONDARY.href} className="text-ink-muted hover:text-ink">
              Docs
            </Link>
            <Link href="/docs/safety" className="hidden text-ink-muted hover:text-ink sm:inline">
              How safety works
            </Link>
            <Link href="/login" className="text-ink-muted hover:text-ink">
              Sign in
            </Link>
            <Link
              href={LANDING_CTA.href}
              className="rounded-lg bg-ink px-3 py-1.5 font-medium text-white hover:bg-stone-800"
            >
              {LANDING_CTA.label}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-14 lg:grid-cols-2 lg:items-center lg:py-20">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-[10px] font-medium text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Hosted · free-tier · human-approved writes
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Run WordPress from a prompt — <span className="text-pink-600">with the brakes on.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              Describe the change in plain language. SitePilot inspects your site, writes a plan,
              waits for your approval, snapshots before every write, verifies the result by reading
              it back, and keeps one-click undo.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link
                href={LANDING_CTA.href}
                className="brand-gradient focus-ring rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm"
              >
                {LANDING_CTA.label} →
              </Link>
              <Link
                href={LANDING_SECONDARY.href}
                className="text-sm font-medium text-pink-700 underline underline-offset-4"
              >
                {LANDING_SECONDARY.label}
              </Link>
            </div>
            <p className="mt-4 text-[11px] text-ink-muted">
              Any WordPress site works — hosted, staging or local. WordPress 6.4+, PHP 7.4+.
            </p>
          </div>
          <ProductPreview />
        </section>

        <section className="border-y border-line bg-white/70" aria-label="Safety guarantees">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
            {LANDING_GUARANTEES.map((item) => (
              <div key={item.label}>
                <p className="text-xs font-semibold text-ink">{item.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Three steps to your first change</h2>
          <p className="mt-2 text-sm text-ink-muted">
            The guided setup does the same thing interactively; these are the underlying steps.
          </p>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {LANDING_STEPS.map((stepItem) => (
              <Link
                key={stepItem.number}
                href={stepItem.href}
                className="group rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-md"
              >
                <span className="font-mono text-[11px] font-semibold text-pink-600">{stepItem.number}</span>
                <h3 className="mt-2 text-sm font-semibold text-ink">{stepItem.title}</h3>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">{stepItem.detail}</p>
                <span className="mt-3 inline-block text-[11px] font-medium text-pink-700 group-hover:underline">
                  {stepItem.note ? 'Sign in to continue →' : 'Open the guide →'}
                </span>
                {stepItem.note ? (
                  <span className="ml-2 text-[10px] text-ink-muted">{stepItem.note}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="rounded-3xl border border-line bg-white p-7 sm:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-pink-600">Non-negotiable</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Nothing writes silently.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
              Every write starts as a plan with a risk level and an integrity hash. R2 plans need a
              typed confirmation; R3 plans need the plan-id prefix. The connector takes a before
              snapshot, applies the change, then reads the site back and refuses to claim success if
              verification fails. One click restores the snapshot. Read-only tools never need approval.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/docs/safety"
                className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-paper-deep"
              >
                Read the safety model
              </Link>
              <Link
                href="/docs/tools"
                className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-paper-deep"
              >
                See all 34 tools
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-[11px] text-ink-muted">
          <p>© 2026 KPH SitePilot · Built for WordPress, with undo.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            {LANDING_FOOTER_LINKS.map((link) =>
              link.href.startsWith('http') ? (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="hover:text-ink">
                  {link.label}
                </a>
              ) : (
                <Link key={link.href} href={link.href} className="hover:text-ink">
                  {link.label}
                </Link>
              )
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
}

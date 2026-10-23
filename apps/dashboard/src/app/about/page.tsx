import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About — KPH SitePilot',
  description:
    'SitePilot is a local-first, human-approved AI workspace for inspecting, designing and publishing WordPress sites safely.',
};

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

function Arrow({ className = 'h-3.5 w-3.5' }: { className?: string }) {
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
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

const PRINCIPLES = [
  {
    title: 'Read-only by default',
    body: 'Inspection, planning and previewing never touch WordPress. The agent earns the right to write one approved change at a time.',
    icon: 'M12 3l7 3v5c0 4.4-3 8.4-7 9.5C8 19.4 5 15.4 5 11V6l7-3z',
  },
  {
    title: 'Approval before writes',
    body: 'Every proposal is staged with a human-readable diff and a cryptographic integrity hash. Nothing is saved until you approve it.',
    icon: 'M9 12l2 2 4-4M7 3h10a2 2 0 012 2v14l-7-3-7 3V5a2 2 0 012-2z',
  },
  {
    title: 'Verify, never assume',
    body: 'After a change, SitePilot reads the resource back from WordPress and reports the real ID, status and URL — not a simulated success.',
    icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 12.5l2.3 2.3 4.7-5.1',
  },
] as const;

const STEPS = [
  {
    number: '01',
    title: 'Inspect',
    body: 'Read the real WordPress version, theme, plugins and builder capabilities before making a plan.',
  },
  {
    number: '02',
    title: 'Plan',
    body: 'Turn the request into a short, reviewable sequence of steps with the exact target site and scope.',
  },
  {
    number: '03',
    title: 'Stage',
    body: 'Generate the page or change as a proposal. Review the preview, the diff and the integrity hash.',
  },
  {
    number: '04',
    title: 'Approve & verify',
    body: 'Approve the change. SitePilot applies it, reads it back, and reports what actually changed.',
  },
] as const;

export default function AboutPage() {
  return (
    <main className="min-h-dvh bg-paper">
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="focus-ring inline-flex items-center gap-2.5 rounded-xl">
            <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-[10px] text-white shadow-sm">
              <Sparkle className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink">SitePilot</span>
          </Link>

          <nav aria-label="About page navigation" className="flex items-center gap-1.5">
            <Link
              href="/"
              className="focus-ring hidden rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink-muted transition hover:bg-paper-deep hover:text-ink sm:inline-flex"
            >
              Workspace
            </Link>
            <Link
              href="/about"
              aria-current="page"
              className="focus-ring rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-medium text-white"
            >
              About
            </Link>
          </nav>
        </div>
      </header>

      {/* 1. Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 12% 8%, rgba(255,138,91,0.16), transparent 48%), radial-gradient(ellipse at 82% 18%, rgba(255,77,141,0.13), transparent 48%), radial-gradient(ellipse at 58% 100%, rgba(168,85,247,0.1), transparent 55%)',
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-2.5 py-1 text-[10.5px] font-medium text-ink-soft shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-pink-500" aria-hidden="true" />
              About SitePilot
            </div>

            <h1 className="mt-5 max-w-2xl text-[38px] font-semibold leading-[1.06] tracking-tight text-ink sm:text-5xl lg:text-[54px]">
              Build WordPress with an agent you can{' '}
              <span className="brand-text">actually trust.</span>
            </h1>

            <p className="mt-5 max-w-xl text-[14px] leading-7 text-ink-muted sm:text-[15px]">
              SitePilot is a local-first workspace that turns a plain-language request into a
              reviewed, verified WordPress change. It shows its work, stages the result, and waits
              for your approval before anything is saved.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link
                href="/"
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-stone-800"
              >
                Open workspace
                <Arrow />
              </Link>
              <a
                href="#how-it-works"
                className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line-strong bg-white px-4 py-2.5 text-[12.5px] font-semibold text-ink-soft transition hover:border-ink-muted hover:text-ink"
              >
                See how it works
              </a>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-ink-muted">
              {['Local-first', 'Human-approved', 'Provider-independent'].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="surface-card rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[11.5px] font-semibold text-ink">
                <span className="brand-gradient flex h-6 w-6 items-center justify-center rounded-lg text-white">
                  <Sparkle className="h-3.5 w-3.5" />
                </span>
                A live change, end to end
              </span>
              <span className="rounded-md border border-line bg-paper px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink-muted">
                real trace
              </span>
            </div>

            <ol className="mt-4 space-y-3">
              {[
                ['Inspect', 'Read WP 7.1.3 · Hello Elementor', 'completed'],
                ['Plan', 'About page · 5 sections', 'completed'],
                ['Stage', 'Gutenberg proposal ready', 'completed'],
                ['Approve', 'Waiting for you', 'current'],
                ['Verify', 'Read-back check after save', 'pending'],
              ].map(([label, detail, state]) => (
                <li key={label} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      state === 'completed'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : state === 'current'
                          ? 'border-pink-200 bg-pink-50 text-pink-600'
                          : 'border-line bg-paper text-ink-muted'
                    }`}
                  >
                    {state === 'completed' ? (
                      <Check className="h-3 w-3" />
                    ) : state === 'current' ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-pink-500" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium text-ink-soft">{label}</span>
                    <span className="block text-[10.5px] text-ink-muted">{detail}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-4 rounded-xl border border-line bg-paper px-3 py-2.5 text-[10.5px] leading-relaxed text-ink-muted">
              No hidden writes. No simulated success. Every step maps to a real tool call or a
              visible approval gate.
            </div>
          </div>
        </div>
      </section>

      {/* 2. Mission */}
      <section id="mission" aria-labelledby="mission-title" className="border-b border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-pink-600">
              Our mission
            </p>
            <h2
              id="mission-title"
              className="mt-2.5 max-w-md text-[30px] font-semibold leading-tight tracking-tight text-ink sm:text-4xl"
            >
              AI should do the work, not hide it.
            </h2>
          </div>

          <div>
            <p className="max-w-2xl text-[13.5px] leading-7 text-ink-soft">
              Most AI website tools optimize for the demo: a confident answer, a fake success
              message, and a button that may or may not do anything. SitePilot is built the other
              way around. The agent inspects the real site, uses real tools, shows the plan and the
              staged change, and stops at a human approval gate.
            </p>
            <p className="mt-4 max-w-2xl text-[13.5px] leading-7 text-ink-muted">
              That means fewer surprises in production, a clear audit trail, and a workspace you
              can leave open without wondering what changed behind your back.
            </p>

            <dl className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['0', 'silent writes'],
                ['100%', 'approval-gated'],
                ['1', 'local-first workspace'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-line bg-white px-3.5 py-3">
                  <dt className="font-mono text-[22px] font-semibold tracking-tight text-ink">
                    {value}
                  </dt>
                  <dd className="mt-0.5 text-[10.5px] text-ink-muted">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* 3. Principles */}
      <section id="principles" aria-labelledby="principles-title" className="border-b border-line bg-paper-deep/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-pink-600">
              What we protect
            </p>
            <h2
              id="principles-title"
              className="mt-2.5 text-[30px] font-semibold leading-tight tracking-tight text-ink sm:text-4xl"
            >
              Three rules we do not trade away.
            </h2>
            <p className="mt-3 text-[13px] leading-6 text-ink-muted">
              These are product constraints, not marketing lines. They shape every tool call and
              every approval screen.
            </p>
          </div>

          <div className="mt-7 grid gap-3.5 md:grid-cols-3">
            {PRINCIPLES.map((principle) => (
              <article key={principle.title} className="surface-card rounded-2xl p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-paper text-pink-600">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d={principle.icon} />
                  </svg>
                </span>
                <h3 className="mt-4 text-[14px] font-semibold tracking-tight text-ink">
                  {principle.title}
                </h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">
                  {principle.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4. How it works */}
      <section id="how-it-works" aria-labelledby="how-title" className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-pink-600">
                How it works
              </p>
              <h2
                id="how-title"
                className="mt-2.5 text-[30px] font-semibold leading-tight tracking-tight text-ink sm:text-4xl"
              >
                From a sentence to a verified change.
              </h2>
            </div>
            <Link
              href="/"
              className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-lg text-[12px] font-semibold text-pink-600 transition hover:text-pink-500"
            >
              Try it in the workspace
              <Arrow className="h-3 w-3" />
            </Link>
          </div>

          <ol className="mt-8 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.number} className="relative rounded-2xl border border-line bg-white p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold tracking-wide text-pink-600">
                    {step.number}
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span className="hidden h-px flex-1 bg-line lg:ml-3 lg:block" aria-hidden="true" />
                  ) : null}
                </div>
                <h3 className="mt-3 text-[14px] font-semibold tracking-tight text-ink">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5. CTA */}
      <section id="cta" aria-labelledby="cta-title" className="px-4 py-14 sm:px-6 sm:py-16">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-ink px-5 py-10 text-white sm:px-10 sm:py-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-30 blur-2xl"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(255,77,141,0.9), rgba(168,85,247,0.35), transparent 70%)',
            }}
          />
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-pink-300">
                Ready when you are
              </p>
              <h2
                id="cta-title"
                className="mt-2.5 text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl"
              >
                Build something real, with a clear approval gate.
              </h2>
              <p className="mt-3 text-[12.5px] leading-6 text-stone-300">
                Open the workspace, describe the page you want, and review the staged result before
                anything is saved to WordPress.
              </p>
            </div>
            <Link
              href="/"
              className="focus-ring inline-flex w-fit shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[12.5px] font-semibold text-ink transition hover:bg-stone-100"
            >
              Open the workspace
              <Arrow />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-[10.5px] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Local-first · Provider-independent · Human-approved</span>
          <span>KPH SitePilot</span>
        </div>
      </footer>
    </main>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

const PROOF_POINTS = [
  'Read-only tools by default',
  'Every write needs your approval',
  'Changes are verified after saving',
];

function Sparkle({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    </svg>
  );
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl grid-cols-1 lg:grid-cols-[1.02fr_0.98fr]">
        {/* Brand panel */}
        <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(ellipse at 15% 10%, rgba(255,138,91,0.16), transparent 52%), radial-gradient(ellipse at 85% 25%, rgba(255,77,141,0.14), transparent 50%), radial-gradient(ellipse at 60% 95%, rgba(168,85,247,0.12), transparent 55%)',
            }}
          />

          <div className="relative">
            <Link href="/" className="focus-ring inline-flex items-center gap-2.5 rounded-xl">
              <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md shadow-pink-500/20">
                <Sparkle />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-ink">SitePilot</span>
            </Link>

            <h1 className="mt-14 max-w-md text-[40px] font-semibold leading-[1.08] tracking-tight text-ink">
              Build WordPress sites with an agent you can{' '}
              <span className="brand-text">actually trust.</span>
            </h1>

            <p className="mt-5 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
              Describe what you want. SitePilot inspects the site, shows its plan, stages the change, and waits for
              your approval before anything is saved.
            </p>

            <ul className="mt-8 space-y-2.5">
              {PROOF_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2.5 text-[12.5px] text-ink-soft">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                    </svg>
                  </span>
                  {point}
                </li>
              ))}
            </ul>

            {/* Agent trace preview */}
            <div className="surface-card mt-10 max-w-sm rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] font-semibold text-ink">
                  <span className="brand-gradient flex h-5 w-5 items-center justify-center rounded-md text-white">
                    <Sparkle className="h-3 w-3" />
                  </span>
                  SitePilot Agent
                </span>
                <span className="rounded-md border border-line bg-paper px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink-muted">
                  live trace
                </span>
              </div>
              <div className="mt-3 space-y-2 text-[11px]">
                <div className="flex items-center gap-2 text-ink-soft">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                    </svg>
                  </span>
                  Inspected plugin-test.local
                  <span className="ml-auto font-mono text-[9px] text-ink-muted">1.2s</span>
                </div>
                <div className="flex items-center gap-2 text-ink-soft">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
                  Drafting the hero section
                  <span className="ml-auto font-mono text-[9px] text-ink-muted">now</span>
                </div>
                <div className="flex items-center gap-2 text-ink-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                  Waiting for your approval
                </div>
              </div>
            </div>
          </div>

          <p className="relative text-[11px] text-ink-muted">Local-first · Provider-independent · Human-approved</p>
        </aside>

        {/* Form panel */}
        <section className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[420px]">
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md shadow-pink-500/20">
                <Sparkle />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-ink">SitePilot</span>
            </div>

            <div className="surface-card rounded-3xl p-6 sm:p-8">
              <header className="mb-6">
                <h2 className="text-[24px] font-semibold tracking-tight text-ink">{title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{subtitle}</p>
              </header>

              {children}

              {footer ? <div className="mt-6 text-[12.5px] text-ink-muted">{footer}</div> : null}
            </div>

            <p className="mt-5 text-center text-[10.5px] leading-relaxed text-ink-muted">
              By continuing you agree to keep credentials server-side and never paste secrets into chat.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

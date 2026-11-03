import type { Metadata } from 'next';
import Link from 'next/link';
import { DOCS_ENTRIES } from '../../lib/docs';

export const metadata: Metadata = {
  title: 'Docs — KPH SitePilot',
  description:
    'Connect a WordPress site, understand the 34 allowlisted tools, and learn the plan → approve → snapshot → verify → undo safety model.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-white/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="brand-gradient flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold text-white">
              SP
            </span>
            KPH SitePilot <span className="font-normal text-ink-muted">/ Docs</span>
          </Link>
          <nav aria-label="Documentation pages" className="flex flex-wrap items-center gap-3 text-[11px]">
            {DOCS_ENTRIES.filter((entry) => entry.href !== '/docs').map((entry) => (
              <Link key={entry.href} href={entry.href} className="text-ink-muted hover:text-ink">
                {entry.navLabel}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-[11px]">
            <Link href="/login" className="text-ink-muted hover:text-ink">
              Sign in
            </Link>
            <Link href="/register" className="rounded-lg bg-ink px-2.5 py-1.5 font-medium text-white hover:bg-stone-800">
              Get started
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

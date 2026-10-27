'use client';

import { useTheme } from '@/contexts/theme-context';
import Link from 'next/link';

function SunIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function MonitorIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export default function SettingsPage() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const themeOptions: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode; hint: string }> = [
    {
      value: 'light',
      label: 'Light',
      icon: <SunIcon />,
      hint: 'Always use light mode',
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: <MoonIcon />,
      hint: 'Always use dark mode',
    },
    {
      value: 'system',
      label: 'System',
      icon: <MonitorIcon />,
      hint: 'Match your OS preference',
    },
  ];

  return (
    <main className="min-h-dvh bg-paper dark:bg-paper">
      <header className="glass sticky top-0 z-30 border-b border-line dark:border-line">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
            className="focus-ring inline-flex items-center gap-2.5 rounded-xl"
            title="Back to workspace"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="text-[15px] font-semibold tracking-tight text-ink dark:text-ink">Settings</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="space-y-8">
          {/* Appearance Section */}
          <section aria-labelledby="appearance-heading">
            <header className="flex items-center justify-between">
              <h2 id="appearance-heading" className="text-[20px] font-semibold tracking-tight text-ink dark:text-ink">
                Appearance
              </h2>
            </header>

            <p className="mt-2 text-[13px] leading-6 text-ink-muted dark:text-ink-muted">
              Choose how SitePilot looks. Your preference is saved locally and persists across sessions.
            </p>

            <div className="mt-6 surface-card rounded-2xl p-5 dark:surface-card">
              <div className="grid gap-3 sm:grid-cols-3">
                {themeOptions.map((option) => {
                  const isActive = theme === option.value;
                  const isResolvedActive = isActive || (option.value === 'system' && theme === 'system');
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      className={`focus-ring relative flex flex-col items-center gap-3 rounded-xl p-4 text-center transition ${
                        isActive
                          ? 'border-2 border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                          : 'border border-line dark:border-line hover:border-ink-muted/50 dark:hover:border-ink-muted/50'
                      }`}
                      aria-pressed={isActive}
                    >
                      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        isActive ? 'bg-pink-500 text-white' : 'bg-paper-deep text-ink-muted dark:bg-paper-deep dark:text-ink-muted'
                      }`}>
                        {option.icon}
                      </span>
                      <span className="text-[13px] font-medium text-ink dark:text-ink">{option.label}</span>
                      <span className="text-[11px] text-ink-muted dark:text-ink-muted">{option.hint}</span>
                      {isActive && (
                        <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                            <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-[12px] text-ink-muted dark:text-ink-muted">
                Current mode: <strong className="text-ink dark:text-ink capitalize">{resolvedTheme}</strong>
                {theme === 'system' && ' (from system)'}
              </p>
            </div>
          </section>

          {/* About Section */}
          <section aria-labelledby="about-heading">
            <h3 id="about-heading" className="text-[16px] font-semibold tracking-tight text-ink dark:text-ink">
              About SitePilot
            </h3>
            <p className="mt-2 text-[13px] leading-6 text-ink-muted dark:text-ink-muted">
              Local-first, human-approved AI workspace for WordPress. Read the real site, stage changes, approve before writes.
            </p>
            <div className="mt-4 flex items-center gap-4">
              <Link
                href="/about"
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line dark:border-line bg-white/70 px-3 py-1.5 text-[12px] font-medium text-ink-soft transition hover:bg-paper-deep hover:text-ink dark:bg-paper-deep dark:hover:bg-paper"
              >
                Learn more
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link
                href="/"
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-stone-800"
              >
                Back to workspace
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </section>
        </div>
      </div>

      <footer className="border-t border-line dark:border-line mt-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-6 text-[10.5px] text-ink-muted dark:text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Local-first · Provider-independent · Human-approved</span>
          <span>KPH SitePilot</span>
        </div>
      </footer>
    </main>
  );
}
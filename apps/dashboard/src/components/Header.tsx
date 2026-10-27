'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AgentMode, ViewportMode } from '../lib/types';
import { BuilderCapabilities } from '@wp-agent/contracts';
import { signOut } from '../app/auth/actions';

interface HeaderProps {
  selectedSite: string;
  onSelectSite?: (site: string) => void;
  availableSites?: Array<{ id: string; name: string; url: string }>;
  viewport: ViewportMode;
  onViewportChange: (viewport: ViewportMode) => void;
  apiConnected: boolean;
  agentMode: AgentMode;
  onAgentModeChange?: (mode: AgentMode) => void;
  capabilities?: BuilderCapabilities;
  showSignOut?: boolean;
  /** Called when the Publish button is clicked */
  onPublish?: () => void;
  /** Whether a publish proposal is actively being processed */
  activePublishProposal?: boolean;
  /** Active preview canvas mode tab */
  activeCanvasTab?: 'preview' | 'live' | 'code';
  onCanvasTabChange?: (tab: 'preview' | 'live' | 'code') => void;
  /** Current route / path being previewed */
  currentRoute?: string;
  /** Whether publish action is currently enabled */
  canPublish?: boolean;
}

function Icon({ d, className = 'h-4 w-4' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const MODE_META: Record<AgentMode, { label: string; hint: string; icon: string }> = {
  agent: {
    label: 'Read-only',
    hint: 'Inspect and plan safely. No writes.',
    icon: 'M12 3l7 3v5c0 4.4-3 8.4-7 9.5C8 19.4 5 15.4 5 11V6l7-3z',
  },
  writes: {
    label: 'Writes',
    hint: 'Stage WordPress changes with approval.',
    icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  },
  chat: {
    label: 'Chat',
    hint: 'Talk to the model without tools.',
    icon: 'M21 12a8 8 0 01-8 8H5l-2 2V12a8 8 0 018-8h2a8 8 0 018 8z',
  },
};

export function Header({
  selectedSite,
  onSelectSite,
  availableSites,
  viewport,
  onViewportChange,
  apiConnected,
  agentMode,
  onAgentModeChange,
  capabilities,
  showSignOut = false,
  onPublish,
  activePublishProposal = false,
  activeCanvasTab = 'preview',
  onCanvasTabChange,
  currentRoute = '/',
  canPublish = true,
}: HeaderProps) {
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const projectMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!showSignOut) return;
    let cancelled = false;

    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.user?.email === 'string') setAccountEmail(data.user.email);
      })
      .catch(() => {
        // SessionGuard owns the 401 flow; keep the menu usable offline.
      });

    return () => {
      cancelled = true;
    };
  }, [showSignOut]);

  const accountInitial = (accountEmail?.[0] ?? 'U').toUpperCase();
  const sitePill = selectedSite.replace(/https?:\/\//, '').replace(/\/$/, '');
  const activeSite = availableSites?.find((site) => site.url === selectedSite);
  const projectName = sitePill;
  const mode = MODE_META[agentMode];

  const cycleMode = () => {
    if (!onAgentModeChange) return;
    const next: AgentMode = agentMode === 'writes' ? 'agent' : agentMode === 'agent' ? 'chat' : 'writes';
    onAgentModeChange(next);
  };

  const tabs: Array<{ id: 'preview' | 'live' | 'code'; label: string; icon: string }> = [
    { id: 'preview', label: 'Preview', icon: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z' },
    { id: 'live', label: 'Live', icon: 'M12 21a9 9 0 100-18 9 9 0 000 18z M3.5 9h17M3.5 15h17M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z' },
    { id: 'code', label: 'Code', icon: 'M8 6l-5 6 5 6M16 6l5 6-5 6' },
  ];

  return (
    <header className="glass z-30 flex h-14 shrink-0 select-none items-center justify-between gap-3 border-b border-line px-3 text-ink sm:px-4">
      {/* Brand + project */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white shadow-sm">
          <Icon d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" className="h-4 w-4" />
        </div>
        <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">SitePilot</span>

        <Link
          href="/about"
          className="focus-ring hidden rounded-lg px-2 py-1 text-[12px] font-medium text-ink-muted transition hover:bg-paper-deep hover:text-ink sm:inline-flex"
        >
          About
        </Link>

        <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />

        <details className="group relative min-w-0" ref={projectMenuRef}>
          <summary
            className="focus-ring flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] font-medium text-ink-soft transition hover:bg-paper-deep [&::-webkit-details-marker]:hidden"
            title={activeSite ? `${activeSite.name} — switch project` : 'Switch project / local site'}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${apiConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}
              aria-hidden="true"
            />
            <span className="max-w-[120px] truncate sm:max-w-[190px]">{projectName}</span>
            <Icon d="M6 9l6 6 6-6" className="h-3.5 w-3.5 text-ink-muted" />
          </summary>

          {availableSites && availableSites.length > 0 && onSelectSite ? (
            <div className="surface-card absolute left-0 top-full z-50 mt-2 w-72 rounded-xl p-1.5">
              <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Local sites
              </div>
              {availableSites.map((site) => {
                const active = selectedSite === site.url;
                return (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => {
                      onSelectSite(site.url);
                      projectMenuRef.current?.removeAttribute('open');
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                      active ? 'bg-paper-deep text-ink' : 'text-ink-soft hover:bg-paper-deep/70'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{site.name}</span>
                      <span className="block truncate font-mono text-[10px] text-ink-muted">
                        {site.url.replace(/https?:\/\//, '')}
                      </span>
                    </span>
                    {active ? (
                      <Icon d="M20 6L9 17l-5-5" className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : null}
                  </button>
                );
              })}
              <div className="mt-1 space-y-1.5 border-t border-line px-2.5 py-2">
                {capabilities ? (
                  <div className="flex flex-wrap gap-1">
                    {[
                      capabilities.gutenberg ? 'Gutenberg' : null,
                      capabilities.elementor ? 'Elementor' : null,
                      capabilities.acf ? 'ACF' : null,
                      capabilities.woocommerce ? 'WooCommerce' : null,
                    ]
                      .filter((item): item is string => Boolean(item))
                      .map((item) => (
                        <span
                          key={item}
                          className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[9px] font-medium text-ink-soft"
                        >
                          {item}
                        </span>
                      ))}
                  </div>
                ) : null}
                <div className="text-[10px] text-ink-muted">
                  {apiConnected ? 'Backend connected' : 'Backend offline — start the API on :3001'}
                </div>
              </div>
            </div>
          ) : null}
        </details>
      </div>

      {/* Surface tabs */}
      {onCanvasTabChange ? (
        <div className="hidden items-center gap-0.5 rounded-full border border-line bg-white/80 p-0.5 shadow-sm md:flex">
          {tabs.map((tab) => {
            const active = activeCanvasTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onCanvasTabChange(tab.id)}
                className={`focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  active ? 'bg-ink text-white shadow-sm' : 'text-ink-muted hover:bg-paper-deep hover:text-ink'
                }`}
                aria-pressed={active}
              >
                <Icon d={tab.icon} className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {currentRoute ? (
          <span className="mr-1 hidden items-center gap-1.5 rounded-md border border-line bg-white/70 px-2 py-1 font-mono text-[11px] text-ink-muted xl:flex">
            <Icon d="M4 5h16v14H4z M4 9h16" className="h-3 w-3" />
            {currentRoute}
          </span>
        ) : null}

        <button
          type="button"
          onClick={cycleMode}
          disabled={!onAgentModeChange}
          title={`${mode.hint} Click to switch.`}
          className="focus-ring hidden items-center gap-1.5 rounded-full border border-line bg-white/70 px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition hover:bg-paper-deep disabled:cursor-default lg:flex"
        >
          <Icon d={mode.icon} className="h-3.5 w-3.5 text-pink-500" />
          <span>{mode.label}</span>
        </button>

        <div
          className="hidden items-center gap-0.5 rounded-full border border-line bg-white/70 p-0.5 sm:flex"
          role="group"
          aria-label="Canvas viewport"
        >
          {(
            [
              { id: 'desktop' as ViewportMode, label: 'Desktop', icon: 'M3 5h18v11H3z M8 20h8M12 16v4' },
              { id: 'tablet' as ViewportMode, label: 'Tablet', icon: 'M6 3h12v18H6z M11 18h2' },
              { id: 'mobile' as ViewportMode, label: 'Mobile', icon: 'M8 3h8v18H8z M11 18h2' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewportChange(item.id)}
              title={item.label}
              aria-label={`${item.label} viewport`}
              aria-pressed={viewport === item.id}
              className={`focus-ring rounded-full p-1.5 transition ${
                viewport === item.id ? 'bg-ink text-white' : 'text-ink-muted hover:bg-paper-deep hover:text-ink'
              }`}
            >
              <Icon d={item.icon} className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(window.location.href);
          }}
          className="focus-ring hidden items-center gap-1.5 rounded-full border border-line bg-white/70 px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition hover:bg-paper-deep sm:flex"
          title="Copy workspace link"
        >
          <Icon d="M8.6 13.4a3 3 0 004.2 0l2.8-2.8a3 3 0 10-4.2-4.2L10 7.8 M15.4 10.6a3 3 0 00-4.2 0l-2.8 2.8a3 3 0 104.2 4.2l1.4-1.4" className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Share</span>
        </button>

        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish || activePublishProposal}
          className="focus-ring flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-stone-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5"
          title="Publish to WordPress"
        >
          {activePublishProposal ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
              <span>Publishing</span>
            </>
          ) : (
            <>
              <Icon d="M12 19V5M6 11l6-6 6 6" className="h-3.5 w-3.5" />
              <span>Publish</span>
            </>
          )}
        </button>

        {showSignOut ? (
          <details className="relative">
            <summary
              className="focus-ring flex cursor-pointer list-none items-center rounded-full p-0.5 transition hover:ring-2 hover:ring-line [&::-webkit-details-marker]:hidden"
              title="Account menu"
            >
              <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white">
                {accountInitial}
              </span>
            </summary>

            <div className="surface-card absolute right-0 top-full z-50 mt-2 w-64 rounded-xl p-1.5">
              <div className="px-2.5 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Signed in as</div>
                <div className="mt-0.5 truncate text-[12px] text-ink" title={accountEmail ?? undefined}>
                  {accountEmail ?? 'Loading…'}
                </div>
              </div>
              <div className="my-1 h-px bg-line" />
              <Link
                href="/settings"
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-ink-soft transition hover:bg-paper-deep hover:text-ink"
              >
                <Icon d="M3 10h18M3 14h18M5 3v18M19 3v18M10 15l-3-3m0 0l3-3m-3 3l3 3" className="h-3.5 w-3.5" />
                Settings
              </Link>
              <Link
                href="/about"
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-ink-soft transition hover:bg-paper-deep hover:text-ink"
              >
                <Icon d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01" className="h-3.5 w-3.5" />
                About SitePilot
              </Link>
              <a
                href="/reset-password"
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-ink-soft transition hover:bg-paper-deep hover:text-ink"
              >
                <Icon d="M15 7a4 4 0 11-8 0 4 4 0 018 0z M12 11v10 M8 17h8" className="h-3.5 w-3.5" />
                Change password
              </a>
              <form action={signOut}>
                <button
                  type="submit"
                  className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-rose-600 transition hover:bg-rose-50"
                >
                  <Icon d="M15 17l5-5-5-5M20 12H9M12 3H5a2 2 0 00-2 2v14a2 2 0 002 2h7" className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </form>
            </div>
          </details>
        ) : null}
      </div>
    </header>
  );
}

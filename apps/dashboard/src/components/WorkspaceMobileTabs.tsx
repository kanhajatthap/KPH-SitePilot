'use client';

import {
  MOBILE_TABS,
  tabIndexForKey,
  type MobilePane,
} from '../lib/design-tokens';

interface WorkspaceMobileTabsProps {
  active: MobilePane;
  onChange: (pane: MobilePane) => void;
}

/**
 * Phone-only pane switcher (E9-16). Hidden at `md` and above where the
 * two-pane split is always visible. `role="tablist"` + arrow/Home/End keys
 * follow the WAI-ARIA tabs pattern; both panes stay mounted (CSS `hidden`) so
 * chat scroll position and the drafted prompt survive a tab switch.
 */
export function WorkspaceMobileTabs({ active, onChange }: WorkspaceMobileTabsProps) {
  const moveFocus = (index: number) => {
    const tab = MOBILE_TABS[index];
    if (!tab) return;
    onChange(tab.id);
    document.getElementById(tab.tabId)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Workspace panes"
      className="flex shrink-0 items-stretch gap-1 border-b border-line bg-white/85 px-safe pt-safe md:hidden"
    >
      {MOBILE_TABS.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={tab.tabId}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tab.panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              const next = tabIndexForKey(event.key, index, MOBILE_TABS.length);
              if (next === null) return;
              event.preventDefault();
              moveFocus(next);
            }}
            className={`focus-ring min-touch flex flex-1 items-center justify-center gap-2 rounded-t-xl px-3 text-xs font-medium transition ${
              selected
                ? 'bg-paper-deep text-ink shadow-[inset_0_-2px_0_0_var(--brand-2)]'
                : 'text-ink-muted hover:bg-paper-deep/60 hover:text-ink'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path d={tab.icon} />
            </svg>
            {tab.label}
            {selected ? <span className="sr-only">(selected)</span> : null}
          </button>
        );
      })}
    </div>
  );
}

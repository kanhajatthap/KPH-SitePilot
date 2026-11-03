'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  COMMANDS,
  filterCommands,
  isPaletteDismiss,
  isPaletteShortcut,
  paletteSelectionKey,
  shortcutLabel,
  type CommandDefinition,
} from '../lib/command-palette';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
  platform?: 'mac' | 'other';
  commands?: readonly CommandDefinition[];
}

/**
 * E9-15 — accessible ⌘K / Ctrl+K command palette.
 * The input keeps focus (combobox + listbox + aria-activedescendant), arrow keys
 * wrap, Escape closes, and IME composition is never interrupted.
 */
export function CommandPalette({
  open,
  onClose,
  onNavigate,
  platform = 'other',
  commands = COMMANDS,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const results = useMemo(() => filterCommands(query, commands), [query, commands]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const select = (command: CommandDefinition) => {
    onNavigate(command.href);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const native = event.nativeEvent as KeyboardEvent;
    const keyEvent = {
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: native.isComposing,
    };

    if (isPaletteDismiss(keyEvent) || isPaletteShortcut(keyEvent)) {
      event.preventDefault();
      onClose();
      return;
    }
    if (keyEvent.isComposing) return;

    const next = paletteSelectionKey(keyEvent, active, results.length);
    if (next !== null) {
      event.preventDefault();
      setActive(next);
      return;
    }
    if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      select(results[active]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-command-palette-backdrop="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={handleKeyDown}
        data-command-palette="true"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
      >
        <div className="border-b border-line p-3">
          <label htmlFor={`${baseId}-input`} className="sr-only">
            Search commands
          </label>
          <input
            id={`${baseId}-input`}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${baseId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? `${baseId}-option-${active}` : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands…"
            className="min-h-touch w-full rounded-lg bg-paper px-3 text-sm text-ink outline-none focus:outline-none"
          />
        </div>

        <ul
          id={`${baseId}-list`}
          role="listbox"
          aria-label="Commands"
          className="max-h-[50vh] overflow-y-auto py-2"
        >
          {results.map((command, index) => (
            <li
              key={command.id}
              id={`${baseId}-option-${index}`}
              role="option"
              aria-selected={index === active}
              data-command-id={command.id}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(command)}
              className={`min-h-touch flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${
                index === active ? 'bg-pink-50 text-pink-950' : 'text-ink'
              }`}
            >
              <span className="flex flex-col">
                <span className="font-medium">{command.label}</span>
                <span className="text-[11px] text-ink-muted">{command.hint}</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-muted">
                {command.shortcut ?? command.group}
              </span>
            </li>
          ))}
          {results.length === 0 ? (
            <li role="presentation" className="px-4 py-6 text-center text-xs text-ink-muted">
              No matching commands.
            </li>
          ) : null}
        </ul>

        <footer className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 text-[10px] text-ink-muted">
          <span>{shortcutLabel(platform)} toggle</span>
          <span>↑ ↓ move</span>
          <span>Enter open</span>
          <span>Esc close</span>
        </footer>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { COMMANDS, KEYBOARD_SHORTCUTS } from '../../../lib/command-palette';

export const metadata: Metadata = {
  title: 'Keyboard shortcuts — KPH SitePilot Docs',
  description:
    'The command palette (⌘K / Ctrl+K), composer submit, activity navigation and accessible keyboard behaviour in the workspace.',
};

export default function ShortcutsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link href="/docs" className="text-sm text-ink-muted underline-offset-4 hover:underline">
        ← All documentation
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Keyboard shortcuts</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        The command palette is a searchable, keyboard-first way to reach every major screen. It keeps
        focus in one combobox, announces the active option to assistive technology, and never fires
        while an IME composition is in progress. Single-key shortcuts are ignored inside text fields,
        so typing a letter never navigates away from a draft.
      </p>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Shortcut reference</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-[12px]">
            <thead className="border-b border-line text-[10px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">macOS</th>
                <th className="px-4 py-3 font-medium">Windows / Linux</th>
                <th className="px-4 py-3 font-medium">What it does</th>
              </tr>
            </thead>
            <tbody>
              {KEYBOARD_SHORTCUTS.map((shortcut) => (
                <tr key={shortcut.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{shortcut.label}</td>
                  <td className="px-4 py-3">
                    <kbd className="rounded border border-line bg-paper px-1.5 py-0.5">{shortcut.mac}</kbd>
                  </td>
                  <td className="px-4 py-3">
                    <kbd className="rounded border border-line bg-paper px-1.5 py-0.5">{shortcut.other}</kbd>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{shortcut.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Palette commands</h2>
        <p className="mt-1 text-[12px] text-ink-muted">
          Type to filter (every word must match), use ↑ ↓ to move, Enter to open, Escape to close.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {COMMANDS.map((command) => (
            <li key={command.id} className="rounded-xl border border-line bg-white p-3">
              <span className="block text-[13px] font-medium text-ink">{command.label}</span>
              <span className="mt-1 block text-[11px] text-ink-muted">{command.hint}</span>
              <Link href={command.href} className="mt-2 inline-block text-[11px] font-medium text-pink-700 hover:underline">
                {command.href} →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-2xl border border-pink-200 bg-pink-50 p-5">
        <h2 className="text-sm font-semibold text-pink-950">Accessibility notes</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-pink-900/80">
          <li>The palette is a labelled dialog with a combobox input and a listbox of options.</li>
          <li>The active option is exposed with <code>aria-activedescendant</code>; arrow keys wrap.</li>
          <li>⌘/Ctrl+↵ in the composer is IME-safe — a composition never submits a draft.</li>
          <li>Touch targets meet the 44px mobile minimum, including the palette options.</li>
        </ul>
      </section>
    </main>
  );
}

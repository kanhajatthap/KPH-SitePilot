'use client';

import { useState } from 'react';
import Link from 'next/link';
import { searchDocs, type DocEntry } from '../../lib/docs';

/**
 * Client-side search over the static docs index (E9-19). There is no backend:
 * a short, honest empty state tells the user exactly what was searched.
 */
export function DocsSearch({ entries }: { entries: DocEntry[] }) {
  const [query, setQuery] = useState('');
  const results = searchDocs(query, entries);
  const trimmed = query.trim();

  return (
    <section aria-label="Search documentation" className="mt-6 rounded-2xl border border-line bg-white p-4 shadow-sm">
      <label htmlFor="docs-search" className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        Search the docs
      </label>
      <input
        id="docs-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Try “pairing code”, “undo”, “rate limit”…"
        autoComplete="off"
        className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
      />
      <p className="mt-2 text-[10px] text-ink-muted" aria-live="polite">
        {trimmed
          ? `${results.length} page${results.length === 1 ? '' : 's'} match “${trimmed}”`
          : `${entries.length} pages · searching titles, summaries and keywords (no server)`}
      </p>

      {trimmed ? (
        results.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {results.map((entry) => (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  className="block rounded-xl border border-line bg-paper/60 px-3 py-2 transition hover:border-pink-300 hover:bg-white"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink">{entry.title}</span>
                    <span className="text-[10px] text-ink-muted">
                      {entry.section} · {entry.readingMinutes} min
                      {entry.note ? ` · ${entry.note}` : ''}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-muted">
                    {entry.summary}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Nothing matched. Try a shorter term, or{' '}
            <Link href="/docs/connector" className="font-semibold underline">
              start with the connect guide
            </Link>
            .
          </p>
        )
      ) : null}
    </section>
  );
}

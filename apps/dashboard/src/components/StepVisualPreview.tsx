'use client';

import React from 'react';

export interface PreviewStep {
  tool: string;
  args: Record<string, unknown>;
  risk: 'R0' | 'R1' | 'R2' | 'R3';
  summary: string;
}

interface ParsedContentAtom {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'button';
  text: string;
  href?: string;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function extractGutenbergBlockTypes(html: string): string[] {
  const matches = html.matchAll(/<!--\s*wp:([a-z0-9/-]+)/gi);
  const counts = new Map<string, number>();
  for (const m of matches) {
    const name = m[1].toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, count]) =>
    count > 1 ? `wp:${name} ×${count}` : `wp:${name}`
  );
}

export function extractVisualAtoms(html: string): ParsedContentAtom[] {
  const atoms: ParsedContentAtom[] = [];
  const tokenRe =
    /<(h1|h2|h3|p|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  for (const match of html.matchAll(tokenRe)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? '';
    const inner = stripTags(match[3] ?? '');
    if (!inner) continue;

    if (tag === 'a') {
      if (!/wp-block-button__link|wp-element-button/i.test(attrs)) continue;
      const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
      atoms.push({ kind: 'button', text: inner, href: hrefMatch?.[1] });
    } else if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'p') {
      atoms.push({ kind: tag, text: inner });
    }
    if (atoms.length >= 16) break;
  }

  return atoms;
}

export function StepVisualPreview({
  step,
  siteUrl,
}: {
  step: PreviewStep;
  siteUrl?: string;
}) {
  const args = step.args ?? {};

  // 1. Content / Gutenberg Block Visual Preview (E9-06 / E9-07)
  if (
    step.tool === 'content.create' ||
    step.tool === 'content.update' ||
    step.tool === 'blocks.replace'
  ) {
    const rawHtml =
      typeof args.content === 'string'
        ? args.content
        : typeof args.html === 'string'
          ? args.html
          : '';
    const title = typeof args.title === 'string' ? args.title : null;
    const status = typeof args.status === 'string' ? args.status : null;
    const blockBadges = rawHtml ? extractGutenbergBlockTypes(rawHtml) : [];
    const atoms = rawHtml ? extractVisualAtoms(rawHtml) : [];

    if (!rawHtml && !title && !status) return null;

    return (
      <div className="mt-2.5 rounded-xl border border-stone-200/80 bg-stone-50/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink/60">
          <span className="font-semibold uppercase tracking-wide text-ink/50">
            Visual Layout &amp; Copy Preview
          </span>
          <div className="flex flex-wrap gap-1">
            {status ? (
              <span className="rounded bg-white px-2 py-0.5 font-medium text-ink/75 shadow-sm">
                status: {status}
              </span>
            ) : null}
            {blockBadges.slice(0, 6).map((badge) => (
              <code
                key={badge}
                className="rounded bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium text-pink-800"
              >
                {badge}
              </code>
            ))}
          </div>
        </div>

        <div className="mt-2 space-y-1.5 rounded-lg border border-black/5 bg-white p-3.5 shadow-sm">
          {title ? (
            <p className="text-base font-bold text-ink">{title}</p>
          ) : null}
          {atoms.length > 0 ? (
            atoms.map((atom, idx) => {
              if (atom.kind === 'h1') {
                return (
                  <p key={idx} className="text-base font-bold text-ink">
                    {atom.text}
                  </p>
                );
              }
              if (atom.kind === 'h2') {
                return (
                  <p key={idx} className="pt-1 text-sm font-semibold text-ink">
                    {atom.text}
                  </p>
                );
              }
              if (atom.kind === 'h3') {
                return (
                  <p key={idx} className="pt-0.5 text-xs font-semibold text-ink/90">
                    • {atom.text}
                  </p>
                );
              }
              if (atom.kind === 'button') {
                return (
                  <span
                    key={idx}
                    className="mr-2 inline-block rounded-md bg-ink px-2.5 py-1 text-[11px] font-medium text-white"
                  >
                    {atom.text}
                    {atom.href ? ` (${atom.href})` : ''}
                  </span>
                );
              }
              return (
                <p key={idx} className="text-xs leading-relaxed text-ink/70">
                  {atom.text}
                </p>
              );
            })
          ) : rawHtml ? (
            <p className="text-xs text-ink/70">{stripTags(rawHtml).slice(0, 300)}</p>
          ) : null}
        </div>

        {rawHtml ? (
          <details className="mt-2 text-[11px] text-ink/60">
            <summary className="cursor-pointer font-medium hover:text-ink">
              Inspect raw Gutenberg block HTML ({rawHtml.length} chars)
            </summary>
            <pre className="mt-1.5 max-h-44 overflow-auto rounded-lg bg-black/[0.04] p-2 font-mono text-[10px]">
              {rawHtml}
            </pre>
          </details>
        ) : null}
      </div>
    );
  }

  // 2. SEO Search Snippet Preview (E7-02)
  if (step.tool === 'seo.meta.update') {
    const seoTitle = typeof args.title === 'string' ? args.title : null;
    const seoDesc = typeof args.description === 'string' ? args.description : null;
    const canonical =
      typeof args.canonical === 'string' && args.canonical
        ? args.canonical
        : `${(siteUrl ?? 'https://example.com').replace(/\/+$/, '')}/?p=${String(args.id ?? '')}`;
    const noindex = typeof args.noindex === 'boolean' ? args.noindex : null;

    return (
      <div className="mt-2.5 rounded-xl border border-stone-200/80 bg-stone-50/70 p-3">
        <div className="flex items-center justify-between text-[11px] text-ink/60">
          <span className="font-semibold uppercase tracking-wide text-ink/50">
            Search Snippet Preview
          </span>
          {noindex !== null ? (
            <span
              className={`rounded px-2 py-0.5 font-medium ${
                noindex ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
              }`}
            >
              {noindex ? 'noindex enabled' : 'indexable'}
            </span>
          ) : null}
        </div>
        <div className="mt-2 rounded-lg border border-black/5 bg-white p-3 shadow-sm">
          <p className="truncate text-[11px] text-emerald-800">{canonical}</p>
          {seoTitle ? (
            <p className="mt-0.5 text-sm font-semibold text-blue-800">{seoTitle}</p>
          ) : null}
          {seoDesc ? (
            <p className="mt-0.5 text-xs text-ink/70">{seoDesc}</p>
          ) : null}
        </div>
      </div>
    );
  }

  // 3. Navigation Menu Bar Preview (E5-13)
  if (step.tool === 'menus.save' && Array.isArray(args.items)) {
    const items = args.items as Array<{ title?: string; url?: string }>;
    return (
      <div className="mt-2.5 rounded-xl border border-stone-200/80 bg-stone-50/70 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">
          Navigation Menu Preview
        </p>
        <div className="mt-2 flex flex-wrap gap-2 rounded-lg border border-black/5 bg-white p-2.5 shadow-sm">
          {items.map((item, idx) => (
            <span
              key={idx}
              className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-ink"
              title={item.url}
            >
              {item.title} <span className="text-ink/45">({item.url})</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Static documentation index (E9-19).
 *
 * Pure and dependency-free on purpose: the same array drives the docs hub,
 * the shared docs nav and the client-side search box, so a page can never be
 * missing from the search index. No CMS, no network, no build-time fetch.
 */

export type DocSection = 'Start here' | 'Reference' | 'Safety' | 'Help';

export interface DocEntry {
  href: string;
  title: string;
  navLabel: string;
  summary: string;
  section: DocSection;
  keywords: readonly string[];
  readingMinutes: number;
  /** Set when a card links to a page that needs a session. */
  note?: string;
}

export const DOCS_SECTIONS: readonly DocSection[] = ['Start here', 'Reference', 'Safety', 'Help'];

export const DOCS_ENTRIES: readonly DocEntry[] = [
  {
    href: '/docs',
    title: 'Documentation home',
    navLabel: 'Overview',
    summary: 'Everything you need to connect a WordPress site and make a safe first change.',
    section: 'Start here',
    keywords: ['index', 'start', 'overview', 'hub'],
    readingMinutes: 1,
  },
  {
    href: '/docs/connector',
    title: 'Install the SitePilot Connector',
    navLabel: 'Connect',
    summary: 'Requirements, the five-step install, pairing codes, scopes and first heartbeat.',
    section: 'Start here',
    keywords: ['plugin', 'zip', 'pairing', 'code', 'wordpress', 'install', 'activate', 'heartbeat'],
    readingMinutes: 5,
  },
  {
    href: '/onboarding',
    title: 'Guided first-time setup',
    navLabel: 'Setup wizard',
    summary: 'Three steps: download the plugin, pair with a code, verify the first heartbeat.',
    section: 'Start here',
    keywords: ['wizard', 'first time', 'getting started', 'stepper', 'verify'],
    readingMinutes: 2,
    note: 'Sign-in required',
  },
  {
    href: '/docs/tools',
    title: 'Tool catalog (34 shipped tools)',
    navLabel: 'Tools',
    summary: 'Every allowlisted tool with its family, scope, risk floor and undo support.',
    section: 'Reference',
    keywords: ['catalog', 'tool', 'allowlist', 'risk', 'r0', 'r1', 'r2', 'r3', 'scopes', 'capabilities'],
    readingMinutes: 8,
  },
  {
    href: '/docs/shortcuts',
    title: 'Keyboard shortcuts & command palette',
    navLabel: 'Shortcuts',
    summary: '⌘K / Ctrl+K palette, composer submit, activity navigation and accessible keyboard behaviour.',
    section: 'Reference',
    keywords: ['keyboard', 'shortcut', 'palette', 'cmd', 'ctrl', 'k', 'arrow', 'accessibility', 'ime'],
    readingMinutes: 3,
  },
  {
    href: '/docs/safety',
    title: 'Safety, snapshots & one-click undo',
    navLabel: 'Safety',
    summary: 'Plan → approve → snapshot → write → read-back verify → undo. Why nothing writes silently.',
    section: 'Safety',
    keywords: ['approval', 'snapshot', 'undo', 'rollback', 'verify', 'risk', 'confirm', 'write'],
    readingMinutes: 6,
  },
  {
    href: '/docs/troubleshooting',
    title: 'Troubleshooting & error codes',
    navLabel: 'Troubleshooting',
    summary: 'What each error means and the single next action that clears it.',
    section: 'Help',
    keywords: ['error', 'code', 'offline', 'expired', 'rate limit', 'quota', 'failed', 'recovery', '401', '429'],
    readingMinutes: 5,
  },
  {
    href: '/docs/faq',
    title: 'Frequently asked questions',
    navLabel: 'FAQ',
    summary: 'Hosting, model keys, email delivery, data storage and what is not shipped yet.',
    section: 'Help',
    keywords: ['faq', 'questions', 'byok', 'keys', 'email', 'resend', 'hosting', 'domain', 'limits'],
    readingMinutes: 4,
  },
];

/** All query terms must match somewhere in the entry; title hits rank first. */
export function searchDocs(query: string, entries: readonly DocEntry[] = DOCS_ENTRIES): DocEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...entries];

  return entries
    .map((entry) => {
      const haystack = [
        entry.title,
        entry.navLabel,
        entry.summary,
        entry.section,
        ...entry.keywords,
      ]
        .join(' ')
        .toLowerCase();
      const matched = terms.filter((term) => haystack.includes(term)).length;
      const titleHit = terms.some((term) => entry.title.toLowerCase().includes(term)) ? 1 : 0;
      return { entry, matched, titleHit };
    })
    .filter((candidate) => candidate.matched === terms.length)
    .sort(
      (a, b) =>
        b.titleHit - a.titleHit ||
        a.entry.section.localeCompare(b.entry.section) ||
        a.entry.title.localeCompare(b.entry.title)
    )
    .map((candidate) => candidate.entry);
}

export function docsBySection(
  entries: readonly DocEntry[] = DOCS_ENTRIES
): Array<{ section: DocSection; entries: DocEntry[] }> {
  return DOCS_SECTIONS.map((section) => ({
    section,
    entries: entries.filter((entry) => entry.section === section),
  })).filter((group) => group.entries.length > 0);
}

/** Plain, serialisable tool row derived from the canonical catalog. */
export interface DocToolRow {
  tool: string;
  label: string;
  family: string;
  scope: string;
  risk: string;
  reversible: boolean;
  shipped: boolean;
}

/** Groups tool rows by family with stable ordering for the reference page. */
export function groupToolSpecs(
  rows: readonly DocToolRow[]
): Array<{ family: string; rows: DocToolRow[] }> {
  const families = new Map<string, DocToolRow[]>();
  for (const row of rows) {
    const list = families.get(row.family) ?? [];
    list.push(row);
    families.set(row.family, list);
  }
  return [...families.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, group]) => ({
      family,
      rows: [...group].sort((a, b) => a.tool.localeCompare(b.tool)),
    }));
}

export function docsIndexIsValid(entries: readonly DocEntry[] = DOCS_ENTRIES): boolean {
  const hrefs = entries.map((entry) => entry.href);
  return (
    hrefs.length > 0 &&
    new Set(hrefs).size === hrefs.length &&
    entries.every(
      (entry) =>
        (entry.href === '/onboarding' || entry.href.startsWith('/docs')) &&
        entry.title.trim().length > 0 &&
        entry.summary.trim().length > 0 &&
        entry.navLabel.trim().length > 0 &&
        entry.keywords.length > 0 &&
        entry.readingMinutes > 0
    )
  );
}

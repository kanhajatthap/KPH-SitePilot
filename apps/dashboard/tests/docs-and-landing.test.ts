import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_SITE_SCOPES, RISK_ORDER, SHIPPED_TOOL_SPECS } from '@wp-agent/wp-tools';
import {
  DOCS_ENTRIES,
  DOCS_SECTIONS,
  docsBySection,
  docsIndexIsValid,
  groupToolSpecs,
  searchDocs,
  type DocToolRow,
} from '../src/lib/docs';
import {
  LANDING_CTA,
  LANDING_FOOTER_LINKS,
  LANDING_GUARANTEES,
  LANDING_SECONDARY,
  LANDING_STEPS,
} from '../src/lib/landing';
import { isPublicPagePath } from '../src/lib/auth/routes';

const APP_DIR = path.resolve(__dirname, '../src/app');

function toolRows(): DocToolRow[] {
  return SHIPPED_TOOL_SPECS.map((spec) => ({
    tool: spec.tool,
    label: spec.label,
    family: spec.family,
    scope: spec.scope,
    risk: spec.risk,
    reversible: spec.reversible,
    shipped: spec.shipped,
  }));
}

describe('E9-19 documentation index', () => {
  it('is a valid, deduplicated index where only the wizard needs a session', () => {
    expect(docsIndexIsValid()).toBe(true);
    const hrefs = DOCS_ENTRIES.map((entry) => entry.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    const gated = DOCS_ENTRIES.filter((entry) => !isPublicPagePath(entry.href));
    expect(gated.map((entry) => entry.href)).toEqual(['/onboarding']);
    expect(gated[0].note).toBeTruthy();
    for (const entry of DOCS_ENTRIES.filter((item) => !gated.includes(item))) {
      expect(entry.note, entry.href).toBeUndefined();
    }
  });

  it('points every entry at a route that actually exists', () => {
    for (const entry of DOCS_ENTRIES) {
      const rel = entry.href === '/docs' ? 'docs/page.tsx' : `${entry.href.slice(1)}/page.tsx`;
      const file = path.join(APP_DIR, rel);
      expect(fs.existsSync(file), `${entry.href} -> ${file}`).toBe(true);
    }
  });

  it('covers all four sections with no empty group', () => {
    const groups = docsBySection();
    expect(groups.map((group) => group.section)).toEqual([...DOCS_SECTIONS]);
    expect(groups.reduce((sum, group) => sum + group.entries.length, 0)).toBe(DOCS_ENTRIES.length);
    for (const group of groups) expect(group.entries.length, group.section).toBeGreaterThan(0);
  });

  it('keeps every searchable entry in the index (including the wizard)', () => {
    expect(DOCS_ENTRIES.some((entry) => entry.href === '/onboarding')).toBe(true);
    expect(DOCS_ENTRIES.some((entry) => entry.href === '/docs/connector')).toBe(true);
    expect(DOCS_ENTRIES.length).toBeGreaterThanOrEqual(7);
  });

  it('returns the whole index for an empty or whitespace query', () => {
    expect(searchDocs('')).toEqual([...DOCS_ENTRIES]);
    expect(searchDocs('   ')).toEqual([...DOCS_ENTRIES]);
  });

  it('matches titles, summaries and keywords case-insensitively', () => {
    expect(searchDocs('UNDO').map((e) => e.href)).toContain('/docs/safety');
    expect(searchDocs('pairing').map((e) => e.href)).toContain('/docs/connector');
    expect(searchDocs('rate limit').map((e) => e.href)).toContain('/docs/troubleshooting');
    expect(searchDocs('byok').map((e) => e.href)).toContain('/docs/faq');
  });

  it('requires every term to match (AND, not OR)', () => {
    expect(searchDocs('undo banana')).toEqual([]);
    expect(searchDocs('snapshot verify').map((e) => e.href)).toContain('/docs/safety');
  });

  it('ranks title hits ahead of summary-only hits', () => {
    const base = DOCS_ENTRIES[0];
    const custom = [
      { ...base, href: '/docs/a', title: 'Reference appendix', summary: 'Undo is mentioned here.' },
      { ...base, href: '/docs/b', title: 'Undo guide', summary: 'A separate page.' },
    ];
    const results = searchDocs('undo', custom);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Undo guide');
  });

  it('never mutates the source array and is stable across calls', () => {
    const before = DOCS_ENTRIES.map((entry) => entry.href).join('|');
    const first = searchDocs('undo').map((entry) => entry.href).join('|');
    const second = searchDocs('undo').map((entry) => entry.href).join('|');
    expect(first).toBe(second);
    expect(DOCS_ENTRIES.map((entry) => entry.href).join('|')).toBe(before);
  });

  it('supports a custom index without touching the global one', () => {
    const custom = [DOCS_ENTRIES[1], DOCS_ENTRIES[3]];
    expect(searchDocs('pairing', custom)).toEqual([custom[0]]);
    expect(docsBySection(custom).map((group) => group.section)).toEqual(['Start here', 'Reference']);
    expect(docsIndexIsValid([])).toBe(false);
  });
});

describe('E9-19 tool catalog honesty', () => {
  it('derives exactly the shipped tools from the canonical catalog', () => {
    const rows = toolRows();
    expect(rows.length).toBe(34);
    expect(rows.every((row) => row.shipped)).toBe(true);
    expect(new Set(rows.map((row) => row.tool)).size).toBe(rows.length);
  });

  it('uses only declared scopes and risk floors', () => {
    for (const row of toolRows()) {
      expect(ALL_SITE_SCOPES).toContain(row.scope as (typeof ALL_SITE_SCOPES)[number]);
      expect(RISK_ORDER).toContain(row.risk as (typeof RISK_ORDER)[number]);
    }
  });

  it('groups by family with stable alphabetical order', () => {
    const groups = groupToolSpecs(toolRows());
    expect(groups.length).toBeGreaterThan(3);
    expect(groups.map((group) => group.family)).toEqual(
      [...groups.map((group) => group.family)].sort()
    );
    expect(groups.reduce((sum, group) => sum + group.rows.length, 0)).toBe(34);
    for (const group of groups) {
      expect(group.rows.map((row) => row.tool)).toEqual(
        [...group.rows.map((row) => row.tool)].sort()
      );
    }
  });

  it('does not fabricate tools for the roadmap-only families', () => {
    const rows = toolRows();
    expect(rows.some((row) => row.scope === 'commerce')).toBe(false);
    expect(rows.some((row) => row.scope === 'files')).toBe(false);
    expect(rows.some((row) => row.scope === 'code')).toBe(false);
  });

  it('keeps read-only tools and reversible writes both visible', () => {
    const rows = toolRows();
    expect(rows.filter((row) => row.risk === 'R0').length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.risk !== 'R0' && row.reversible).length).toBeGreaterThan(0);
  });

  it('handles an empty and a synthetic row set deterministically', () => {
    expect(groupToolSpecs([])).toEqual([]);
    const rows: DocToolRow[] = [
      { tool: 'z.read', label: 'Z', family: 'beta', scope: 'read', risk: 'R0', reversible: false, shipped: true },
      { tool: 'a.read', label: 'A', family: 'alpha', scope: 'read', risk: 'R0', reversible: false, shipped: true },
      { tool: 'b.read', label: 'B', family: 'beta', scope: 'read', risk: 'R0', reversible: false, shipped: true },
    ];
    expect(groupToolSpecs(rows)).toEqual([
      { family: 'alpha', rows: [rows[1]] },
      { family: 'beta', rows: [rows[2], rows[0]] },
    ]);
  });
});

describe('E9-18 public landing page content', () => {
  it('points its primary and secondary CTAs at real public routes', () => {
    expect(isPublicPagePath(LANDING_CTA.href)).toBe(true);
    expect(isPublicPagePath(LANDING_SECONDARY.href)).toBe(true);
    expect(LANDING_CTA.href).toBe('/register');
    expect(LANDING_SECONDARY.href).toBe('/docs');
  });

  it('has three numbered steps that link to real routes, honestly flagged', () => {
    expect(LANDING_STEPS).toHaveLength(3);
    expect(LANDING_STEPS.map((step) => step.number)).toEqual(['01', '02', '03']);
    for (const step of LANDING_STEPS) {
      expect(fs.existsSync(path.join(APP_DIR, `${step.href.slice(1)}/page.tsx`)), step.href).toBe(true);
      expect(step.detail.length).toBeGreaterThan(40);
    }
    expect(LANDING_STEPS.filter((step) => !isPublicPagePath(step.href)).map((step) => step.href)).toEqual([
      '/onboarding',
    ]);
    expect(LANDING_STEPS.find((step) => step.href === '/onboarding')?.note).toBeTruthy();
  });

  it('keeps the four guarantees honest and non-numeric', () => {
    expect(LANDING_GUARANTEES).toHaveLength(4);
    for (const guarantee of LANDING_GUARANTEES) {
      expect(guarantee.label.length).toBeGreaterThan(0);
      expect(guarantee.detail.length).toBeGreaterThan(15);
      expect(guarantee.label).not.toMatch(/\d+%|million|customers/);
    }
  });

  it('keeps every internal footer link public', () => {
    for (const link of LANDING_FOOTER_LINKS) {
      if (link.href.startsWith('http')) {
        expect(link.href).toMatch(/^https:\/\/github\.com\//);
      } else {
        expect(isPublicPagePath(link.href), link.href).toBe(true);
      }
    }
  });
});

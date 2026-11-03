import type { Metadata } from 'next';
import Link from 'next/link';
import { SHIPPED_TOOL_SPECS } from '@wp-agent/wp-tools';
import { groupToolSpecs, type DocToolRow } from '../../../lib/docs';

export const metadata: Metadata = {
  title: 'Tool catalog — KPH SitePilot Docs',
  description:
    'The 34 shipped, allowlisted WordPress tools with their family, required scope, risk floor and undo support.',
};

const RISK_TONE: Record<string, string> = {
  R0: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  R1: 'bg-sky-50 text-sky-700 border-sky-200',
  R2: 'bg-amber-50 text-amber-800 border-amber-200',
  R3: 'bg-rose-50 text-rose-700 border-rose-200',
};

function buildRows(): DocToolRow[] {
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

export default function ToolsDocsPage() {
  const rows = buildRows();
  const groups = groupToolSpecs(rows);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link href="/docs" className="text-sm text-ink-muted underline-offset-4 hover:underline">
        ← All docs
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Tool catalog</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
        This list is generated from the same canonical catalog that gates the connector and the
        per-site capability graph — it is not a hand-maintained marketing list.{' '}
        <strong className="font-semibold text-ink">{rows.length} tools</strong> are shipped in
        Connector 1.0.0. A tool that the site&apos;s scopes do not allow never appears as an
        enabled action in the UI.
      </p>

      <div className="mt-5 flex flex-wrap gap-2 text-[10px]">
        {(['R0', 'R1', 'R2', 'R3'] as const).map((risk) => (
          <span key={risk} className={`rounded-full border px-2.5 py-1 font-semibold ${RISK_TONE[risk]}`}>
            {risk} · {risk === 'R0' ? 'read-only' : risk === 'R1' ? 'low-risk write' : risk === 'R2' ? 'typed confirm' : 'plan-id confirm'}
          </span>
        ))}
      </div>

      <div className="mt-8 space-y-8">
        {groups.map((group) => (
          <section key={group.family}>
            <h2 className="text-sm font-semibold text-ink">
              <span className="font-mono text-pink-600">{group.family}.*</span>
              <span className="ml-2 text-[11px] font-normal text-ink-muted">
                {group.rows.length} tool{group.rows.length === 1 ? '' : 's'}
              </span>
            </h2>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
              <table className="w-full min-w-[560px] border-collapse text-left text-[11px]">
                <thead className="bg-paper-deep text-[10px] uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Tool</th>
                    <th className="px-3 py-2 font-medium">What it does</th>
                    <th className="px-3 py-2 font-medium">Scope</th>
                    <th className="px-3 py-2 font-medium">Risk</th>
                    <th className="px-3 py-2 font-medium">Undo</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.tool} className="border-t border-line align-top">
                      <td className="px-3 py-2 font-mono text-[10px] text-ink">{row.tool}</td>
                      <td className="px-3 py-2 text-ink-soft">{row.label}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-ink-muted">{row.scope}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-1.5 py-0.5 font-semibold ${RISK_TONE[row.risk] ?? ''}`}>
                          {row.risk}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {row.risk === 'R0'
                          ? 'n/a (read)'
                          : row.reversible
                            ? 'snapshot + verify'
                            : 'verify only'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <section className="mt-10 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-semibold">How risk floors work</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          The model planner can raise a step&apos;s risk but never lower it below the catalog
          floor. R2 plans require the typed word <code className="rounded bg-paper-deep px-1 py-0.5 font-mono">CONFIRM</code>;
          R3 plans require the plan-id prefix. Every non-read tool takes a before snapshot and
          reads the site back after the write.
        </p>
        <Link href="/docs/safety" className="mt-3 inline-block text-xs font-medium text-pink-700 underline">
          Read the safety model →
        </Link>
      </section>
    </main>
  );
}

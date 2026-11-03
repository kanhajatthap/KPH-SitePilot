import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FAQ — KPH SitePilot Docs',
  description:
    'Honest answers about hosting, WordPress requirements, model keys, email delivery, data storage and what is not shipped yet.',
};

const FAQ = [
  {
    q: 'Does SitePilot need to be installed on my server?',
    a: 'Only one small WordPress plugin is installed — the connector. Everything else (the workspace, planner, snapshots and job queue) runs on the hosted deployment. Your site calls SitePilot over HTTPS; no inbound port is opened.',
  },
  {
    q: 'Which WordPress versions are supported?',
    a: 'WordPress 6.4 or newer and PHP 7.4 or newer (8.2+ recommended). You need administrator access to pair a site.',
  },
  {
    q: 'Can the AI change my site without asking?',
    a: 'No. Every write starts as a plan that needs your explicit approval. R2 plans require typing CONFIRM; R3 plans require the plan-id prefix. Read-only tools are the only ones that run without approval.',
  },
  {
    q: 'Do I need my own model API key?',
    a: 'No. A deterministic planner works without one. If you want model-assisted planning you can add a Gemini, OpenRouter or Groq key in Settings → AI Keys. Keys are stored encrypted, never re-displayed after save, and never appear on screen again.',
  },
  {
    q: 'What happens to my data?',
    a: 'Plans, snapshots, sites and audit events are stored in the project database with owner-scoped access. Site secrets are encrypted server-side. The connector ZIP release is public; the code is in the GitHub repository.',
  },
  {
    q: 'Why did my confirmation email not arrive?',
    a: 'This deployment sends mail through Resend. Until a sending domain is verified with SPF and DKIM, the shared sandbox sender only reaches the Resend account owner. Check the live /api/auth/status probe for the configured sender and next steps, then ask the deployment owner to verify a domain.',
  },
  {
    q: 'Can I undo a change?',
    a: 'Yes, for every shipped write tool. A before-snapshot is stored, the result is read back to verify it, and the Activity timeline offers a one-click undo that restores the snapshot through the same signed job queue.',
  },
  {
    q: 'Is WooCommerce / media upload / automatic publishing supported?',
    a: 'Not yet. Those are roadmap items, not hidden features. The shipped catalog covers 34 allowlisted tools — see the tool catalog for the exact list. The docs never show a button for something the site cannot do.',
  },
  {
    q: 'Is there a staging environment?',
    a: 'A staging Supabase project and supabase test db in CI are still on the backlog. Today there is one hosted production deployment with a daily cron, a health probe and GitHub Actions checks on every PR.',
  },
];

export default function FaqDocsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/docs" className="text-sm text-ink-muted underline-offset-4 hover:underline">
        ← All docs
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Frequently asked questions</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Honest answers, including the things that are not shipped yet.
      </p>

      <div className="mt-8 space-y-3">
        {FAQ.map((item, index) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-line bg-white p-4 shadow-sm"
            open={index === 0}
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden">
              <span className="mr-2 font-mono text-[10px] text-pink-600">
                {String(index + 1).padStart(2, '0')}
              </span>
              {item.q}
            </summary>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-pink-200 bg-pink-50 p-5">
        <h2 className="text-sm font-semibold text-pink-950">More detail</h2>
        <div className="mt-2 flex flex-wrap gap-4 text-xs">
          <Link href="/docs/connector" className="font-medium text-pink-700 underline">Connect guide</Link>
          <Link href="/docs/tools" className="font-medium text-pink-700 underline">Tool catalog</Link>
          <Link href="/docs/safety" className="font-medium text-pink-700 underline">Safety model</Link>
          <Link href="/docs/troubleshooting" className="font-medium text-pink-700 underline">Troubleshooting</Link>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Install the SitePilot Connector — KPH SitePilot',
  description:
    'Connect any WordPress site to KPH SitePilot in two minutes: install the connector ZIP, paste a pairing code, and manage the site from prompts.',
};

const REQUIREMENTS = [
  ['WordPress', '6.4 or newer (6.8+ tested)'],
  ['PHP', '7.4 or newer (8.2+ recommended)'],
  ['Outbound HTTPS', 'The site calls SitePilot; no inbound port is ever opened'],
  ['Administrator access', 'Only a user with "manage options" can pair or disconnect'],
];

const STEPS: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: '1 — Download the connector ZIP',
    body: (
      <>
        <a
          href="/downloads/kph-sitepilot-connector.zip"
          download="kph-sitepilot-connector-1.0.0.zip"
          className="mr-2 inline-block rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
        >
          ⬇ Download KPH SitePilot Connector (v1.0.0 .zip)
        </a>
        or grab the archive from{' '}
        <a
          href="https://github.com/kanhajatthap/KPH-SitePilot/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="text-pink-700 underline"
        >
          GitHub Releases
        </a>
        .
      </>
    ),
  },
  {
    title: '2 — Install and activate',
    body: (
      <>
        In WordPress go to <strong>Plugins → Add New → Upload Plugin</strong>, choose the ZIP, install, then activate.
        A <strong>SitePilot</strong> item appears in the admin menu with an honest status: “Not connected” until pairing
        succeeds.
      </>
    ),
  },
  {
    title: '3 — Create a pairing code here',
    body: (
      <>
        Open the{' '}
        <Link className="text-pink-700 underline" href="/onboarding">3-step guided setup</Link>{' '}
        (or <Link className="text-pink-700 underline" href="/connect">Connected sites</Link>) and create a
        pairing code. Codes are single-use, valid for ten minutes, and bound to your account.
      </>
    ),
  },
  {
    title: '4 — Paste the code into WordPress',
    body: (
      <>
        On <strong>SitePilot → Connect</strong>, paste the code (format <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12px]">ABCD-EFGH</code>)
        and press Connect. The site exchanges the code for a site id, token and secret, stores them, and immediately
        sends a heartbeat plus its first job. The secret never appears on screen and is stored encrypted on the platform.
      </>
    ),
  },
  {
    title: '5 — Describe what you want',
    body: (
      <>
        Go to <Link className="text-pink-700 underline" href="/studio">Studio</Link>, pick the site, and type a request
        such as <em>Change the heading of post 12 to “Built for teams that ship”</em>. You get a plan with one step per
        change; nothing is written until you approve it.
      </>
    ),
  },
];

const TROUBLESHOOTING = [
  ['“This connection is paused or revoked.”', 'The site row was revoked or paused in SitePilot. Pair the site again with a fresh code.'],
  ['Connector shows “unauthorised”', 'The timestamp window (±5 min) or the secret is wrong — usually a server clock that drifted. Fix the clock, then re-pair.'],
  ['Nothing happens after pairing', 'WP-Cron needs traffic. Load any front-end page once; the first poll then runs within a minute, and five seconds after that if work is queued.'],
  ['`CONFIG_MISSING` from SitePilot', 'The deployment is missing `SITEPILOT_ENCRYPTION_KEY` (or Supabase credentials). Set them and redeploy — this is a platform problem, not the site’s.'],
  ['429 from SitePilot', 'The site exceeded 240 requests/minute. Usually a plugin conflict running the poll in a loop; check for duplicated cron entries.'],
  ['A write reports `kph_sp_verification_failed`', 'WordPress sanitised the content differently from what was sent. The job carries the before/after values, and the write can be undone from Studio.'],
];

export default function ConnectorDocsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link className="text-sm text-ink-muted underline-offset-4 hover:underline" href="/docs">
        ← All docs
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">Install the SitePilot Connector</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Any WordPress site works — hosted, staging or local. Nothing has to be installed on the server beyond the plugin,
        and no inbound connection is ever made to your site.
      </p>

      <section className="mt-8 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Requirements</h2>
        <dl className="mt-3 space-y-2">
          {REQUIREMENTS.map(([label, value]) => (
            <div key={label} className="flex flex-wrap gap-x-2 text-sm">
              <dt className="font-medium text-ink">{label}</dt>
              <dd className="text-ink-muted">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Five steps, about two minutes</h2>
        <ol className="mt-4 space-y-4">
          {STEPS.map((step) => (
            <li key={step.title} className="rounded-xl border border-black/5 p-4">
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">What the connector will and will not do</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          <li>
            <strong className="text-ink">Deny by default.</strong> Every tool is allowlisted in code; an unknown tool is
            refused before WordPress is touched.
          </li>
          <li>
            <strong className="text-ink">Signed both ways.</strong> Requests carry an HMAC-SHA256 signature over
            timestamp, nonce and body; replays are rejected.
          </li>
          <li>
            <strong className="text-ink">Verify after write.</strong> Writes snapshot the post first, then read it back
            and compare. A mismatch is reported instead of being silently accepted.
          </li>
          <li>
            <strong className="text-ink">Undo is always available.</strong> Each write keeps the version it replaced, and
            Studio can restore it.
          </li>
          <li>
            <strong className="text-ink">No secrets on screen.</strong> The site secret is stored encrypted on the
            platform, never rendered in the admin UI or returned by an endpoint.
          </li>
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Troubleshooting</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-4">Symptom</th>
                <th className="py-2">What to do</th>
              </tr>
            </thead>
            <tbody>
              {TROUBLESHOOTING.map(([symptom, fix]) => (
                <tr key={symptom} className="border-b border-black/5 last:border-0">
                  <td className="py-2 pr-4 align-top font-medium text-ink">{symptom}</td>
                  <td className="py-2 align-top text-ink-muted">{fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-xs text-ink-muted">
        Disconnecting is two steps on purpose: the plugin tells SitePilot first, then forgets its credentials. A
        revocation made here clears the site’s credentials on its next request, so a copy of a site backup cannot keep
        writing to your site.
      </p>
    </main>
  );
}

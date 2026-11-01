'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface ConnectedSite {
  id: string;
  url: string;
  name: string;
  environment: string;
  status: string;
  scopes: string[] | null;
  plugin_version: string | null;
  wp_version: string | null;
  capabilities: Record<string, unknown> | null;
  last_seen_at: string | null;
}

function summarizeCapabilities(capabilities: Record<string, unknown> | null): string | null {
  if (!capabilities) return null;

  const theme = capabilities.theme as { type?: string; name?: string } | undefined;
  const builders = capabilities.builders as Record<string, unknown> | undefined;
  const postTypes = capabilities.postTypes as unknown[] | undefined;
  const plugins = capabilities.plugins as unknown[] | undefined;

  const parts: string[] = [];
  if (theme?.type) parts.push(`${theme.type} theme`);
  if (postTypes?.length) parts.push(`${postTypes.length} post types`);
  if (plugins?.length) parts.push(`${plugins.length} plugins`);
  if (builders?.woocommerce) parts.push('WooCommerce');
  if (builders?.elementor) parts.push('Elementor');

  return parts.length ? parts.join(' · ') : null;
}

interface PairingCode {
  code: string;
  expiresAt: string;
  expiresInSeconds: number;
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function ConnectPage() {
  const [sites, setSites] = useState<ConnectedSite[]>([]);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [jobNotice, setJobNotice] = useState<Record<string, string>>({});
  const [jobBusy, setJobBusy] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch('/api/connector/sites', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) {
        setSites([]);
        setSitesError(body.message ?? 'Connected sites could not be loaded.');
        return;
      }
      setSites(body.sites ?? []);
      setSitesError(null);
    } catch (error) {
      setSitesError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  useEffect(() => {
    if (!code) return;
    const expires = new Date(code.expiresAt).getTime();
    const tick = () => {
      const left = Math.max(0, Math.round((expires - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setCode(null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [code]);

  const generateCode = async () => {
    setBusy(true);
    setCodeError(null);
    try {
      const res = await fetch('/api/connector/pairing-codes', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setCodeError(body.message ?? 'A pairing code could not be created.');
        return;
      }
      setCode({ code: body.code, expiresAt: body.expiresAt, expiresInSeconds: body.expiresInSeconds });
    } catch (error) {
      setCodeError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const refreshCapabilities = async (siteId: string) => {
    setJobBusy(siteId);
    setJobNotice((current) => ({ ...current, [siteId]: '' }));
    try {
      const res = await fetch('/api/connector/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, tool: 'site.info' }),
      });
      const body = await res.json();
      setJobNotice((current) => ({
        ...current,
        [siteId]: res.ok
          ? 'Queued — the connector picks it up within a minute.'
          : body.message ?? 'The job could not be queued.',
      }));
    } catch (error) {
      setJobNotice((current) => ({ ...current, [siteId]: (error as Error).message }));
    } finally {
      setJobBusy(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-ink-muted underline-offset-4 hover:underline">
        ← Back to SitePilot
      </Link>

      <h1 className="mt-6 text-2xl font-semibold text-ink">Connect a WordPress site</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Pairing with a WordPress administrator account grants this workspace full access to the
        site — content, media, settings, plugins, themes, files and code. Every write still needs a
        plan, your approval, a snapshot and read-back verification.
      </p>

      <section className="mt-8 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">1. Get a pairing code</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Codes are single-use and expire after ten minutes.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generateCode}
            disabled={busy}
            className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Generating…' : 'Generate pairing code'}
          </button>

          {code ? (
            <div className="flex items-center gap-3">
              <code className="rounded-lg bg-black/5 px-4 py-2 text-lg tracking-[0.2em]">{code.code}</code>
              <span className="text-xs text-ink-muted">expires in {formatCountdown(remaining)}</span>
            </div>
          ) : null}
        </div>

        {codeError ? <p className="mt-3 text-sm text-red-600">{codeError}</p> : null}

        <h2 className="mt-8 text-base font-semibold text-ink">2. Paste it in WordPress</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
          <li>Install and activate the <strong>KPH SitePilot Connector</strong> plugin.</li>
          <li>
            Open <strong>SitePilot → Connection</strong> and set the platform URL to this
            deployment.
          </li>
          <li>Paste the code and press <strong>Connect site</strong>.</li>
        </ol>
      </section>

      <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">Connected sites</h2>

        {sitesError ? <p className="mt-3 text-sm text-red-600">{sitesError}</p> : null}

        {!sitesError && sites.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No sites connected yet.</p>
        ) : null}

        <ul className="mt-4 space-y-3">
          {sites.map((site) => (
            <li key={site.id} className="rounded-xl border border-black/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink">{site.name}</p>
                  <p className="text-xs text-ink-muted">{site.url}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  {site.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                {site.environment} · WordPress {site.wp_version ?? 'unknown'} · connector{' '}
                {site.plugin_version ?? 'unknown'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Scopes: {(site.scopes ?? []).join(', ') || 'read'}
              </p>
              {summarizeCapabilities(site.capabilities) ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Detected: {summarizeCapabilities(site.capabilities)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink-muted">
                  No capability manifest yet — the connector uploads it on first contact.
                </p>
              )}
              {site.last_seen_at ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Last contact: {new Date(site.last_seen_at).toLocaleString()}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void refreshCapabilities(site.id)}
                  disabled={jobBusy === site.id}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-ink disabled:opacity-60"
                >
                  {jobBusy === site.id ? 'Queueing…' : 'Refresh capabilities'}
                </button>
                {jobNotice[site.id] ? (
                  <span className="text-xs text-ink-muted">{jobNotice[site.id]}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => void loadSites()}
          className="mt-4 rounded-lg border border-black/10 px-3 py-1.5 text-sm text-ink"
        >
          Refresh
        </button>
      </section>
    </main>
  );
}

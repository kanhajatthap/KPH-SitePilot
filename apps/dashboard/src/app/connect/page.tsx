'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ALL_SITE_SCOPES, evaluateSiteCapabilities, type SiteScope } from '../../lib/capabilities';

interface ConnectedSite {
  id: string;
  project_id?: string;
  url: string;
  name: string;
  environment: 'local' | 'staging' | 'production' | string;
  status: 'active' | 'paused' | 'revoked' | 'offline' | string;
  scopes: string[] | null;
  plugin_version: string | null;
  wp_version: string | null;
  capabilities: Record<string, unknown> | null;
  last_seen_at: string | null;
}

interface OwnedProject {
  id: string;
  name: string;
  description: string | null;
}

function summarizeCapabilities(capabilities: Record<string, unknown> | null): string | null {
  if (!capabilities || Object.keys(capabilities).length === 0) return null;

  const graph = evaluateSiteCapabilities({ scopes: ALL_SITE_SCOPES, capabilities });
  const parts: string[] = [];

  if (graph.themeName) {
    parts.push(`${graph.themeName} (${graph.isBlockTheme ? 'block' : 'classic'})`);
  } else {
    parts.push(graph.isBlockTheme ? 'block theme' : 'classic theme');
  }
  if (graph.postTypeCount) parts.push(`${graph.postTypeCount} post types`);
  if (graph.pluginCount) parts.push(`${graph.pluginCount} plugins`);
  if (graph.hasWooCommerce) parts.push('WooCommerce');
  if (graph.hasElementor) parts.push('Elementor');
  if (graph.hasSeoPlugin) parts.push('SEO plugin');

  return parts.length ? parts.join(' · ') : null;
}

interface ConnectorConfig {
  authEnabled: boolean;
  storage: boolean;
  encryption: boolean;
  ready: boolean;
  hints: string[];
}

interface PairingCode {
  code: string;
  expiresAt: string;
  expiresInSeconds: number;
}

interface RotatedSecretState {
  siteId: string;
  siteName: string;
  token: string;
  secret: string;
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-800',
  revoked: 'bg-rose-50 text-rose-700',
  offline: 'bg-black/5 text-ink/60',
};

export default function ConnectPage() {
  const [sites, setSites] = useState<ConnectedSite[]>([]);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [jobNotice, setJobNotice] = useState<Record<string, string>>({});
  const [jobBusy, setJobBusy] = useState<string | null>(null);
  const [config, setConfig] = useState<ConnectorConfig | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [draftEnv, setDraftEnv] = useState<'local' | 'staging' | 'production'>('production');
  const [draftScopes, setDraftScopes] = useState<SiteScope[]>(['read']);
  const [rotated, setRotated] = useState<RotatedSecretState | null>(null);
  const [projects, setProjects] = useState<OwnedProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/connector/projects', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(body.projects)) {
        const list = body.projects as OwnedProject[];
        setProjects(list);
        if (list.length > 0) {
          setSelectedProjectId((current) => current || list[0].id);
        }
      }
    } catch {
      // non-fatal
    }
  }, []);

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
    void loadProjects();
    void loadSites();
  }, [loadProjects, loadSites]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/connector/config', { cache: 'no-store' });
        const body = (await res.json()) as ConnectorConfig;
        if (!cancelled) setConfig(body);
      } catch {
        // The banner is advisory; a failure here must not block pairing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleCreateProject = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setCreatingProject(true);
    setCodeError(null);
    try {
      const res = await fetch('/api/connector/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCodeError(body.message ?? 'Project could not be created.');
        return;
      }
      const created = body.project as OwnedProject;
      setProjects((curr) => [...curr, created]);
      setSelectedProjectId(created.id);
      setNewProjectName('');
    } catch (error) {
      setCodeError((error as Error).message);
    } finally {
      setCreatingProject(false);
    }
  };

  const generateCode = async () => {
    setBusy(true);
    setCodeError(null);
    try {
      const res = await fetch('/api/connector/pairing-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedProjectId ? { projectId: selectedProjectId } : {}),
      });
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

  const patchSite = async (
    siteId: string,
    patch: Record<string, unknown>,
    successMessage: string
  ) => {
    setJobBusy(siteId);
    try {
      const res = await fetch(`/api/connector/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      setJobNotice((current) => ({
        ...current,
        [siteId]: res.ok ? successMessage : body.message ?? 'Update failed.',
      }));
      if (res.ok) {
        setEditingSiteId(null);
        await loadSites();
      }
    } catch (error) {
      setJobNotice((current) => ({ ...current, [siteId]: (error as Error).message }));
    } finally {
      setJobBusy(null);
    }
  };

  const openEditor = (site: ConnectedSite) => {
    if (editingSiteId === site.id) {
      setEditingSiteId(null);
      return;
    }
    const env =
      site.environment === 'local' || site.environment === 'staging' ? site.environment : 'production';
    const currentScopes = (site.scopes ?? ['read']).filter((s): s is SiteScope =>
      (ALL_SITE_SCOPES as readonly string[]).includes(s)
    );
    setDraftEnv(env);
    setDraftScopes(currentScopes.includes('read') ? currentScopes : ['read', ...currentScopes]);
    setEditingSiteId(site.id);
  };

  const toggleDraftScope = (scope: SiteScope) => {
    if (scope === 'read') return; // read is mandatory
    setDraftScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
    );
  };

  const rotateSecret = async (site: ConnectedSite) => {
    const typed = window.prompt(
      `Type the site name to rotate credentials for ${site.url} — the old secret stops working immediately, and you must paste the new token + secret into WordPress.\n\n${site.name}`
    );
    if (typed === null) return;

    if (typed.trim() !== site.name) {
      setJobNotice((current) => ({
        ...current,
        [site.id]: 'The name did not match, so credentials were not rotated.',
      }));
      return;
    }

    setJobBusy(site.id);
    try {
      const res = await fetch(`/api/connector/sites/${site.id}/rotate-secret`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setJobNotice((current) => ({
          ...current,
          [site.id]: body.message ?? 'Secret rotation failed.',
        }));
        return;
      }

      setRotated({
        siteId: site.id,
        siteName: site.name,
        token: String(body.credentials?.token ?? ''),
        secret: String(body.credentials?.secret ?? ''),
      });
      setJobNotice((current) => ({
        ...current,
        [site.id]: 'Credentials rotated. Copy them from the banner above right now.',
      }));
      await loadSites();
    } catch (error) {
      setJobNotice((current) => ({ ...current, [site.id]: (error as Error).message }));
    } finally {
      setJobBusy(null);
    }
  };

  const disconnect = async (site: ConnectedSite) => {
    const typed = window.prompt(
      `Type the site name to disconnect ${site.url} — queued jobs are cancelled and the connector must be paired again.\n\n${site.name}`
    );
    if (typed === null) return;

    if (typed.trim() !== site.name) {
      setJobNotice((current) => ({ ...current, [site.id]: 'The name did not match, so nothing was changed.' }));
      return;
    }

    setJobBusy(site.id);
    try {
      const res = await fetch(`/api/connector/sites/${site.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      setJobNotice((current) => ({
        ...current,
        [site.id]: res.ok ? 'Disconnected. The site can no longer claim jobs.' : body.message ?? 'Disconnect failed.',
      }));
      if (res.ok) {
        await loadSites();
      }
    } catch (error) {
      setJobNotice((current) => ({ ...current, [site.id]: (error as Error).message }));
    } finally {
      setJobBusy(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm text-ink-muted underline-offset-4 hover:underline">
          ← Back to SitePilot
        </Link>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/studio" className="text-pink-700 underline">
            Studio
          </Link>
          <Link href="/settings/site" className="text-pink-700 underline">
            Site settings
          </Link>
          <Link href="/settings/keys" className="text-pink-700 underline">
            Model API keys
          </Link>
          <Link href="/docs/connector" className="text-pink-700 underline">
            Install guide
          </Link>
        </div>
      </div>

      <h1 className="mt-6 text-2xl font-semibold text-ink">Connect a WordPress site</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Pairing with a WordPress administrator account grants this workspace full access to the
        site — content, media, settings, plugins, themes, files and code. Every write still needs a
        plan, your approval, a snapshot and read-back verification.
      </p>

      <section className="mt-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="project-select" className="block text-xs font-semibold text-ink/70">
              Project workspace
            </label>
            <select
              id="project-select"
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setCode(null);
              }}
              className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-ink"
            >
              {projects.length === 0 ? (
                <option value="">My Sites (default)</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="New project name…"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              maxLength={120}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm text-ink"
            />
            <button
              type="button"
              onClick={handleCreateProject}
              disabled={creatingProject || !newProjectName.trim()}
              className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-black/[0.02] disabled:opacity-50"
            >
              {creatingProject ? 'Creating…' : '+ Project'}
            </button>
          </div>
        </div>
      </section>

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

      {config && !config.ready ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">This deployment is not ready to pair sites yet</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900/80">
            {config.hints.map((hint) => (
              <li key={hint}>• {hint}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-900/70">
            Nothing is wrong on the WordPress side: these are deployment settings. Pairing fails closed until they are set.
          </p>
        </section>
      ) : null}

      {rotated ? (
        <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-950">
            New credentials for {rotated.siteName} — copy these now (shown once)
          </p>
          <p className="mt-1 text-xs text-amber-900/80">
            In WordPress open <strong>SitePilot → Apply rotated credentials</strong> and paste all
            three values. Once you dismiss this notice they can never be retrieved again.
          </p>
          <div className="mt-3 space-y-2 text-xs">
            <div>
              <span className="font-medium text-amber-950">Site ID:</span>{' '}
              <code className="break-all rounded bg-white/80 px-2 py-0.5">{rotated.siteId}</code>
            </div>
            <div>
              <span className="font-medium text-amber-950">New token:</span>{' '}
              <code className="break-all rounded bg-white/80 px-2 py-0.5">{rotated.token}</code>
            </div>
            <div>
              <span className="font-medium text-amber-950">New secret:</span>{' '}
              <code className="break-all rounded bg-white/80 px-2 py-0.5">{rotated.secret}</code>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `Site ID: ${rotated.siteId}\nToken: ${rotated.token}\nSecret: ${rotated.secret}`
                );
              }}
              className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              Copy credentials
            </button>
            <button
              type="button"
              onClick={() => setRotated(null)}
              className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs text-amber-950"
            >
              Dismiss — I saved them in WordPress
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">Connected sites</h2>

        {sitesError ? <p className="mt-3 text-sm text-red-600">{sitesError}</p> : null}

        {!sitesError && sites.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No sites connected yet.</p>
        ) : null}

        <ul className="mt-4 space-y-3">
          {sites.map((site) => {
            const isEditing = editingSiteId === site.id;
            return (
              <li key={site.id} className="rounded-xl border border-black/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{site.name}</p>
                    <p className="text-xs text-ink-muted">{site.url}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      STATUS_BADGE[site.status] ?? 'bg-black/5 text-ink/70'
                    }`}
                  >
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
                  {site.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => void refreshCapabilities(site.id)}
                      disabled={jobBusy === site.id}
                      className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-ink disabled:opacity-60"
                    >
                      {jobBusy === site.id ? 'Working…' : 'Refresh capabilities'}
                    </button>
                  ) : null}

                  {site.status === 'active' || site.status === 'paused' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void patchSite(
                          site.id,
                          { status: site.status === 'paused' ? 'active' : 'paused' },
                          site.status === 'paused'
                            ? 'Site resumed. Polling is active again.'
                            : 'Site paused. No jobs will be claimed until resumed.'
                        )
                      }
                      disabled={jobBusy === site.id}
                      className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-ink disabled:opacity-60"
                    >
                      {site.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                  ) : null}

                  {site.status !== 'revoked' ? (
                    <button
                      type="button"
                      onClick={() => openEditor(site)}
                      disabled={jobBusy === site.id}
                      className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-ink disabled:opacity-60"
                    >
                      {isEditing ? 'Close settings' : 'Scopes & env'}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void rotateSecret(site)}
                    disabled={jobBusy === site.id}
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-800 disabled:opacity-60"
                  >
                    Rotate secret
                  </button>

                  {site.status !== 'revoked' ? (
                    <button
                      type="button"
                      onClick={() => void disconnect(site)}
                      disabled={jobBusy === site.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-60"
                    >
                      Disconnect
                    </button>
                  ) : null}

                  {jobNotice[site.id] ? (
                    <span className="text-xs text-ink-muted">{jobNotice[site.id]}</span>
                  ) : null}
                </div>

                {isEditing ? (
                  <div className="mt-4 rounded-xl border border-black/5 bg-black/[0.015] p-3">
                    <label className="block text-xs font-medium text-ink">
                      Environment
                      <select
                        value={draftEnv}
                        onChange={(event) =>
                          setDraftEnv(event.target.value as 'local' | 'staging' | 'production')
                        }
                        className="mt-1 block w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <option value="production">production</option>
                        <option value="staging">staging</option>
                        <option value="local">local</option>
                      </select>
                    </label>

                    <p className="mt-3 text-xs font-medium text-ink">Allowed platform scopes</p>
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      {ALL_SITE_SCOPES.map((scope) => (
                        <label key={scope} className="flex items-center gap-1.5 text-xs text-ink-muted">
                          <input
                            type="checkbox"
                            checked={draftScopes.includes(scope)}
                            disabled={scope === 'read'}
                            onChange={() => toggleDraftScope(scope)}
                          />
                          <span>{scope}</span>
                        </label>
                      ))}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void patchSite(
                            site.id,
                            { environment: draftEnv, scopes: draftScopes },
                            'Environment and scopes updated.'
                          )
                        }
                        disabled={jobBusy === site.id}
                        className="rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSiteId(null)}
                        className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
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

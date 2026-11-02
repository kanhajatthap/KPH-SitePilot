'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { evaluateSiteCapabilities, suggestPromptsForSite } from '../../lib/capabilities';

/**
 * Studio — the prompt-first surface.
 *
 * Type what you want in plain language, review the plan, approve it, watch it
 * run step by step, and undo a write from the same screen. Nothing reaches
 * WordPress until an approval exists, and destructive steps need a typed
 * confirmation, so the page never has a "just do it" button.
 */

interface ConnectedSite {
  id: string;
  url: string;
  name: string;
  environment: string;
  status: string;
  scopes: string[] | null;
  capabilities: Record<string, unknown> | null;
  last_seen_at: string | null;
}

interface PlanStep {
  tool: string;
  args: Record<string, unknown>;
  risk: 'R0' | 'R1' | 'R2' | 'R3';
  summary: string;
}

interface PlannerInfo {
  kind: 'model' | 'deterministic';
  mode?: string;
  provider?: string;
  model?: string;
  droppedSteps?: string[];
  fallbackReason?: string;
}

interface Plan {
  id: string;
  summary: string;
  risk: 'R0' | 'R1' | 'R2' | 'R3';
  status: string;
  hash: string;
  steps: PlanStep[];
}

interface PlanJob {
  id: string;
  tool: string;
  status: string;
  attempts: number;
  risk: string;
  result: Record<string, unknown> | null;
  error: { code?: string; message?: string } | null;
  created_at: string;
}

interface Snapshot {
  id: string;
  resource: string;
  before: Record<string, unknown> | null;
  created_at: string;
  restored_at: string | null;
}

const RISK_LABEL: Record<string, { text: string; className: string }> = {
  R0: { text: 'Read only', className: 'bg-black/5 text-ink/70' },
  R1: { text: 'Low risk', className: 'bg-emerald-50 text-emerald-700' },
  R2: { text: 'Medium risk', className: 'bg-amber-50 text-amber-700' },
  R3: { text: 'Needs confirmation', className: 'bg-rose-50 text-rose-700' },
};

const STATUS_STYLE: Record<string, string> = {
  succeeded: 'text-emerald-700',
  claimed: 'text-sky-700',
  queued: 'text-ink/60',
  failed: 'text-rose-700',
  cancelled: 'text-ink/40',
};

function formatStepArgs(args: Record<string, unknown>): string | null {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return null;

  return entries
    .map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = Object.entries(value as Record<string, unknown>)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', ');
        return `${key}: { ${nested} }`;
      }
      const rendered = typeof value === 'string' && value.length > 90
        ? `${JSON.stringify(value.slice(0, 87))}…`
        : JSON.stringify(value);
      return `${key}: ${rendered}`;
    })
    .join(' · ');
}

export default function StudioPage() {
  const [sites, setSites] = useState<ConnectedSite[]>([]);
  const [siteId, setSiteId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planner, setPlanner] = useState<PlannerInfo | null>(null);
  const [jobs, setJobs] = useState<PlanJob[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [confirmation, setConfirmation] = useState('');
  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const refreshSites = useCallback(async () => {
    try {
      const res = await fetch('/api/connector/sites', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? 'Connected sites could not be loaded.');
        return;
      }
      const list: ConnectedSite[] = body.sites ?? [];
      setSites(list);
      setSiteId((current) => current || list.find((site) => site.status === 'active')?.id || '');
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refreshSites();
  }, [refreshSites]);

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.message ?? payload.error ?? `Request failed (${res.status}).`);
    }
    return payload;
  }

  async function createPlan() {
    setError('');
    setNotice('');
    setPlan(null);
    setPlanner(null);
    setJobs([]);
    setApproved(false);
    setRunning(false);
    setConfirmation('');
    setBusy('plan');

    try {
      const payload = await post('/api/connector/plans', { siteId, prompt });
      setPlan(payload.plan as Plan);
      setPlanner((payload.planner as PlannerInfo | undefined) ?? null);
      setNotice('Plan ready. Review the steps — nothing has been written yet.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function approve() {
    if (!plan) return;
    setError('');
    setBusy('approve');
    try {
      await post(`/api/connector/plans/${plan.id}/approve`, { confirmation });
      setApproved(true);
      setNotice('Approved. Each step will run as a separate signed job.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  const watchPlan = useCallback(
    async (planId: string, attempt = 0) => {
      try {
        const res = await fetch(`/api/connector/plans/${planId}`, { cache: 'no-store' });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? 'Plan could not be reloaded.');

        setPlan(body.plan as Plan);
        setJobs((body.jobs ?? []) as PlanJob[]);
        setSnapshots((body.snapshots ?? []) as Snapshot[]);

        const done = ['applied', 'failed', 'rejected'].includes((body.plan as Plan).status);
        if (!done && attempt < 90) {
          pollTimer.current = setTimeout(() => {
            void watchPlan(planId, attempt + 1);
          }, 2000);
        } else {
          setRunning(false);
        }
      } catch (err) {
        setError((err as Error).message);
        setRunning(false);
      }
    },
    []
  );

  async function run() {
    if (!plan) return;
    setError('');
    setBusy('run');
    try {
      await post(`/api/connector/plans/${plan.id}/execute`);
      setRunning(true);
      setNotice('Running. Steps are verified on your site one at a time.');
      stopPolling();
      void watchPlan(plan.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function undo(snapshotId: string) {
    setError('');
    setBusy(`undo:${snapshotId}`);
    try {
      await post(`/api/connector/snapshots/${snapshotId}/undo`);
      setNotice('Undo queued. The previous version is being restored.');
      if (plan) void watchPlan(plan.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  const activeSites = sites.filter((site) => site.status === 'active');
  const selectedSite = useMemo(
    () => activeSites.find((site) => site.id === siteId) ?? activeSites[0] ?? null,
    [activeSites, siteId]
  );
  const capabilityGraph = useMemo(
    () => (selectedSite ? evaluateSiteCapabilities(selectedSite) : null),
    [selectedSite]
  );
  const examples = useMemo(
    () => (selectedSite ? suggestPromptsForSite(selectedSite) : []),
    [selectedSite]
  );

  const confirmationKind: 'none' | 'word' | 'plan-id' =
    plan?.risk === 'R3' ? 'plan-id' : plan?.risk === 'R2' ? 'word' : 'none';
  const needsConfirmation = confirmationKind !== 'none';
  const confirmationMatches =
    !plan ||
    confirmationKind === 'none' ||
    (confirmationKind === 'word'
      ? confirmation.trim().toUpperCase() === 'CONFIRM'
      : confirmation.trim().toLowerCase() === plan.id.slice(0, 8).toLowerCase());

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Studio</h1>
          <p className="mt-1 text-sm text-ink/60">
            Describe the change. Review the plan. Approve it. SitePilot writes it, verifies it, and can undo it.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-pink-700 underline" href="/connect">
            Connected sites
          </Link>
          <Link className="text-pink-700 underline" href="/settings/keys">
            Model API keys
          </Link>
          <Link className="text-pink-700 underline" href="/docs/connector">
            Install guide
          </Link>
        </div>
      </header>

      {activeSites.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold">Connect a WordPress site first</h2>
          <p className="mt-2 text-sm text-ink/60">
            Install the SitePilot Connector on your site, then pair it from the connected-sites page. Any WordPress
            site works — it does not need to be local.
          </p>
          <Link
            className="mt-4 inline-block rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white"
            href="/connect"
          >
            Open connected sites
          </Link>
        </section>
      ) : (
        <section className="mt-8 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <label className="block text-xs font-medium uppercase tracking-wide text-ink/50" htmlFor="site">
            Site
          </label>
          <select
            id="site"
            className="mt-2 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
          >
            {activeSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} — {site.url}
              </option>
            ))}
          </select>

          {capabilityGraph ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
                {capabilityGraph.availableCount} tools enabled
              </span>
              {capabilityGraph.hasManifest ? (
                <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-ink/70">
                  {capabilityGraph.isBlockTheme ? 'Block theme' : 'Classic theme'}
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800">
                  Capability scan pending first heartbeat
                </span>
              )}
              {capabilityGraph.hasWooCommerce ? (
                <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-ink/70">WooCommerce</span>
              ) : null}
              {capabilityGraph.hasElementor ? (
                <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-ink/70">Elementor</span>
              ) : null}
              {capabilityGraph.disabledByScopeCount > 0 ? (
                <Link
                  href="/connect"
                  className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800 underline"
                >
                  {capabilityGraph.disabledByScopeCount} tools gated by scope
                </Link>
              ) : null}
            </div>
          ) : null}

          <label className="mt-5 block text-xs font-medium uppercase tracking-wide text-ink/50" htmlFor="prompt">
            What should change?
          </label>
          <textarea
            id="prompt"
            className="mt-2 h-28 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            placeholder="Change the title of post #12 to “Built for teams that ship”"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />

          <div className="mt-2 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                className="rounded-full border border-black/10 px-3 py-1 text-xs text-ink/70 hover:bg-black/5"
                onClick={() => setPrompt(example)}
              >
                {example}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="mt-4 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={createPlan}
            disabled={!siteId || prompt.trim().length < 4 || busy === 'plan'}
          >
            {busy === 'plan' ? 'Planning…' : 'Create plan'}
          </button>
          <p className="mt-2 text-xs text-ink/50">
            Add a free{' '}
            <Link href="/settings/keys" className="text-pink-700 underline">
              Gemini, OpenRouter or Groq key
            </Link>{' '}
            for natural-language planning, or use exact targets (<code>#12</code>, <code>site title</code>) with the
            built-in deterministic planner.
          </p>
        </section>
      )}

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {plan ? (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{plan.summary}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_LABEL[plan.risk]?.className ?? ''}`}>
              {RISK_LABEL[plan.risk]?.text ?? plan.risk}
            </span>
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink/60">{plan.status}</span>
            {planner ? (
              <span
                className="rounded-full border border-black/10 px-2 py-0.5 text-xs text-ink/60"
                title={
                  planner.kind === 'model'
                    ? `${planner.provider} · ${planner.model}${planner.droppedSteps?.length ? ` · dropped ${planner.droppedSteps.join(', ')}` : ''}`
                    : planner.fallbackReason ?? 'Deterministic planner'
                }
              >
                {planner.kind === 'model' ? `Planned by ${planner.provider}` : 'Deterministic planner'}
              </span>
            ) : null}
          </div>

          {planner?.fallbackReason ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The model planner was unavailable, so the built-in planner produced this plan: {planner.fallbackReason}{' '}
              <Link href="/settings/keys" className="underline">
                Check model API keys
              </Link>
            </p>
          ) : null}

          <ol className="mt-4 space-y-2">
            {plan.steps.map((step, index) => {
              const job = jobs[index];
              const argPreview = formatStepArgs(step.args);
              return (
                <li key={`${step.tool}-${index}`} className="rounded-xl border border-black/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">{step.summary}</span>
                    <span className="text-xs text-ink/50">{step.tool}</span>
                  </div>
                  {argPreview ? (
                    <p className="mt-1 break-words rounded bg-black/[0.025] px-2 py-1 font-mono text-[11px] text-ink/70">
                      {argPreview}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-ink/40">step {index + 1}</span>
                    {job ? (
                      <span className={STATUS_STYLE[job.status] ?? 'text-ink/60'}>
                        {job.status}
                        {job.attempts > 1 ? ` · attempt ${job.attempts}` : ''}
                      </span>
                    ) : (
                      <span className="text-ink/40">not queued</span>
                    )}
                    {job?.error?.message ? <span className="text-rose-700">{job.error.message}</span> : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="mt-4 break-all text-xs text-ink/40">
            Plan {plan.id} · SHA-256 {plan.hash.slice(0, 16)}…
          </p>

          {needsConfirmation && !approved ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <label className="block text-xs font-medium text-rose-800" htmlFor="confirm">
                {confirmationKind === 'word'
                  ? 'Type CONFIRM — this change is visible to visitors'
                  : `Type ${plan.id.slice(0, 8)} to confirm this higher-risk change`}
              </label>
              <input
                id="confirm"
                className="mt-2 w-full rounded-lg border border-rose-200 px-3 py-2 text-sm"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-black/10 px-4 py-2 text-sm disabled:opacity-60"
              onClick={approve}
              disabled={approved || busy === 'approve' || !confirmationMatches || plan.status !== 'proposed'}
            >
              {approved ? 'Approved' : busy === 'approve' ? 'Approving…' : 'Approve plan'}
            </button>
            <button
              type="button"
              className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              onClick={run}
              disabled={!approved || running || busy === 'run'}
            >
              {running ? 'Running…' : 'Run plan'}
            </button>
          </div>
        </section>
      ) : null}

      {snapshots.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold">Undo history</h2>
          <p className="mt-1 text-xs text-ink/50">Every write keeps the version it replaced.</p>
          <ul className="mt-3 space-y-2">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/5 p-3">
                <div>
                  <p className="text-sm">{snapshot.resource}</p>
                  <p className="text-xs text-ink/50">
                    {new Date(snapshot.created_at).toLocaleString()}
                    {snapshot.restored_at ? ' · restored' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-xs disabled:opacity-60"
                  onClick={() => undo(snapshot.id)}
                  disabled={Boolean(snapshot.restored_at) || busy === `undo:${snapshot.id}`}
                >
                  {snapshot.restored_at ? 'Restored' : busy === `undo:${snapshot.id}` ? 'Queueing…' : 'Undo'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

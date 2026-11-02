'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Activity & Audit Log Screen (E9-10).
 *
 * Chronological, owner-scoped timeline of proposed/applied plans, verified
 * connector jobs, and reversible snapshots with one-click Undo.
 */

interface ActivitySite {
  id: string;
  name: string;
  url: string;
  environment: string;
  status: string;
  plugin_version: string | null;
  last_seen_at: string | null;
}

interface ActivityPlan {
  id: string;
  site_id: string;
  prompt: string;
  summary: string;
  risk: string;
  status: string;
  steps: Array<{ tool: string; summary?: string; risk?: string }>;
  created_at: string;
}

interface ActivityJob {
  id: string;
  site_id: string;
  plan_id: string | null;
  tool: string;
  risk: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error: { code?: string; message?: string } | null;
  created_at: string;
}

interface ActivitySnapshot {
  id: string;
  site_id: string;
  job_id: string | null;
  resource: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  restored_at: string | null;
  created_at: string;
  undoable: boolean;
  undoTool: string | null;
}

interface ActivityPayload {
  sites: ActivitySite[];
  plans: ActivityPlan[];
  jobs: ActivityJob[];
  snapshots: ActivitySnapshot[];
}

type ViewTab = 'all' | 'plans' | 'jobs' | 'snapshots';

type TimelineItem =
  | { kind: 'plan'; at: string; item: ActivityPlan }
  | { kind: 'job'; at: string; item: ActivityJob }
  | { kind: 'snapshot'; at: string; item: ActivitySnapshot };

const RISK_STYLE: Record<string, string> = {
  R0: 'bg-black/5 text-ink/70',
  R1: 'bg-emerald-50 text-emerald-700',
  R2: 'bg-amber-50 text-amber-800',
  R3: 'bg-rose-50 text-rose-700',
};

const STATUS_BADGE: Record<string, string> = {
  proposed: 'bg-amber-50 text-amber-800',
  approved: 'bg-sky-50 text-sky-800',
  applied: 'bg-emerald-50 text-emerald-700',
  succeeded: 'bg-emerald-50 text-emerald-700',
  queued: 'bg-stone-100 text-stone-700',
  claimed: 'bg-sky-50 text-sky-800',
  running: 'bg-sky-50 text-sky-800',
  failed: 'bg-rose-50 text-rose-700',
  rolled_back: 'bg-purple-50 text-purple-800',
  cancelled: 'bg-stone-100 text-stone-500',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ActivityPage() {
  const [data, setData] = useState<ActivityPayload>({
    sites: [],
    plans: [],
    jobs: [],
    snapshots: [],
  });
  const [loading, setLoading] = useState(true);
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [view, setView] = useState<ViewTab>('all');
  const [busyUndoId, setBusyUndoId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (siteFilter) params.set('siteId', siteFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '40');
      const res = await fetch(`/api/connector/activity?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = await readJsonSafe<ActivityPayload & { message?: string }>(res);
      if (!res.ok || !json) {
        setError(json?.message ?? 'Could not load activity timeline.');
        return;
      }
      setData({
        sites: json.sites ?? [],
        plans: json.plans ?? [],
        jobs: json.jobs ?? [],
        snapshots: json.snapshots ?? [],
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [siteFilter, statusFilter]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const siteMap = useMemo(() => {
    return new Map(data.sites.map((s) => [s.id, s]));
  }, [data.sites]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    if (view === 'all' || view === 'plans') {
      for (const plan of data.plans) {
        items.push({ kind: 'plan', at: plan.created_at, item: plan });
      }
    }
    if (view === 'all' || view === 'jobs') {
      for (const job of data.jobs) {
        items.push({ kind: 'job', at: job.created_at, item: job });
      }
    }
    if (view === 'all' || view === 'snapshots') {
      for (const snap of data.snapshots) {
        items.push({ kind: 'snapshot', at: snap.created_at, item: snap });
      }
    }
    items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return items;
  }, [data.jobs, data.plans, data.snapshots, view]);

  async function triggerUndo(snapshot: ActivitySnapshot) {
    setError('');
    setNotice('');
    setBusyUndoId(snapshot.id);
    try {
      const res = await fetch(`/api/connector/snapshots/${snapshot.id}/undo`, {
        method: 'POST',
      });
      const json = await readJsonSafe<{ tool?: string; message?: string }>(res);
      if (!res.ok) {
        setError(json?.message ?? 'Undo failed.');
        return;
      }
      const site = siteMap.get(snapshot.site_id);
      if (site?.url && site.url.toLowerCase().startsWith('https://')) {
        void fetch(`${site.url.replace(/\/+$/, '')}/wp-cron.php?doing_wp_cron=1`, {
          mode: 'no-cors',
          cache: 'no-store',
        }).catch(() => {});
      }
      setNotice(
        `Undo queued (${json?.tool ?? 'restore'}) for ${snapshot.resource}. Your WordPress connector will restore the previous state on its next poll.`
      );
      await loadActivity();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyUndoId('');
    }
  }

  const undoableCount = data.snapshots.filter((s) => s.undoable).length;
  const succeededJobs = data.jobs.filter((j) => j.status === 'succeeded').length;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Activity &amp; Audit Timeline</h1>
          <p className="mt-1 text-sm text-ink/60">
            Every proposed plan, verified WordPress job, and reversible snapshot across your connected sites.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-pink-700 underline" href="/">
            Workspace
          </Link>
          <Link className="text-pink-700 underline" href="/studio">
            Studio
          </Link>
          <Link className="text-pink-700 underline" href="/connect">
            Connected sites
          </Link>
          <Link className="text-pink-700 underline" href="/settings/site">
            Site settings
          </Link>
          <Link className="text-pink-700 underline" href="/settings/keys">
            Model API keys
          </Link>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-ink/50">Connected sites</p>
          <p className="mt-1 text-2xl font-semibold">{data.sites.length}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-ink/50">Plans tracked</p>
          <p className="mt-1 text-2xl font-semibold">{data.plans.length}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-ink/50">Verified jobs</p>
          <p className="mt-1 text-2xl font-semibold">{succeededJobs}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-ink/50">Ready for Undo</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{undoableCount}</p>
        </div>
      </section>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'plans', 'jobs', 'snapshots'] as ViewTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setView(tab)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
                view === tab ? 'bg-pink-600 text-white' : 'bg-black/5 text-ink/70 hover:bg-black/10'
              }`}
            >
              {tab === 'snapshots' ? 'Snapshots & Undo' : tab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by site"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
          >
            <option value="">All connected sites</option>
            {data.sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.url})
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="proposed">proposed</option>
            <option value="approved">approved</option>
            <option value="applied">applied</option>
            <option value="succeeded">succeeded</option>
            <option value="queued">queued</option>
            <option value="failed">failed</option>
            <option value="rolled_back">rolled_back</option>
          </select>

          <button
            type="button"
            onClick={() => void loadActivity()}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium hover:bg-black/5"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <section className="mt-6 space-y-3">
        {loading && timeline.length === 0 ? (
          <div className="rounded-2xl border border-black/5 bg-white p-8 text-center text-sm text-ink/50">
            Loading audit timeline…
          </div>
        ) : timeline.length === 0 ? (
          <div className="rounded-2xl border border-black/5 bg-white p-8 text-center">
            <p className="text-sm font-medium text-ink/80">No activity matches your current filters.</p>
            <p className="mt-1 text-xs text-ink/50">
              Create and run a plan in{' '}
              <Link href="/studio" className="text-pink-700 underline">
                Studio
              </Link>{' '}
              to see verified writes and reversible snapshots here.
            </p>
          </div>
        ) : (
          timeline.map((entry) => {
            if (entry.kind === 'plan') {
              const p = entry.item;
              const site = siteMap.get(p.site_id);
              return (
                <article
                  key={`plan-${p.id}`}
                  className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-pink-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-pink-700">
                        Plan
                      </span>
                      <span className="text-sm font-semibold">{p.summary}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLE[p.risk] ?? ''}`}>
                        {p.risk}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[p.status] ?? 'bg-black/5'}`}>
                        {p.status}
                      </span>
                    </div>
                    <span className="text-xs text-ink/45">{formatTime(p.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-ink/65">
                    Prompt: <span className="italic">“{p.prompt}”</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink/55">
                    {site ? <span>{site.name}</span> : null}
                    <span>·</span>
                    <span>{p.steps?.length ?? 0} step(s)</span>
                    {Array.isArray(p.steps)
                      ? p.steps.slice(0, 4).map((s, idx) => (
                          <code key={idx} className="rounded bg-black/5 px-1.5 py-0.5 text-[11px]">
                            {s.tool}
                          </code>
                        ))
                      : null}
                  </div>
                </article>
              );
            }

            if (entry.kind === 'job') {
              const j = entry.item;
              const site = siteMap.get(j.site_id);
              return (
                <article
                  key={`job-${j.id}`}
                  className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                        Job
                      </span>
                      <code className="text-sm font-semibold">{j.tool}</code>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLE[j.risk] ?? ''}`}>
                        {j.risk}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[j.status] ?? 'bg-black/5'}`}>
                        {j.status}
                      </span>
                    </div>
                    <span className="text-xs text-ink/45">{formatTime(j.created_at)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink/55">
                    {site ? <span>{site.name}</span> : null}
                    <span>
                      Attempts: {j.attempts}/{j.max_attempts}
                    </span>
                    {j.error?.message ? (
                      <span className="font-medium text-rose-700">{j.error.message}</span>
                    ) : null}
                  </div>
                </article>
              );
            }

            const s = entry.item;
            const site = siteMap.get(s.site_id);
            return (
              <article
                key={`snap-${s.id}`}
                className="rounded-2xl border border-emerald-200/70 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                      Snapshot
                    </span>
                    <code className="text-sm font-semibold">{s.resource}</code>
                    {s.restored_at ? (
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-800">
                        Restored {formatTime(s.restored_at)}
                      </span>
                    ) : s.undoable ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        Reversible via {s.undoTool}
                      </span>
                    ) : (
                      <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink/50">
                        Audit-only snapshot
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink/45">{formatTime(s.created_at)}</span>
                    {s.undoable ? (
                      <button
                        type="button"
                        disabled={busyUndoId === s.id}
                        onClick={() => void triggerUndo(s)}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {busyUndoId === s.id ? 'Undoing…' : 'Undo change'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {site ? <p className="mt-1 text-xs text-ink/55">{site.name}</p> : null}

                {s.before || s.after ? (
                  <details className="mt-2 text-xs text-ink/70">
                    <summary className="cursor-pointer font-medium text-ink/60 hover:text-ink">
                      Inspect before / after snapshot diff
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-rose-50/50 p-2.5">
                        <p className="font-semibold text-rose-800">Before</p>
                        <pre className="mt-1 max-h-44 overflow-auto font-mono text-[11px]">
                          {JSON.stringify(s.before, null, 2)}
                        </pre>
                      </div>
                      <div className="rounded-lg bg-emerald-50/50 p-2.5">
                        <p className="font-semibold text-emerald-800">After</p>
                        <pre className="mt-1 max-h-44 overflow-auto font-mono text-[11px]">
                          {JSON.stringify(s.after, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </details>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}

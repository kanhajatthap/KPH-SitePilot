'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  sanitizeSettingsValues,
  WRITABLE_SETTINGS_KEYS,
  type WritableSettingKey,
} from '../../../lib/connector/undo';

interface ConnectedSite {
  id: string;
  project_id?: string;
  url: string;
  name: string;
  environment: string;
  status: string;
  scopes: string[] | null;
}

interface FieldSpec {
  key: WritableSettingKey;
  group: 'General' | 'Reading' | 'Discussion';
  label: string;
  hint: string;
  kind: 'text' | 'number' | 'open_closed';
  placeholder?: string;
  min?: number;
  max?: number;
}

/**
 * Generated strictly from `WRITABLE_SETTINGS_KEYS` (E6-02): there is no
 * free-text option key input anywhere on this page.
 */
const SETTING_FIELDS: readonly FieldSpec[] = [
  {
    key: 'blogname',
    group: 'General',
    label: 'Site title',
    hint: 'WordPress option: blogname (1–200 characters)',
    kind: 'text',
    placeholder: 'Acme Studio',
  },
  {
    key: 'blogdescription',
    group: 'General',
    label: 'Tagline',
    hint: 'WordPress option: blogdescription (0–400 characters)',
    kind: 'text',
    placeholder: 'Built with craft',
  },
  {
    key: 'timezone_string',
    group: 'General',
    label: 'Timezone identifier',
    hint: 'IANA timezone (e.g. Asia/Kolkata, UTC, America/New_York)',
    kind: 'text',
    placeholder: 'Asia/Kolkata',
  },
  {
    key: 'date_format',
    group: 'General',
    label: 'Date format',
    hint: 'PHP date format token string (e.g. F j, Y or Y-m-d)',
    kind: 'text',
    placeholder: 'F j, Y',
  },
  {
    key: 'time_format',
    group: 'General',
    label: 'Time format',
    hint: 'PHP time format token string (e.g. g:i a or H:i)',
    kind: 'text',
    placeholder: 'g:i a',
  },
  {
    key: 'posts_per_page',
    group: 'Reading',
    label: 'Blog pages show at most',
    hint: 'WordPress option: posts_per_page (integer 1–100)',
    kind: 'number',
    min: 1,
    max: 100,
    placeholder: '10',
  },
  {
    key: 'default_comment_status',
    group: 'Discussion',
    label: 'Default article comments',
    hint: 'WordPress option: default_comment_status (open or closed)',
    kind: 'open_closed',
  },
  {
    key: 'default_ping_status',
    group: 'Discussion',
    label: 'Default link notifications (pingbacks/trackbacks)',
    hint: 'WordPress option: default_ping_status (open or closed)',
    kind: 'open_closed',
  },
] as const;

interface StagedPlan {
  id: string;
  summary: string;
  risk: string;
  status: string;
  hash: string;
}

interface PlanSnapshot {
  id: string;
  resource: string;
  before: Record<string, unknown> | null;
  created_at: string;
  restored_at: string | null;
}

export default function SafeSiteSettingsPage() {
  const [sites, setSites] = useState<ConnectedSite[]>([]);
  const [siteId, setSiteId] = useState('');
  const [loadedValues, setLoadedValues] = useState<Record<string, string>>({});
  const [readOnlyUrls, setReadOnlyUrls] = useState<{ siteurl?: string; home?: string }>({});
  const [draft, setDraft] = useState<Record<WritableSettingKey, string>>(() => {
    const init = {} as Record<WritableSettingKey, string>;
    for (const key of WRITABLE_SETTINGS_KEYS) init[key] = '';
    return init;
  });

  const [loadingLive, setLoadingLive] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<StagedPlan | null>(null);
  const [approved, setApproved] = useState(false);
  const [snapshots, setSnapshots] = useState<PlanSnapshot[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch('/api/connector/sites', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? 'Connected sites could not be loaded.');
        return;
      }
      const list = ((body.sites ?? []) as ConnectedSite[]).filter((s) => s.status === 'active');
      setSites(list);
      if (list.length > 0 && !siteId) {
        setSiteId(list[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [siteId]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === siteId) ?? sites[0] ?? null,
    [sites, siteId]
  );

  const hasSiteOpsScope = useMemo(() => {
    if (!selectedSite) return false;
    return (selectedSite.scopes ?? []).includes('site_ops');
  }, [selectedSite]);

  const applyLoadedSettings = useCallback((values: Record<string, unknown>) => {
    const nextLoaded: Record<string, string> = {};
    const nextDraft = {} as Record<WritableSettingKey, string>;

    for (const key of WRITABLE_SETTINGS_KEYS) {
      const raw = values[key];
      const str = raw === null || raw === undefined ? '' : String(raw);
      nextLoaded[key] = str;
      nextDraft[key] = str;
    }

    setLoadedValues(nextLoaded);
    setDraft(nextDraft);
    setReadOnlyUrls({
      siteurl: typeof values.siteurl === 'string' ? values.siteurl : undefined,
      home: typeof values.home === 'string' ? values.home : undefined,
    });
  }, []);

  const fetchLiveSettings = async () => {
    if (!selectedSite) return;
    clearTimer();
    setError('');
    setNotice('Queued settings.get on WordPress — waiting for connector poll…');
    setLoadingLive(true);

    try {
      const res = await fetch('/api/connector/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, tool: 'settings.get' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadingLive(false);
        setNotice('');
        setError(body.message ?? 'Could not enqueue settings.get.');
        return;
      }

      const jobId = String(body.jobId ?? '');
      let attempts = 0;

      const pollJob = async () => {
        attempts += 1;
        try {
          const check = await fetch(`/api/connector/jobs?jobId=${encodeURIComponent(jobId)}`, {
            cache: 'no-store',
          });
          const data = await check.json().catch(() => ({}));
          const status = data.job?.status as string | undefined;

          if (status === 'succeeded') {
            const values = (data.job?.result?.values ?? {}) as Record<string, unknown>;
            applyLoadedSettings(values);
            setLoadingLive(false);
            setNotice('Live WordPress settings loaded.');
            return;
          }
          if (status === 'failed' || status === 'cancelled' || status === 'expired') {
            setLoadingLive(false);
            setNotice('');
            setError(data.job?.error?.message ?? `settings.get ended with status ${status}.`);
            return;
          }
          if (attempts >= 20) {
            setLoadingLive(false);
            setNotice(
              'settings.get is queued. Your WordPress connector will report values on its next cron poll, or you can stage specific fields below right away.'
            );
            return;
          }
          timerRef.current = setTimeout(() => void pollJob(), 2500);
        } catch (pollErr) {
          setLoadingLive(false);
          setError((pollErr as Error).message);
        }
      };

      timerRef.current = setTimeout(() => void pollJob(), 2000);
    } catch (err) {
      setLoadingLive(false);
      setNotice('');
      setError((err as Error).message);
    }
  };

  /** Changed fields relative to loaded baseline (or non-empty fields if not yet loaded). */
  const changedEntries = useMemo(() => {
    const hasBaseline = Object.keys(loadedValues).length > 0;
    const list: Array<{
      spec: FieldSpec;
      before: string;
      after: string;
      parsedValue: string | number;
    }> = [];

    for (const spec of SETTING_FIELDS) {
      const current = (draft[spec.key] ?? '').trim();
      const before = loadedValues[spec.key] ?? '';

      if (hasBaseline) {
        if (current === before) continue;
      } else {
        if (current === '') continue;
      }

      const parsedValue: string | number =
        spec.kind === 'number' ? Number(current) : current;
      list.push({
        spec,
        before: hasBaseline ? before || '(empty)' : '(current on site)',
        after: current || '(empty)',
        parsedValue,
      });
    }

    return list;
  }, [draft, loadedValues]);

  const stageSettingsPlan = async () => {
    if (!selectedSite || changedEntries.length === 0) return;
    setError('');
    setNotice('');

    const rawCandidate: Record<string, unknown> = {};
    for (const item of changedEntries) {
      rawCandidate[item.spec.key] = item.parsedValue;
    }

    const sanitized = sanitizeSettingsValues(rawCandidate);
    if (!sanitized) {
      setError(
        'One or more modified fields are outside WordPress validation bounds. Check posts_per_page (1–100), timezone format, or required site title.'
      );
      return;
    }

    setBusy('stage');
    try {
      const res = await fetch('/api/connector/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          settingsValues: sanitized,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? 'Plan could not be created.');
        return;
      }
      setPlan(body.plan as StagedPlan);
      setApproved(false);
      setNotice('Settings plan staged. Review the hash and diff below, then approve to apply.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const watchPlan = useCallback(
    async (planId: string) => {
      try {
        const res = await fetch(`/api/connector/plans/${planId}`, { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return;

        setPlan(body.plan as StagedPlan);
        setSnapshots(
          ((body.snapshots ?? []) as PlanSnapshot[]).filter(
            (snap) => snap.resource === 'settings' || snap.resource.startsWith('settings:')
          )
        );

        const active = ((body.jobs ?? []) as Array<{ status: string }>).some(
          (j) => j.status === 'queued' || j.status === 'claimed' || j.status === 'running'
        );
        if (active) {
          timerRef.current = setTimeout(() => void watchPlan(planId), 2500);
        } else {
          setNotice('Plan execution finished on WordPress.');
        }
      } catch {
        // transient network hiccup
      }
    },
    []
  );

  const approveAndRun = async () => {
    if (!plan) return;
    setError('');
    setBusy('apply');
    try {
      if (!approved) {
        const appRes = await fetch(`/api/connector/plans/${plan.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const appBody = await appRes.json().catch(() => ({}));
        if (!appRes.ok) {
          setError(appBody.message ?? 'Approval failed.');
          return;
        }
        setApproved(true);
      }

      const runRes = await fetch(`/api/connector/plans/${plan.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const runBody = await runRes.json().catch(() => ({}));
      if (!runRes.ok) {
        setError(runBody.message ?? 'Execution could not be queued.');
        return;
      }

      setNotice('Approved and queued. Connector will snapshot, update, and verify read-back…');
      void watchPlan(plan.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const undoSnapshot = async (snapshotId: string) => {
    setError('');
    setBusy(`undo:${snapshotId}`);
    try {
      const res = await fetch(`/api/connector/snapshots/${snapshotId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? 'Undo failed.');
        return;
      }
      setNotice('Settings restore job queued. Previous option values are being restored.');
      if (plan) void watchPlan(plan.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const groups: Array<'General' | 'Reading' | 'Discussion'> = ['General', 'Reading', 'Discussion'];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/studio" className="text-sm text-ink-muted underline-offset-4 hover:underline">
          ← Back to Studio
        </Link>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/connect" className="text-pink-700 underline">
            Connected sites
          </Link>
          <Link href="/settings/keys" className="text-pink-700 underline">
            Model API keys
          </Link>
        </div>
      </div>

      <h1 className="mt-6 text-2xl font-semibold text-ink">Safe WordPress Site Settings</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Every control on this page is generated from the 8-option connector write allowlist (
        <code>WRITABLE_SETTINGS_KEYS</code>). Changes create a hashed plan, capture a before-snapshot
        on WordPress, verify read-back, and support one-click undo.
      </p>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
        <p className="font-semibold">Origin lock protection (`siteurl` &amp; `home` are read-only)</p>
        <p className="mt-1">
          Canonical site URLs are intentionally excluded from remote writes so a prompt or form change
          can never lock out your WordPress site or break connector signing.
          {readOnlyUrls.siteurl ? (
            <span className="mt-1 block font-mono text-[11px]">
              siteurl: {readOnlyUrls.siteurl} · home: {readOnlyUrls.home ?? readOnlyUrls.siteurl}
            </span>
          ) : null}
        </p>
      </section>

      {sites.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">No active WordPress site connected</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Pair a WordPress site first to inspect and manage its settings safely.
          </p>
          <Link
            href="/connect"
            className="mt-4 inline-block rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white"
          >
            Connect a site
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="min-w-[240px] flex-1">
              <label htmlFor="site-select" className="block text-xs font-medium text-ink/70">
                Target WordPress site
              </label>
              <select
                id="site-select"
                value={selectedSite?.id ?? ''}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  setLoadedValues({});
                  setPlan(null);
                }}
                className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-ink"
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.url}) — {site.environment}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={fetchLiveSettings}
              disabled={loadingLive || !selectedSite}
              className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-black/[0.02] disabled:opacity-60"
            >
              {loadingLive ? 'Polling site…' : 'Load current settings from site'}
            </button>
          </section>

          {!hasSiteOpsScope ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
              The <code>site_ops</code> scope is currently disabled on this site. Enable{' '}
              <code>site_ops</code> on <Link href="/connect" className="underline">Connected sites</Link>{' '}
              before applying settings updates.
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {notice}
            </div>
          ) : null}

          {groups.map((group) => (
            <section
              key={group}
              className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
            >
              <h2 className="text-base font-semibold text-ink">{group} Settings</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {SETTING_FIELDS.filter((f) => f.group === group).map((field) => (
                  <div key={field.key} className={field.key === 'blogdescription' ? 'sm:col-span-2' : ''}>
                    <label
                      htmlFor={`setting-${field.key}`}
                      className="block text-xs font-semibold text-ink"
                    >
                      {field.label}
                    </label>
                    <p className="mt-0.5 text-[11px] text-ink/60">{field.hint}</p>
                    {field.kind === 'open_closed' ? (
                      <select
                        id={`setting-${field.key}`}
                        value={draft[field.key]}
                        onChange={(e) =>
                          setDraft((curr) => ({ ...curr, [field.key]: e.target.value }))
                        }
                        className="mt-1.5 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-ink"
                      >
                        <option value="">— Unchanged —</option>
                        <option value="open">open</option>
                        <option value="closed">closed</option>
                      </select>
                    ) : (
                      <input
                        id={`setting-${field.key}`}
                        type={field.kind === 'number' ? 'number' : 'text'}
                        min={field.min}
                        max={field.max}
                        placeholder={field.placeholder}
                        value={draft[field.key]}
                        onChange={(e) =>
                          setDraft((curr) => ({ ...curr, [field.key]: e.target.value }))
                        }
                        className="mt-1.5 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-ink"
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Before / After Diff Preview</h2>
                <p className="text-xs text-ink/60">
                  Only modified allowlisted fields are sent in <code>settings.update</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={stageSettingsPlan}
                disabled={changedEntries.length === 0 || busy === 'stage' || !hasSiteOpsScope}
                className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === 'stage' ? 'Staging plan…' : `Stage settings plan (${changedEntries.length})`}
              </button>
            </div>

            {changedEntries.length === 0 ? (
              <p className="mt-4 text-xs text-ink/50">
                Modify one or more fields above to preview the exact WordPress option diff.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-black/5 rounded-xl border border-black/10">
                {changedEntries.map((item) => (
                  <div
                    key={item.spec.key}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                  >
                    <span className="font-mono font-semibold text-ink">{item.spec.key}</span>
                    <span className="text-ink/70">
                      <span className="line-through opacity-70">{item.before}</span>{' '}
                      <span aria-hidden="true">→</span>{' '}
                      <span className="font-semibold text-emerald-700">{item.after}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {plan ? (
              <div className="mt-5 rounded-xl border border-black/10 bg-black/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{plan.summary}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink/60">
                      Plan {plan.id.slice(0, 8)} · risk {plan.risk} · status {plan.status} · sha256{' '}
                      {plan.hash.slice(0, 12)}…
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={approveAndRun}
                    disabled={busy === 'apply' || plan.status === 'applied'}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy === 'apply'
                      ? 'Applying…'
                      : plan.status === 'applied'
                        ? 'Applied'
                        : 'Approve & Apply to WordPress'}
                  </button>
                </div>
              </div>
            ) : null}

            {snapshots.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/60">
                  Recent settings snapshots (One-click undo)
                </h3>
                <ul className="mt-2 space-y-2">
                  {snapshots.map((snap) => (
                    <li
                      key={snap.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs"
                    >
                      <span>
                        <code>{snap.resource}</code> · {new Date(snap.created_at).toLocaleString()}
                      </span>
                      {snap.restored_at ? (
                        <span className="text-ink/50">Restored</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void undoSnapshot(snap.id)}
                          disabled={busy === `undo:${snap.id}`}
                          className="rounded border border-black/15 px-2.5 py-1 font-medium text-ink hover:bg-black/5"
                        >
                          {busy === `undo:${snap.id}` ? 'Restoring…' : 'Undo'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

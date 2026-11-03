'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RecoveryNotice } from '../../components/onboarding/RecoveryNotice';
import {
  ONBOARDING_STEPS,
  describeDeploymentIssue,
  describeOnboardingFailure,
  describeSiteState,
  describeWaitTimeout,
  type OnboardingAction,
  type OnboardingIssue,
} from '../../lib/onboarding/errors';
import {
  MAX_WAIT_MS,
  POLL_INTERVAL_MS,
  WIZARD_STORAGE_KEY,
  findNewSite,
  formatCountdown,
  hasCapabilityManifest,
  parseStoredStep,
  shouldStopWaiting,
  siteProgress,
  type SiteProgress,
  type WizardSite,
  type WizardStep,
} from '../../lib/onboarding/wizard';

interface PairingCode {
  code: string;
  expiresAt: string;
  expiresInSeconds: number;
  instructions?: string;
}

interface OwnedProject {
  id: string;
  name: string;
  description: string | null;
}

interface ConnectorConfig {
  authEnabled: boolean;
  storage: boolean;
  encryption: boolean;
  ready: boolean;
  hints: string[];
}

type RetryTarget = 'code' | 'poll' | 'load';

export default function OnboardingPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [projects, setProjects] = useState<OwnedProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [config, setConfig] = useState<ConnectorConfig | null>(null);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [codeBusy, setCodeBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [issue, setIssue] = useState<OnboardingIssue | null>(null);
  const [retryTarget, setRetryTarget] = useState<RetryTarget>('poll');
  const [baselineIds, setBaselineIds] = useState<string[]>([]);
  const [site, setSite] = useState<WizardSite | null>(null);
  const [phase, setPhase] = useState<SiteProgress>('waiting');
  const [elapsed, setElapsed] = useState(0);
  const [pollNonce, setPollNonce] = useState(0);

  const startedAtRef = useRef(0);
  const inFlightRef = useRef(false);

  const goToStep = useCallback((next: WizardStep) => {
    setStep(next);
    setIssue(null);
    if (next !== 3) {
      setSite(null);
      setPhase('waiting');
    }
    try {
      window.sessionStorage.setItem(WIZARD_STORAGE_KEY, String(next));
    } catch {
      // Private browsing can refuse storage; the wizard still works in memory.
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/connector/projects', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRetryTarget('load');
        setIssue(
          describeOnboardingFailure({ status: res.status, code: body.error, message: body.message })
        );
        return;
      }
      const list: OwnedProject[] = Array.isArray(body.projects) ? body.projects : [];
      setProjects(list);
      setSelectedProjectId((current) => current || list[0]?.id || '');
    } catch {
      setRetryTarget('load');
      setIssue(describeOnboardingFailure({ network: true }));
    }
  }, []);

  const loadBaseline = useCallback(async () => {
    try {
      const res = await fetch('/api/connector/sites', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRetryTarget('load');
        setIssue(
          describeOnboardingFailure({ status: res.status, code: body.error, message: body.message })
        );
        return;
      }
      const list: WizardSite[] = Array.isArray(body.sites) ? body.sites : [];
      setBaselineIds(list.map((item) => item.id));
    } catch {
      setRetryTarget('load');
      setIssue(describeOnboardingFailure({ network: true }));
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/connector/config', { cache: 'no-store' });
      const body = (await res.json()) as ConnectorConfig;
      setConfig(body);
      if (!body.ready) {
        // An explicit API error is more actionable than the advisory banner.
        setIssue((current) => current ?? describeDeploymentIssue(body.hints ?? []));
      }
    } catch {
      // The readiness probe is advisory; pairing will surface its own error.
    }
  }, []);

  useEffect(() => {
    try {
      setStep(parseStoredStep(window.sessionStorage.getItem(WIZARD_STORAGE_KEY)));
    } catch {
      setStep(1);
    }
    void loadProjects();
    void loadBaseline();
    void loadConfig();
  }, [loadProjects, loadBaseline, loadConfig]);

  const generateCode = useCallback(async () => {
    setCodeBusy(true);
    setIssue(null);
    setRetryTarget('code');
    try {
      const res = await fetch('/api/connector/pairing-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedProjectId ? { projectId: selectedProjectId } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIssue(
          describeOnboardingFailure({ status: res.status, code: body.error, message: body.message })
        );
        return;
      }
      const ttl = Number(body.expiresInSeconds) > 0 ? Number(body.expiresInSeconds) : 600;
      setCode({
        code: String(body.code ?? ''),
        expiresAt: String(body.expiresAt ?? ''),
        expiresInSeconds: ttl,
        instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
      });
      setRemaining(ttl);
      setCopied(false);
    } catch {
      setIssue(describeOnboardingFailure({ network: true }));
    } finally {
      setCodeBusy(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!code || !code.expiresAt) return;
    const expires = new Date(code.expiresAt).getTime();
    if (!Number.isFinite(expires)) return;
    const tick = () => {
      const left = Math.max(0, Math.round((expires - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setCode(null);
        setRetryTarget('code');
        setIssue(
          describeOnboardingFailure({
            code: 'PAIRING_CODE_EXPIRED',
            message: 'Codes are single-use and expire after ten minutes. Generate a new one.',
          })
        );
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [code]);

  // Step 3: poll for the first heartbeat. One in-flight request at a time,
  // cancelled on unmount / step change / manual retry.
  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    startedAtRef.current = Date.now();
    setElapsed(0);

    const run = async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      let keepPolling = false;
      try {
        const res = await fetch('/api/connector/sites', { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setRetryTarget('poll');
          setIssue(
            describeOnboardingFailure({ status: res.status, code: body.error, message: body.message })
          );
        } else {
          const list: WizardSite[] = Array.isArray(body.sites) ? body.sites : [];
          const found = findNewSite(list, baselineIds);
          const elapsedMs = Date.now() - startedAtRef.current;
          setElapsed(elapsedMs);
          setSite(found);
          const progress = siteProgress(found, elapsedMs);
          setPhase(progress);

          if (progress === 'ready' && found) {
            // Done: no more polling.
          } else if (!found && shouldStopWaiting(elapsedMs)) {
            setRetryTarget('code');
            setIssue(describeWaitTimeout());
          } else {
            keepPolling = true;
          }
        }
      } catch {
        if (!cancelled) {
          setRetryTarget('poll');
          setIssue(describeOnboardingFailure({ network: true }));
        }
      } finally {
        inFlightRef.current = false;
      }

      if (keepPolling && !cancelled) {
        timer = setTimeout(() => {
          void run();
        }, POLL_INTERVAL_MS);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      inFlightRef.current = false;
    };
  }, [step, baselineIds, pollNonce]);

  const handleAction = useCallback(
    (action: OnboardingAction) => {
      setIssue(null);
      switch (action.kind) {
        case 'link':
          return; // rendered as a real anchor
        case 'regenerate':
          goToStep(2);
          void generateCode();
          return;
        case 'wait':
          setPollNonce((value) => value + 1);
          return;
        case 'refresh':
          if (retryTarget === 'load') {
            void loadProjects();
            void loadBaseline();
          } else {
            setPollNonce((value) => value + 1);
          }
          return;
        case 'retry':
          if (retryTarget === 'code') void generateCode();
          else if (retryTarget === 'load') {
            void loadProjects();
            void loadBaseline();
          } else setPollNonce((value) => value + 1);
          return;
      }
    },
    [generateCode, goToStep, loadBaseline, loadProjects, retryTarget]
  );

  const resetWizard = useCallback(() => {
    try {
      window.sessionStorage.removeItem(WIZARD_STORAGE_KEY);
    } catch {
      // ignore
    }
    setStep(1);
    setCode(null);
    setRemaining(0);
    setCopied(false);
    setIssue(null);
    setSite(null);
    setPhase('waiting');
    setElapsed(0);
    void loadProjects();
    void loadBaseline();
  }, [loadBaseline, loadProjects]);

  const deploymentIssue =
    config && !config.ready ? describeDeploymentIssue(config.hints ?? []) : null;
  const siteIssue = site ? describeSiteState(site) : null;
  const activeIssue = issue ?? deploymentIssue ?? siteIssue;
  const waitingSeconds = Math.floor(elapsed / 1000);
  const canVerify = Boolean(code && remaining > 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-ink-muted underline-offset-4 hover:underline">
          ← Back to SitePilot
        </Link>
        <div className="flex flex-wrap gap-4">
          <Link href="/connect" className="text-pink-700 underline">
            Connected sites
          </Link>
          <Link href="/docs/connector" className="text-pink-700 underline">
            Install guide
          </Link>
          <Link href="/studio" className="text-pink-700 underline">
            Studio
          </Link>
        </div>
      </div>

      <h1 className="mt-6 text-2xl font-semibold text-ink">Set up your first WordPress site</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Three steps, about two minutes. Every write still needs a plan, your approval, a snapshot
        and read-back verification — this wizard only connects the site.
      </p>

      <ol className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Setup progress">
        {ONBOARDING_STEPS.map((entry) => {
          const state = step === entry.id ? 'current' : step > entry.id ? 'done' : 'upcoming';
          const interactive = state !== 'upcoming';
          return (
            <li
              key={entry.id}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`rounded-xl border p-3 ${
                state === 'current'
                  ? 'border-pink-300 bg-pink-50'
                  : state === 'done'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-black/5 bg-white opacity-60'
              }`}
            >
              <button
                type="button"
                disabled={!interactive}
                onClick={() => goToStep(entry.id)}
                className="flex w-full items-start gap-2 text-left disabled:cursor-default"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    state === 'done' ? 'bg-emerald-600 text-white' : 'bg-ink text-white'
                  }`}
                >
                  {state === 'done' ? '✓' : entry.id}
                </span>
                <span>
                  <span className="block text-xs font-semibold text-ink">{entry.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
                    {entry.hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {activeIssue ? <RecoveryNotice issue={activeIssue} onAction={handleAction} /> : null}

      {step === 1 ? (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">1 · Install the connector plugin</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Download the official ZIP, then in WordPress go to{' '}
            <strong>Plugins → Add New → Upload Plugin</strong>, choose the file, install and activate
            it. A <strong>SitePilot</strong> item appears in the admin menu.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="/downloads/kph-sitepilot-connector.zip"
              download="kph-sitepilot-connector-1.0.0.zip"
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
            >
              ⬇ Download WordPress Plugin (v1.0.0 .zip)
            </a>
            <a
              href="https://github.com/kanhajatthap/KPH-SitePilot/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-pink-700 underline"
            >
              GitHub Release &amp; checksums ↗
            </a>
          </div>

          <ul className="mt-5 space-y-1.5 text-sm text-ink-muted">
            <li>• WordPress 6.4+ and PHP 7.4+ (8.2+ recommended).</li>
            <li>• Only an administrator can pair a site.</li>
            <li>• The site calls SitePilot over HTTPS — no inbound port is opened.</li>
          </ul>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => goToStep(2)}
              className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"
            >
              I installed it → Generate a code
            </button>
            <Link
              href="/docs/connector"
              className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink"
            >
              Read the full install guide
            </Link>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">2 · Create a pairing code</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Codes are single-use, expire after ten minutes and are bound to your account.
          </p>

          {projects.length > 0 ? (
            <label className="mt-4 block text-xs font-semibold text-ink/70" htmlFor="onboarding-project">
              Project workspace
              <select
                id="onboarding-project"
                value={selectedProjectId}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value);
                  setCode(null);
                }}
                className="mt-1 block w-full max-w-sm rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-ink"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void generateCode()}
              disabled={codeBusy || config?.ready === false}
              className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {codeBusy ? 'Generating…' : code ? 'Generate a new code' : 'Generate pairing code'}
            </button>

            {code ? (
              <div className="flex flex-wrap items-center gap-3">
                <code className="rounded-lg bg-black/5 px-4 py-2 text-lg tracking-[0.2em]">
                  {code.code}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(code.code);
                    setCopied(true);
                  }}
                  className="rounded-lg border border-black/15 px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-black/5"
                >
                  {copied ? 'Copied ✓' : 'Copy code'}
                </button>
                <span className="text-xs text-ink-muted">
                  expires in {formatCountdown(remaining)}
                </span>
              </div>
            ) : null}
          </div>

          {config?.ready === false ? (
            <p className="mt-3 text-xs text-amber-800">
              Pairing is disabled until the deployment settings above are fixed.
            </p>
          ) : null}

          <div className="mt-6 rounded-xl border border-black/5 bg-black/[0.015] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              In WordPress
            </h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
              <li>
                Open <strong>SitePilot → Connect</strong> (the platform URL is already pre-filled).
              </li>
              <li>
                Paste the code{' '}
                {code ? (
                  <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12px]">{code.code}</code>
                ) : (
                  '(format ABCD-EFGH)'
                )}{' '}
                and press <strong>Connect site</strong>.
              </li>
              <li>The plugin stores its credentials and immediately sends a heartbeat.</li>
            </ol>
            {code?.instructions ? (
              <p className="mt-2 text-xs text-ink-muted">{code.instructions}</p>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => goToStep(3)}
              disabled={!canVerify}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              I pasted the code → Verify connection
            </button>
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink"
            >
              ← Back to install
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">3 · Verify &amp; scan</h2>

          {phase === 'ready' && site ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-950">
                ✓ {site.name || 'Your site'} is connected
              </p>
              <p className="mt-1 text-xs text-emerald-900/80">
                {site.url} · WordPress {site.wp_version ?? 'unknown'} · connector{' '}
                {site.plugin_version ?? 'unknown'}
              </p>
              <p className="mt-1 text-xs text-emerald-900/80">
                {hasCapabilityManifest(site.capabilities)
                  ? 'Capability manifest received — Studio now knows which tools this site supports.'
                  : 'Site is online; the capability manifest arrives with the next heartbeat.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/studio"
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
                >
                  Open Studio
                </Link>
                <Link
                  href="/activity"
                  className="rounded-lg border border-emerald-300 px-4 py-2 text-sm text-emerald-900"
                >
                  Activity log
                </Link>
                <button
                  type="button"
                  onClick={resetWizard}
                  className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink"
                >
                  Connect another site
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-black/5 bg-black/[0.015] p-4">
              <p className="text-sm font-medium text-ink" aria-live="polite">
                {phase === 'scanning'
                  ? 'Site found — scanning its capabilities…'
                  : phase === 'found'
                    ? 'Site found — waiting for it to become active…'
                    : 'Waiting for your WordPress site to call home…'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Polling every 3 seconds · waiting for {waitingSeconds}s · gives up after{' '}
                {Math.floor(MAX_WAIT_MS / 1000)}s with a recovery step.
              </p>

              {site ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Detected: {site.name || 'unnamed site'} ({site.url}) · status {site.status}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setPollNonce((value) => value + 1)}
                  className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-ink"
                >
                  Check again now
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-ink"
                >
                  ← Back to pairing code
                </button>
                {baselineIds.length > 0 ? (
                  <Link href="/studio" className="text-xs text-pink-700 underline">
                    Already have a site? Open Studio
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </section>
      ) : null}

      <p className="mt-8 text-xs text-ink-muted">
        Prefer one page with all the controls?{' '}
        <Link href="/connect" className="text-pink-700 underline">
          Open connected sites
        </Link>
        .
      </p>
    </main>
  );
}

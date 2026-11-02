/**
 * SaaS Connector Bridge for the main `/` Workspace Canvas.
 *
 * On Vercel serverless deployments, Phase-1 local routes (`/api/site/.../propose`
 * and `/apply`) cannot hold ephemeral proposals across Lambda instances and
 * cannot spawn local `php.exe` WP-CLI binaries. Whenever the active site is a
 * connected Supabase WordPress site, the Workspace Canvas stages and executes
 * changes through the hardened Supabase Connector plan -> approve -> execute ->
 * verify pipeline instead.
 */

export interface ConnectedWorkspaceSite {
  id: string;
  url: string;
  name: string;
  environment: string;
  status: string;
  scopes: string[] | null;
  capabilities: Record<string, unknown> | null;
}

export interface CanvasStructuredStepInput {
  tool: string;
  args?: Record<string, unknown>;
  risk?: 'R0' | 'R1' | 'R2' | 'R3';
  summary?: string;
}

export interface StagedConnectorCanvasPlan {
  planId: string;
  integrityHash: string;
  risk: 'R0' | 'R1' | 'R2' | 'R3';
  summary: string;
}

export interface ConnectorPlanJobSummary {
  id: string;
  tool: string;
  status: string;
  result: Record<string, unknown> | null;
  error: { code?: string; message?: string } | null;
}

export interface ConnectorCanvasExecutionOutcome {
  state: 'applied' | 'queued';
  planId: string;
  summary: string;
  jobs: ConnectorPlanJobSummary[];
  postOutcome?: {
    id: number;
    title: string;
    status: string;
    link?: string;
    editUrl?: string;
  };
  updatedSettingsKeys?: string[];
  wakeUrl: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): boolean {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export async function fetchConnectedWorkspaceSites(): Promise<ConnectedWorkspaceSite[]> {
  try {
    const res = await fetch('/api/connector/sites', { cache: 'no-store' });
    if (!res.ok) return [];
    const body = await res.json().catch(() => ({}));
    if (!Array.isArray(body.sites)) return [];
    return (body.sites as ConnectedWorkspaceSite[]).filter((s) => s && s.status === 'active');
  } catch {
    return [];
  }
}

export async function stageConnectorCanvasPlan(input: {
  siteId: string;
  prompt?: string;
  summary?: string;
  steps?: CanvasStructuredStepInput[];
  settingsValues?: Record<string, unknown>;
}): Promise<StagedConnectorCanvasPlan> {
  const res = await fetch('/api/connector/plans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      siteId: input.siteId,
      prompt: input.prompt && input.prompt.trim().length >= 4 ? input.prompt.trim().slice(0, 4000) : undefined,
      summary: input.summary && input.summary.trim().length >= 3 ? input.summary.trim().slice(0, 200) : undefined,
      structuredSteps: input.steps,
      settingsValues: input.settingsValues,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.plan?.id) {
    throw new Error(payload?.message ?? payload?.error ?? `Could not stage Connector plan (${res.status}).`);
  }

  return {
    planId: String(payload.plan.id),
    integrityHash: String(payload.plan.hash ?? ''),
    risk: (payload.plan.risk as 'R0' | 'R1' | 'R2' | 'R3') ?? 'R1',
    summary: String(payload.plan.summary ?? input.summary ?? 'Staged WordPress change'),
  };
}

function pingHttpsWordPressCron(siteUrl: string): void {
  if (!siteUrl.toLowerCase().startsWith('https://')) return;
  const url = `${siteUrl.replace(/\/+$/, '')}/wp-cron.php?doing_wp_cron=${Date.now()}`;
  void fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {
    // Best-effort wake ping only.
  });
}

function extractPostFromJobs(
  jobs: ConnectorPlanJobSummary[],
  siteUrl: string,
  fallbackTitle: string
): ConnectorCanvasExecutionOutcome['postOutcome'] {
  const cleanBase = siteUrl.replace(/\/+$/, '');
  for (const job of jobs) {
    const result = job.result;
    if (!result || typeof result !== 'object') continue;
    const after =
      result.after && typeof result.after === 'object'
        ? (result.after as Record<string, unknown>)
        : result;
    const rawId = after.id ?? result.createdId;
    const id = typeof rawId === 'number' ? rawId : Number(rawId);
    if (Number.isInteger(id) && id > 0) {
      return {
        id,
        title: typeof after.title === 'string' && after.title ? after.title : fallbackTitle,
        status: typeof after.status === 'string' && after.status ? after.status : 'draft',
        link: typeof after.link === 'string' && after.link ? after.link : `${cleanBase}/?p=${id}`,
        editUrl: `${cleanBase}/wp-admin/post.php?post=${id}&action=edit`,
      };
    }
  }
  return undefined;
}

/**
 * Approves a staged Connector plan (if still `proposed`), dispatches signed
 * jobs into `public.jobs`, and polls briefly for WordPress worker completion.
 *
 * If the target site is a local HTTP WordPress instance whose WP-Cron has not
 * ticked yet, returns `state: 'queued'` cleanly with a 1-click wake URL rather
 * than hanging or attempting local `php.exe` execution.
 */
export async function executeConnectorCanvasPlan(input: {
  planId: string;
  siteUrl: string;
  fallbackTitle?: string;
  maxPollAttempts?: number;
}): Promise<ConnectorCanvasExecutionOutcome> {
  const cleanBase = input.siteUrl.replace(/\/+$/, '');
  const wakeUrl = `${cleanBase}/wp-admin/admin.php?page=kph-sitepilot`;

  // Inspect current plan status & risk so we send the exact confirmation token required.
  const initialRes = await fetch(`/api/connector/plans/${input.planId}`, { cache: 'no-store' });
  const initialBody = await initialRes.json().catch(() => ({}));
  if (!initialRes.ok || !initialBody?.plan) {
    throw new Error(initialBody?.message ?? 'Staged Connector plan could not be loaded.');
  }

  let plan = initialBody.plan as { id: string; status: string; risk: string; summary: string };

  if (plan.status === 'proposed') {
    const confirmation =
      plan.risk === 'R3'
        ? plan.id.slice(0, 8).toUpperCase()
        : plan.risk === 'R2'
          ? 'CONFIRM'
          : undefined;

    const approveRes = await fetch(`/api/connector/plans/${plan.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(confirmation ? { confirmation } : {}),
    });
    const approveBody = await approveRes.json().catch(() => ({}));
    if (!approveRes.ok) {
      throw new Error(approveBody?.message ?? approveBody?.error ?? 'Could not approve Connector plan.');
    }
    if (approveBody?.plan) {
      plan = approveBody.plan;
    }
  }

  if (plan.status === 'approved') {
    const execRes = await fetch(`/api/connector/plans/${plan.id}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const execBody = await execRes.json().catch(() => ({}));
    if (!execRes.ok) {
      throw new Error(execBody?.message ?? execBody?.error ?? 'Could not queue Connector jobs.');
    }
  }

  pingHttpsWordPressCron(input.siteUrl);

  const maxAttempts = input.maxPollAttempts ?? 8;
  let latestJobs: ConnectorPlanJobSummary[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const pollRes = await fetch(`/api/connector/plans/${plan.id}`, { cache: 'no-store' });
    const pollBody = await pollRes.json().catch(() => ({}));
    if (!pollRes.ok || !pollBody?.plan) continue;

    plan = pollBody.plan;
    latestJobs = Array.isArray(pollBody.jobs) ? (pollBody.jobs as ConnectorPlanJobSummary[]) : [];

    if (plan.status === 'applied') {
      const updatedSettingsKeys: string[] = [];
      for (const job of latestJobs) {
        if (job.tool === 'settings.update' && job.result && typeof job.result.after === 'object' && job.result.after) {
          updatedSettingsKeys.push(...Object.keys(job.result.after as Record<string, unknown>));
        }
      }

      return {
        state: 'applied',
        planId: plan.id,
        summary: plan.summary,
        jobs: latestJobs,
        postOutcome: extractPostFromJobs(latestJobs, input.siteUrl, input.fallbackTitle ?? plan.summary),
        updatedSettingsKeys: updatedSettingsKeys.length > 0 ? updatedSettingsKeys : undefined,
        wakeUrl,
      };
    }

    if (plan.status === 'failed' || plan.status === 'rejected') {
      const failedJob = latestJobs.find((j) => j.error?.message);
      throw new Error(failedJob?.error?.message ?? 'WordPress Connector reported a failure while applying the plan.');
    }
  }

  return {
    state: 'queued',
    planId: plan.id,
    summary: plan.summary,
    jobs: latestJobs,
    wakeUrl,
  };
}

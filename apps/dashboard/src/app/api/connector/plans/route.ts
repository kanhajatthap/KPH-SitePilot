import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { planFromPrompt, type PlannerResult } from '../../../../lib/connector/planner';
import { planWithModel, toPlannerResult } from '../../../../lib/connector/model-planner';
import { createPlan } from '../../../../lib/connector/plans';
import { sanitizeSettingsValues } from '../../../../lib/connector/undo';
import {
  createSupabasePlanStore,
  getSiteContext,
  getUserApiKey,
  siteBelongsToUser,
} from '../../../../lib/connector/store';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

const CreatePlanSchema = z.object({
  siteId: z.string().uuid(),
  prompt: z.string().min(4).max(4000).optional(),
  settingsValues: z.record(z.unknown()).optional(),
});

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/connector/plans — turn a prompt into a reviewable plan.
 *
 * Nothing is written to WordPress here: a plan is a proposal with a hash the
 * user approves. Execution is a separate, explicit call.
 */
export async function POST(req: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json({ error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to create a plan.' }, 400);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'VALIDATION_FAILED', message: 'Request body must be JSON.' }, 400);
  }

  const parsed = CreatePlanSchema.safeParse(payload);
  if (!parsed.success || (!parsed.data.prompt && !parsed.data.settingsValues)) {
    return json({ error: 'VALIDATION_FAILED', message: 'A siteId and prompt (or settingsValues) are required.' }, 400);
  }

  let prevalidatedSettings: Record<string, string | number> | null = null;
  if (parsed.data.settingsValues !== undefined) {
    prevalidatedSettings = sanitizeSettingsValues(parsed.data.settingsValues);
    if (!prevalidatedSettings) {
      return json(
        {
          error: 'VALIDATION_FAILED',
          message:
            'settingsValues must contain only allowlisted WordPress options within valid ranges (siteurl and home are never writable).',
        },
        400
      );
    }
  }

  if (!(await siteBelongsToUser(parsed.data.siteId, auth.context.user.id))) {
    return json({ error: 'SITE_NOT_FOUND', message: 'No such site for your account.' }, 404);
  }

  const site = await getSiteContext(parsed.data.siteId);
  if (!site || site.status !== 'active') {
    return json({ error: 'SITE_NOT_ACTIVE', message: 'This site is paused or revoked.' }, 409);
  }

  let planned: PlannerResult;
  let plannerMeta: Record<string, unknown> = { kind: 'deterministic', mode: 'structured' };
  let effectivePrompt = parsed.data.prompt ?? '';

  if (prevalidatedSettings) {
    const keys = Object.keys(prevalidatedSettings);
    const summary = `Update site settings (${keys.join(', ')})`;
    effectivePrompt = effectivePrompt || `Structured settings update: ${keys.join(', ')}`;
    planned = {
      ok: true,
      summary,
      risk: 'R1',
      steps: [
        {
          tool: 'settings.update',
          args: { values: prevalidatedSettings },
          risk: 'R1',
          summary,
        },
      ],
    };
  } else {
    const promptText = parsed.data.prompt as string;
    effectivePrompt = promptText;

    // Planner selection. `auto` (default) uses the caller's own model key when
    // they have one and quietly falls back to the deterministic grammar; `model`
    // refuses instead of guessing; `deterministic` never calls a provider.
    const mode = (process.env.SITEPILOT_PLANNER ?? 'auto').trim().toLowerCase();
    if (!['auto', 'model', 'deterministic'].includes(mode)) {
      return json({ error: 'PLANNER_MISCONFIGURED', message: 'SITEPILOT_PLANNER must be auto, model or deterministic.' }, 500);
    }

    plannerMeta = { kind: 'deterministic', mode };
    const modelKey = mode === 'deterministic' ? null : await getUserApiKey(auth.context.user.id);

    if (mode !== 'deterministic' && !modelKey && mode === 'model') {
      return json(
        {
          error: 'PLANNER_KEY_MISSING',
          message: 'The model planner is required on this deployment, but no model key is stored for your account.',
        },
        400
      );
    }

    if (mode !== 'deterministic' && modelKey) {
      const modelled = await planWithModel(
        promptText,
        { url: site.url, name: site.name, capabilities: site.capabilities },
        {
          provider: modelKey.provider,
          apiKey: modelKey.key,
          timeoutMs: Number(process.env.SITEPILOT_PLANNER_TIMEOUT_MS ?? 12000),
        }
      );

      if (modelled.ok) {
        planned = toPlannerResult(modelled.plan);
        plannerMeta = {
          kind: 'model',
          mode,
          provider: modelled.provider,
          model: modelled.model,
          droppedSteps: modelled.dropped,
        };
      } else if (mode === 'model') {
        return json({ error: 'PLANNER_FAILED', message: modelled.reason }, 502);
      } else {
        planned = planFromPrompt(promptText);
        plannerMeta = { kind: 'deterministic', mode, fallbackReason: modelled.reason };
      }
    } else {
      planned = planFromPrompt(promptText);
    }
  }

  if (!planned.ok) {
    return json({ error: 'PLAN_NOT_UNDERSTOOD', message: planned.reason, planner: plannerMeta }, 422);
  }

  const store = createSupabasePlanStore();
  if (!store) {
    return json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Connector storage is not configured.' },
      503
    );
  }

  const created = await createPlan(
    {
      projectId: site.projectId,
      siteId: site.id,
      createdBy: auth.context.user.id,
      prompt: effectivePrompt,
      summary: planned.summary,
      steps: planned.steps,
      risk: planned.risk,
    },
    { store }
  );

  if (!created.ok) return json({ error: created.code, message: created.message }, created.status);

  return json(
    {
      plan: {
        id: created.plan.id,
        summary: created.plan.summary,
        risk: created.plan.risk,
        status: created.plan.status,
        hash: created.plan.hash,
        steps: created.plan.steps,
      },
      planner: plannerMeta,
      next: 'Review the steps, then approve the plan. Nothing has been written yet.',
    },
    201
  );
}

/** GET /api/connector/plans?siteId=… — plan history for one site. */
export async function GET(req: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json({ error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to see plans.' }, 400);
  }

  const siteId = new URL(req.url).searchParams.get('siteId');
  if (!siteId) return json({ error: 'VALIDATION_FAILED', message: 'siteId is required.' }, 400);
  if (!(await siteBelongsToUser(siteId, auth.context.user.id))) {
    return json({ error: 'SITE_NOT_FOUND', message: 'No such site for your account.' }, 404);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return json({ error: 'STORAGE_UNAVAILABLE', message: 'Storage unavailable.' }, 503);

  const { data, error } = await supabase
    .from('plans')
    .select('id, summary, risk, status, steps, created_at')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return json({ error: 'PLAN_LIST_FAILED', message: error.message }, 503);
  return json({ plans: data ?? [] }, 200);
}

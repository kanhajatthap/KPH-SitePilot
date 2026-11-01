import { z } from 'zod';
import {
  defaultPlannerModel,
  requestJsonCompletion,
  type PlannerProvider,
} from '@wp-agent/model-adapters';
import { TOOL_RISK } from './jobs';
import type { PlanStep, PlannerResult, Risk } from './planner';

/**
 * Model-backed planner (E3-02).
 *
 * The deterministic planner in `planner.ts` understands a narrow but exact
 * grammar and can never invent a tool. This module adds a model in front of it
 * without loosening anything: whatever the model returns is re-validated here
 * against the connector allowlist, per-tool argument rules and the risk floor.
 * A model that hallucinates a tool, a risk level or a missing post id produces
 * a *dropped step*, never an executable one; if nothing survives, the caller
 * falls back to the deterministic planner.
 */

const PLANNABLE_TOOLS = [
  'content.update',
  'content.create',
  'content.get',
  'content.list',
  'site.health',
  'plugins.list',
  'theme.info',
  'users.list',
  'media.list',
  'terms.list',
  'menus.list',
  'settings.get',
  'blocks.parse',
  'blocks.replace',
  'content.publish',
  'content.unpublish',
] as const;

const WRITABLE_STATUSES = ['draft', 'pending', 'publish', 'private'] as const;
const RISK_ORDER: Risk[] = ['R0', 'R1', 'R2', 'R3'];

const StepSchema = z.object({
  tool: z.string().min(3).max(40),
  args: z.record(z.unknown()).optional(),
  risk: z.enum(['R0', 'R1', 'R2', 'R3']).optional(),
  summary: z.string().max(200).optional(),
});

const PlanSchema = z.object({
  summary: z.string().min(3).max(200),
  steps: z.array(StepSchema).min(1).max(10),
});

export type ModelPlan = {
  summary: string;
  risk: Risk;
  steps: PlanStep[];
};

export type ModelPlanOutcome =
  | { ok: true; plan: ModelPlan; provider: PlannerProvider; model: string; dropped: string[] }
  | { ok: false; reason: string };

export const PLANNER_SYSTEM_PROMPT = `You convert a WordPress change request into a minimal execution plan.

Reply with ONE JSON object and nothing else:
{"summary": "<one sentence describing the outcome>", "steps": [{"tool": "<tool name>", "args": {<arguments>}, "summary": "<one sentence>"}]}

Allowed tools and argument rules:
- content.update: {"id": <post or page id>, "title"?: string, "content"?: string (HTML allowed), "excerpt"?: string, "status"?: "draft"|"pending"|"publish"|"private"} — at least one of title/content/excerpt/status.
- content.create: {"title": string, "content"?: string, "type"?: "post"|"page", "status"?: "draft"|"pending"|"publish"|"private"}
- content.get: {"id": <post id>}
- content.list: {"postTypes"?: string[], "limit"?: number}
- content.publish / content.unpublish: {"id": <post id>} — publishing makes content public.
- blocks.parse: {"id": <post id>} — read the block tree of one post.
- blocks.replace: {"id": <post id>, "index": <block index from blocks.parse>, "html": "<exactly one block of HTML>"}
- site.health, plugins.list, theme.info, users.list, media.list, terms.list, menus.list, settings.get: {} or their documented filters.

Rules:
- Never invent ids. If the request does not name a post or page id, you may only use content.create or a list/read tool.
- Copy any quoted replacement text exactly as written; do not translate or embellish it.
- Use the fewest steps that satisfy the request. One change per step.
- Do not add steps the user did not ask for.`;

export interface SiteContextForPrompt {
  url: string;
  name: string;
  capabilities?: Record<string, unknown> | null;
}

export function buildPlannerUserPrompt(prompt: string, site: SiteContextForPrompt): string {
  const lines = [`Site: ${site.name} (${site.url})`];

  const capabilities = site.capabilities ?? null;
  if (capabilities) {
    const theme = capabilities.theme as { name?: string; type?: string } | undefined;
    const postTypes = capabilities.postTypes as unknown[] | undefined;
    if (theme?.name) lines.push(`Theme: ${theme.name}${theme.type ? ` (${theme.type})` : ''}`);
    if (Array.isArray(postTypes) && postTypes.length) {
      lines.push(`Post types: ${postTypes.slice(0, 12).join(', ')}`);
    }
  }

  lines.push('', 'Request:', prompt.trim());
  return lines.join('\n');
}

function riskFloor(tool: string): Risk {
  return (TOOL_RISK[tool] as Risk | undefined) ?? 'R0';
}

function hardenRisk(tool: string, claimed: Risk | undefined): Risk {
  const floor = riskFloor(tool);
  if (!claimed) return floor;
  return RISK_ORDER.indexOf(claimed) > RISK_ORDER.indexOf(floor) ? claimed : floor;
}

function asPositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return null;
  const int = Math.trunc(parsed);
  return int > 0 && int <= 2_147_483_647 ? int : null;
}

function asText(value: unknown, max = 20_000): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.slice(0, max) : undefined;
}

/**
 * Re-validates one model step. Returns null when the step cannot be executed
 * exactly as the connector would understand it.
 */
export function sanitizeStep(raw: z.infer<typeof StepSchema>): PlanStep | null {
  if (!(PLANNABLE_TOOLS as readonly string[]).includes(raw.tool)) return null;

  const args = (raw.args ?? {}) as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};

  switch (raw.tool) {
    case 'content.update': {
      const id = asPositiveInt(args.id);
      if (!id) return null;

      const title = asText(args.title, 400);
      const content = asText(args.content, 100_000);
      const excerpt = asText(args.excerpt, 2000);
      const status = typeof args.status === 'string' ? args.status.trim().toLowerCase() : undefined;

      if (status && !(WRITABLE_STATUSES as readonly string[]).includes(status)) return null;
      if (!title && !content && !excerpt && !status) return null;

      cleaned.id = id;
      if (title) cleaned.title = title;
      if (content) cleaned.content = content;
      if (excerpt) cleaned.excerpt = excerpt;
      if (status) cleaned.status = status;
      break;
    }

    case 'content.create': {
      const title = asText(args.title, 400);
      if (!title) return null;

      const type = typeof args.type === 'string' ? args.type.trim().toLowerCase() : 'page';
      if (!['post', 'page'].includes(type)) return null;

      const status = typeof args.status === 'string' ? args.status.trim().toLowerCase() : 'draft';
      if (!(WRITABLE_STATUSES as readonly string[]).includes(status)) return null;

      cleaned.title = title;
      cleaned.type = type;
      cleaned.status = status;

      const content = asText(args.content, 100_000);
      if (content) cleaned.content = content;
      break;
    }

    case 'content.get':
    case 'blocks.parse':
    case 'content.publish':
    case 'content.unpublish': {
      const id = asPositiveInt(args.id);
      if (!id) return null;
      cleaned.id = id;
      break;
    }

    case 'blocks.replace': {
      const id = asPositiveInt(args.id);
      if (!id) return null;

      const index = Number(args.index);
      if (!Number.isInteger(index) || index < 0 || index > 500) return null;

      const html = asText(args.html, 100_000);
      if (!html) return null;

      cleaned.id = id;
      cleaned.index = index;
      cleaned.html = html;
      break;
    }

    case 'content.list': {
      const limit = asPositiveInt(args.limit);
      cleaned.limit = limit ? Math.min(limit, 20) : 10;
      if (Array.isArray(args.postTypes)) {
        const types = args.postTypes
          .filter((type): type is string => typeof type === 'string')
          .map((type) => type.trim().toLowerCase())
          .filter((type) => ['post', 'page', 'product', 'attachment'].includes(type));
        if (types.length) cleaned.postTypes = [...new Set(types)];
      }
      break;
    }

    case 'terms.list': {
      const taxonomy = typeof args.taxonomy === 'string' ? args.taxonomy.trim().toLowerCase() : 'category';
      if (!/^[a-z0-9_-]{1,32}$/.test(taxonomy)) return null;
      cleaned.taxonomy = taxonomy;
      break;
    }

    default:
      // Inventory reads take no arguments we care about; never forward unknown keys.
      break;
  }

  return {
    tool: raw.tool,
    args: cleaned,
    risk: hardenRisk(raw.tool, raw.risk),
    summary: (raw.summary ?? '').trim().slice(0, 200) || describeStep(raw.tool, cleaned),
  };
}

function describeStep(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'content.update':
      return `Update ${args.id ? `item ${args.id}` : 'content'}`;
    case 'content.create':
      return `Create draft "${String(args.title ?? '')}"`.slice(0, 200);
    case 'content.get':
      return `Read item ${String(args.id ?? '')}`;
    case 'content.list':
      return 'List content';
    case 'content.publish':
      return `Publish item ${String(args.id ?? '')}`;
    case 'content.unpublish':
      return `Move item ${String(args.id ?? '')} back to draft`;
    case 'blocks.replace':
      return `Replace block ${String(args.index ?? '')} of item ${String(args.id ?? '')}`;
    default:
      return `Run ${tool}`;
  }
}

/**
 * Turns raw model text into a hardened plan. Exported so tests can feed the
 * exact strings a model would produce.
 */
export function parseModelPlan(text: string): ModelPlanOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return { ok: false, reason: 'The model did not return JSON.' };
  }

  const result = PlanSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      reason: `The model plan was malformed${first ? ` (${first.path.join('.')}: ${first.message})` : ''}.`,
    };
  }

  const steps: PlanStep[] = [];
  const dropped: string[] = [];

  for (const raw of result.data.steps) {
    const step = sanitizeStep(raw);
    if (step) steps.push(step);
    else dropped.push(raw.tool);
  }

  if (!steps.length) {
    return {
      ok: false,
      reason: `None of the suggested steps can run on this connector${dropped.length ? ` (dropped: ${dropped.join(', ')})` : ''}.`,
    };
  }

  const risk = steps.reduce<Risk>(
    (worst, step) => (RISK_ORDER.indexOf(step.risk) > RISK_ORDER.indexOf(worst) ? step.risk : worst),
    'R0'
  );

  return {
    ok: true,
    plan: { summary: result.data.summary.trim(), risk, steps },
    provider: 'gemini',
    model: '',
    dropped,
  };
}

/** Models like to wrap JSON in ```json fences even when told not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export interface ModelPlannerGateway {
  provider: PlannerProvider;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrlOverride?: string;
}

/**
 * Runs the model, parses and hardens the answer.
 *
 * Every failure mode (no key, network, HTTP error, bad JSON, unusable steps)
 * comes back as `{ ok: false, reason }` so the route can fall back to the
 * deterministic planner and still answer the user.
 */
export async function planWithModel(
  prompt: string,
  site: SiteContextForPrompt,
  gateway: ModelPlannerGateway
): Promise<ModelPlanOutcome> {
  const completion = await requestJsonCompletion({
    provider: gateway.provider,
    apiKey: gateway.apiKey,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    userPrompt: buildPlannerUserPrompt(prompt, site),
    model: gateway.model ?? defaultPlannerModel(gateway.provider),
    timeoutMs: gateway.timeoutMs,
    fetchImpl: gateway.fetchImpl,
    baseUrlOverride: gateway.baseUrlOverride,
  });

  if (!completion.ok) return { ok: false, reason: completion.reason };

  const parsed = parseModelPlan(completion.text);
  if (!parsed.ok) return parsed;

  return { ...parsed, provider: completion.provider, model: completion.model };
}

/** Shapes a model plan into the planner contract the plan store already uses. */
export function toPlannerResult(plan: ModelPlan): Extract<PlannerResult, { ok: true }> {
  return { ok: true, summary: plan.summary, risk: plan.risk, steps: plan.steps };
}

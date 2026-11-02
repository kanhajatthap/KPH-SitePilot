import { z } from 'zod';
import {
  defaultPlannerModel,
  requestJsonCompletion,
  type PlannerProvider,
} from '@wp-agent/model-adapters';
import { hardenToolRisk, PLANNABLE_TOOLS } from '@wp-agent/wp-tools';
import type { PlanStep, PlannerResult, Risk } from './planner';
import { sanitizeSettingsValues } from './undo';

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

const WRITABLE_STATUSES = ['draft', 'pending', 'publish', 'private'] as const;
const CREATABLE_STATUSES = ['draft', 'pending', 'publish'] as const;
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
- content.update: {"id": <post or page id>, "title"?: string, "content"?: string (Gutenberg block HTML allowed), "excerpt"?: string, "status"?: "draft"|"pending"|"publish"|"private"} — at least one of title/content/excerpt/status.
- content.create: {"title": string, "content"?: string (Gutenberg block HTML), "excerpt"?: string, "type"?: "post"|"page", "status"?: "draft"|"pending"|"publish", "slug"?: string, "featuredMediaId"?: number, "preventDuplicateSlug"?: boolean}
- content.get: {"id": <post id>}
- content.list: {"postTypes"?: string[], "limit"?: number}
- content.publish / content.unpublish: {"id": <post id>} — publishing makes content public.
- blocks.parse: {"id": <post id>} — read the block tree of one post.
- blocks.replace: {"id": <post id>, "index": <block index from blocks.parse>, "html": "<exactly one block of HTML>"}
- settings.update: {"values": {"blogname"?: string, "blogdescription"?: string, "timezone_string"?: string, "date_format"?: string, "time_format"?: string, "posts_per_page"?: number (1..100), "default_comment_status"?: "open"|"closed", "default_ping_status"?: "open"|"closed"}} — never siteurl or home.
- seo.meta.get: {"id": <post id>}
- seo.meta.update: {"id": <post id>, "title"?: string, "description"?: string, "canonical"?: string, "ogTitle"?: string, "ogDescription"?: string, "noindex"?: boolean} — at least one SEO field.
- media.update: {"id": <attachment id>, "alt"?: string, "title"?: string, "caption"?: string, "description"?: string} — at least one field.
- media.set_featured: {"id": <post id>, "mediaId": <attachment id or 0 to clear>}
- menus.save: {"menuId"?: number, "name"?: string, "location"?: string, "items": [{"title": string, "url": string}]}
- site.logs: {"lines"?: number (1..200)}
- site.search: {"query": string (1..120 chars), "type"?: "post"|"page"|"attachment", "limit"?: number (1..25)}
- terms.create: {"taxonomy"?: "category"|"post_tag"|string, "name": string (1..120 chars), "slug"?: string, "description"?: string}
- terms.assign: {"id": <post id>, "taxonomy"?: "category"|"post_tag"|string, "terms": [<term id or name>, ...], "append"?: boolean}
- site.info, site.health, plugins.list, theme.info, users.list, media.list, terms.list, menus.list, settings.get: {} or their documented filters.

Rules:
- Never invent ids. If the request does not name a post, page, or attachment id, you may only use content.create, settings.update, terms.create, menus.save (with name), or a list/read/search/logs tool.
- When asked to design, build, or create a homepage, landing page, Elementor layout, or multi-section page without an existing id, use content.create with "type": "page", "status": "draft" (unless explicitly asked to publish), and rich WordPress Gutenberg block HTML ("<!-- wp:group -->", "<!-- wp:heading -->", "<!-- wp:paragraph -->", "<!-- wp:columns -->", "<!-- wp:buttons -->") containing tailored copy, headings, feature cards, and call-to-action buttons that work seamlessly in Hello Elementor and Gutenberg.
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

function asPositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return null;
  const int = Math.trunc(parsed);
  return int > 0 && int <= 2_147_483_647 ? int : null;
}

function asNonNegativeInt(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return null;
  const int = Math.trunc(parsed);
  return int >= 0 && int <= 2_147_483_647 ? int : null;
}

function asText(value: unknown, max = 20_000): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.slice(0, max) : undefined;
}

/**
 * Re-validates one model step. Returns null when the step cannot be executed
 * exactly as the connector would understand it.
 */
export function sanitizeStep(raw: z.infer<typeof StepSchema>): PlanStep | null {
  if (!PLANNABLE_TOOLS.includes(raw.tool)) return null;

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

      const rawStatus = typeof args.status === 'string' ? args.status.trim().toLowerCase() : 'draft';
      if (!(WRITABLE_STATUSES as readonly string[]).includes(rawStatus)) return null;
      // PHP `content.create` accepts draft | pending | publish; coerce private -> draft.
      const status = (CREATABLE_STATUSES as readonly string[]).includes(rawStatus)
        ? rawStatus
        : 'draft';

      cleaned.title = title;
      cleaned.type = type;
      cleaned.status = status;

      const content = asText(args.content, 100_000);
      if (content) cleaned.content = content;

      const excerpt = asText(args.excerpt, 2_000);
      if (excerpt) cleaned.excerpt = excerpt;

      const slug =
        typeof args.slug === 'string'
          ? args.slug
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 200)
          : '';
      if (slug) cleaned.slug = slug;

      const featuredMediaId = asPositiveInt(args.featuredMediaId);
      if (featuredMediaId) cleaned.featuredMediaId = featuredMediaId;

      if (typeof args.preventDuplicateSlug === 'boolean') {
        cleaned.preventDuplicateSlug = args.preventDuplicateSlug;
      }
      break;
    }

    case 'content.get':
    case 'blocks.parse':
    case 'content.publish':
    case 'content.unpublish':
    case 'seo.meta.get': {
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

    case 'site.logs': {
      const lines = asPositiveInt(args.lines);
      if (lines) cleaned.lines = Math.min(200, lines);
      break;
    }

    case 'terms.list': {
      const taxonomy = typeof args.taxonomy === 'string' ? args.taxonomy.trim().toLowerCase() : 'category';
      if (!/^[a-z0-9_-]{1,32}$/.test(taxonomy)) return null;
      cleaned.taxonomy = taxonomy;
      break;
    }

    case 'settings.update': {
      const candidate = 'values' in args ? args.values : args;
      const values = sanitizeSettingsValues(candidate);
      if (!values) return null;
      cleaned.values = values;
      break;
    }

    case 'seo.meta.update': {
      const id = asPositiveInt(args.id);
      if (!id) return null;

      const title = typeof args.title === 'string' ? args.title.trim().slice(0, 300) : undefined;
      const description =
        typeof args.description === 'string' ? args.description.trim().slice(0, 500) : undefined;
      const canonical =
        typeof args.canonical === 'string' ? args.canonical.trim().slice(0, 500) : undefined;
      const ogTitle =
        typeof args.ogTitle === 'string' ? args.ogTitle.trim().slice(0, 300) : undefined;
      const ogDescription =
        typeof args.ogDescription === 'string' ? args.ogDescription.trim().slice(0, 500) : undefined;
      const noindex = typeof args.noindex === 'boolean' ? args.noindex : undefined;

      if (canonical && canonical.length > 0 && !/^https?:\/\//i.test(canonical)) {
        return null;
      }

      if (
        title === undefined &&
        description === undefined &&
        canonical === undefined &&
        ogTitle === undefined &&
        ogDescription === undefined &&
        noindex === undefined
      ) {
        return null;
      }

      cleaned.id = id;
      if (title !== undefined) cleaned.title = title;
      if (description !== undefined) cleaned.description = description;
      if (canonical !== undefined) cleaned.canonical = canonical;
      if (ogTitle !== undefined) cleaned.ogTitle = ogTitle;
      if (ogDescription !== undefined) cleaned.ogDescription = ogDescription;
      if (noindex !== undefined) cleaned.noindex = noindex;
      break;
    }

    case 'media.update': {
      const id = asPositiveInt(args.id);
      if (!id) return null;

      const alt = typeof args.alt === 'string' ? args.alt.trim().slice(0, 300) : undefined;
      const title = typeof args.title === 'string' ? args.title.trim().slice(0, 300) : undefined;
      const caption =
        typeof args.caption === 'string' ? args.caption.trim().slice(0, 1_000) : undefined;
      const description =
        typeof args.description === 'string' ? args.description.trim().slice(0, 4_000) : undefined;

      if (
        alt === undefined &&
        title === undefined &&
        caption === undefined &&
        description === undefined
      ) {
        return null;
      }

      cleaned.id = id;
      if (alt !== undefined) cleaned.alt = alt;
      if (title !== undefined) cleaned.title = title;
      if (caption !== undefined) cleaned.caption = caption;
      if (description !== undefined) cleaned.description = description;
      break;
    }

    case 'media.set_featured': {
      const id = asPositiveInt(args.id);
      const mediaId = asNonNegativeInt(args.mediaId);
      if (!id || mediaId === null) return null;
      cleaned.id = id;
      cleaned.mediaId = mediaId;
      break;
    }

    case 'menus.save': {
      const menuId = asPositiveInt(args.menuId);
      const name = asText(args.name, 120)?.trim();
      if (!menuId && !name) return null;
      if (!Array.isArray(args.items) || args.items.length === 0 || args.items.length > 50) {
        return null;
      }

      const items: Array<{ title: string; url: string }> = [];
      for (const entry of args.items) {
        if (!entry || typeof entry !== 'object') return null;
        const itemTitle = asText((entry as { title?: unknown }).title, 120)?.trim();
        const itemUrl = asText((entry as { url?: unknown }).url, 500)?.trim();
        if (!itemTitle || !itemUrl || !/^(?:https?:\/\/|\/|#)/i.test(itemUrl)) return null;
        items.push({ title: itemTitle, url: itemUrl });
      }

      if (menuId) cleaned.menuId = menuId;
      if (name) cleaned.name = name;
      if (typeof args.location === 'string' && /^[a-z0-9_-]{1,64}$/.test(args.location)) {
        cleaned.location = args.location;
      }
      cleaned.items = items;
      break;
    }

    case 'site.search': {
      const query = asText(args.query, 120)?.trim();
      if (!query) return null;
      cleaned.query = query;
      if (args.type === 'post' || args.type === 'page' || args.type === 'attachment') {
        cleaned.type = args.type;
      }
      const limit = asPositiveInt(args.limit);
      if (limit !== null) cleaned.limit = Math.min(25, limit);
      break;
    }

    case 'terms.create': {
      const name = asText(args.name, 120)?.trim();
      if (!name) return null;
      const taxonomy =
        typeof args.taxonomy === 'string' && /^[a-z0-9_-]{1,64}$/.test(args.taxonomy)
          ? args.taxonomy
          : 'category';
      cleaned.taxonomy = taxonomy;
      cleaned.name = name;
      const slug = asText(args.slug, 120)?.trim();
      if (slug) cleaned.slug = slug;
      const description = asText(args.description, 500)?.trim();
      if (description) cleaned.description = description;
      break;
    }

    case 'terms.assign': {
      const id = asPositiveInt(args.id);
      if (id === null || !Array.isArray(args.terms) || args.terms.length === 0 || args.terms.length > 50) {
        return null;
      }
      const terms: Array<number | string> = [];
      for (const entry of args.terms) {
        if (typeof entry === 'number' && Number.isInteger(entry) && entry > 0) {
          terms.push(entry);
        } else if (typeof entry === 'string' && entry.trim().length > 0 && entry.trim().length <= 120) {
          terms.push(entry.trim());
        } else {
          return null;
        }
      }
      const taxonomy =
        typeof args.taxonomy === 'string' && /^[a-z0-9_-]{1,64}$/.test(args.taxonomy)
          ? args.taxonomy
          : 'category';
      cleaned.id = id;
      cleaned.taxonomy = taxonomy;
      cleaned.terms = terms;
      if (typeof args.append === 'boolean') cleaned.append = args.append;
      break;
    }

    default:
      // Inventory reads take no arguments we care about; never forward unknown keys.
      break;
  }

  return {
    tool: raw.tool,
    args: cleaned,
    risk: hardenToolRisk(raw.tool, raw.risk),
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
    case 'settings.update': {
      const keys =
        args.values && typeof args.values === 'object'
          ? Object.keys(args.values as Record<string, unknown>)
          : [];
      return keys.length ? `Update site settings (${keys.join(', ')})` : 'Update site settings';
    }
    case 'seo.meta.get':
      return `Read SEO meta of item ${String(args.id ?? '')}`;
    case 'seo.meta.update':
      return `Update SEO meta of item ${String(args.id ?? '')}`;
    case 'media.update':
      return `Update media #${String(args.id ?? '')} metadata`;
    case 'media.set_featured':
      return Number(args.mediaId) === 0
        ? `Clear featured image on item ${String(args.id ?? '')}`
        : `Set featured image #${String(args.mediaId ?? '')} on item ${String(args.id ?? '')}`;
    case 'menus.save':
      return `Save navigation menu ${args.name ? `"${String(args.name)}"` : `#${String(args.menuId ?? '')}`}`.slice(
        0,
        200
      );
    case 'site.logs':
      return 'Read sanitized PHP debug log tail';
    case 'site.search':
      return `Search site for "${String(args.query ?? '')}"`.slice(0, 200);
    case 'terms.create':
      return `Create ${String(args.taxonomy ?? 'category')} "${String(args.name ?? '')}"`.slice(0, 200);
    case 'terms.assign':
      return `Assign ${String(args.taxonomy ?? 'category')} terms on item ${String(args.id ?? '')}`;
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

export const GEMINI_FALLBACK_PLANNER_MODEL = 'gemini-2.5-flash';

function shouldRetryOnGeminiFallback(reason: string): boolean {
  return /timed out|HTTP (?:404|429|503)\b/i.test(reason);
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
  const userPrompt = buildPlannerUserPrompt(prompt, site);
  const primaryModel = gateway.model ?? defaultPlannerModel(gateway.provider);

  let completion = await requestJsonCompletion({
    provider: gateway.provider,
    apiKey: gateway.apiKey,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    userPrompt,
    model: primaryModel,
    timeoutMs: gateway.timeoutMs,
    fetchImpl: gateway.fetchImpl,
    baseUrlOverride: gateway.baseUrlOverride,
  });

  // Note: in production (`!gateway.fetchImpl`), `requestJsonCompletion` already
  // queries `/v1beta/models` and cascades across up to 3 live Flash models.
  // When a custom `fetchImpl` is injected (unit tests), fall back explicitly.
  if (
    !completion.ok &&
    gateway.provider === 'gemini' &&
    Boolean(gateway.fetchImpl) &&
    !gateway.model &&
    primaryModel !== GEMINI_FALLBACK_PLANNER_MODEL &&
    shouldRetryOnGeminiFallback(completion.reason)
  ) {
    completion = await requestJsonCompletion({
      provider: gateway.provider,
      apiKey: gateway.apiKey,
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      userPrompt,
      model: GEMINI_FALLBACK_PLANNER_MODEL,
      timeoutMs: gateway.timeoutMs,
      fetchImpl: gateway.fetchImpl,
      baseUrlOverride: gateway.baseUrlOverride,
    });
  }

  if (!completion.ok) return { ok: false, reason: completion.reason };

  const parsed = parseModelPlan(completion.text);
  if (!parsed.ok) return parsed;

  return { ...parsed, provider: completion.provider, model: completion.model };
}

/** Shapes a model plan into the planner contract the plan store already uses. */
export function toPlannerResult(plan: ModelPlan): Extract<PlannerResult, { ok: true }> {
  return { ok: true, summary: plan.summary, risk: plan.risk, steps: plan.steps };
}

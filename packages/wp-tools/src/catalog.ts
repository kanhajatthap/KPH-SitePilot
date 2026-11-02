import { z } from 'zod';

/**
 * Canonical WordPress Connector Tool Catalog (E3-01).
 *
 * Every Connector tool — shipped V1 or honest V2 roadmap — is declared here
 * with its family, scope, minimum risk floor, undo metadata, and Zod argument
 * schema. Both the dashboard allowlist (`CONNECTOR_TOOL_ALLOWLIST`) and the
 * per-site capability graph (`evaluateSiteCapabilities`) derive from this file.
 */

export const ALL_SITE_SCOPES = [
  'read',
  'content',
  'media',
  'site_ops',
  'commerce',
  'files',
  'code',
] as const;

export type SiteScope = (typeof ALL_SITE_SCOPES)[number];

export const RISK_ORDER = ['R0', 'R1', 'R2', 'R3'] as const;
export type ToolRisk = (typeof RISK_ORDER)[number];

export type ToolFamily =
  | 'site'
  | 'content'
  | 'blocks'
  | 'terms'
  | 'media'
  | 'menus'
  | 'settings'
  | 'seo'
  | 'plugins'
  | 'users'
  | 'commerce'
  | 'files';

export interface ToolSpec {
  tool: string;
  label: string;
  family: ToolFamily;
  scope: SiteScope;
  risk: ToolRisk;
  shipped: boolean;
  reversible: boolean;
  undoTool?: string;
  requiresFeature?: 'woocommerce' | 'seo_plugin';
  argsSchema: z.ZodTypeAny;
}

const EmptyArgsSchema = z.object({}).passthrough();
const IdArgSchema = z.object({ id: z.number().int().positive() }).strict();

export const WP_TOOL_SPECS: readonly ToolSpec[] = [
  // ── Shipped R0 Read Tools (15) ───────────────────────────────────────────
  {
    tool: 'site.info',
    label: 'Inspect site manifest',
    family: 'site',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: EmptyArgsSchema,
  },
  {
    tool: 'site.health',
    label: 'Check site health & disk usage',
    family: 'site',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: EmptyArgsSchema,
  },
  {
    tool: 'site.logs',
    label: 'Read redacted debug.log tail',
    family: 'site',
    scope: 'site_ops',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        lines: z.number().int().min(1).max(80).optional(),
      })
      .strict(),
  },
  {
    tool: 'site.search',
    label: 'Search posts, pages & media',
    family: 'site',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        query: z.string().min(1).max(120),
        type: z.enum(['post', 'page', 'attachment']).optional(),
        limit: z.number().int().min(1).max(25).optional(),
      })
      .strict(),
  },
  {
    tool: 'content.list',
    label: 'List posts & pages',
    family: 'content',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        limit: z.number().int().min(1).max(50).optional(),
        postTypes: z.array(z.string().min(1).max(32)).max(10).optional(),
      })
      .strict(),
  },
  {
    tool: 'content.get',
    label: 'Read post/page content',
    family: 'content',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: IdArgSchema,
  },
  {
    tool: 'blocks.parse',
    label: 'Parse Gutenberg block tree',
    family: 'blocks',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: IdArgSchema,
  },
  {
    tool: 'theme.info',
    label: 'Read active theme info',
    family: 'site',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: EmptyArgsSchema,
  },
  {
    tool: 'terms.list',
    label: 'List categories & tags',
    family: 'terms',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        taxonomy: z.string().regex(/^[a-z0-9_-]{1,64}$/).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
  },
  {
    tool: 'menus.list',
    label: 'List navigation menus',
    family: 'menus',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: EmptyArgsSchema,
  },
  {
    tool: 'settings.get',
    label: 'Read allowlisted settings',
    family: 'settings',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        keys: z.array(z.string().min(1).max(64)).max(20).optional(),
      })
      .strict(),
  },
  {
    tool: 'seo.meta.get',
    label: 'Read Yoast / Rank Math / SEOPress SEO meta',
    family: 'seo',
    scope: 'read',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: IdArgSchema,
  },
  {
    tool: 'media.list',
    label: 'Browse media library',
    family: 'media',
    scope: 'media',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        limit: z.number().int().min(1).max(50).optional(),
        page: z.number().int().min(1).max(200).optional(),
        mime: z.string().max(64).optional(),
      })
      .strict(),
  },
  {
    tool: 'plugins.list',
    label: 'List installed plugins',
    family: 'plugins',
    scope: 'site_ops',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: EmptyArgsSchema,
  },
  {
    tool: 'users.list',
    label: 'List user roles (no emails)',
    family: 'users',
    scope: 'site_ops',
    risk: 'R0',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        limit: z.number().int().min(1).max(50).optional(),
      })
      .strict(),
  },

  // ── Shipped Verified Write & Restore Tools (19) ──────────────────────────
  {
    tool: 'content.create',
    label: 'Create draft page/post',
    family: 'content',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'content.unpublish',
    argsSchema: z
      .object({
        title: z.string().min(1).max(400),
        content: z.string().max(100_000).optional(),
        excerpt: z.string().max(2_000).optional(),
        type: z.enum(['post', 'page']).optional(),
        status: z.enum(['draft', 'pending', 'publish']).optional(),
        slug: z.string().max(200).optional(),
        featuredMediaId: z.number().int().nonnegative().optional(),
        preventDuplicateSlug: z.boolean().optional(),
      })
      .strict(),
  },
  {
    tool: 'content.update',
    label: 'Update post/page copy',
    family: 'content',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'content.restore',
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(400).optional(),
        content: z.string().max(100_000).optional(),
        excerpt: z.string().max(2_000).optional(),
        status: z.enum(['draft', 'pending', 'publish', 'private']).optional(),
      })
      .strict(),
  },
  {
    tool: 'content.restore',
    label: 'Restore content snapshot',
    family: 'content',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        id: z.number().int().positive().optional(),
        before: z.record(z.unknown()).optional(),
      })
      .passthrough(),
  },
  {
    tool: 'content.publish',
    label: 'Publish post/page (CONFIRM)',
    family: 'content',
    scope: 'content',
    risk: 'R2',
    shipped: true,
    reversible: true,
    undoTool: 'content.restore',
    argsSchema: IdArgSchema,
  },
  {
    tool: 'content.unpublish',
    label: 'Move content back to draft',
    family: 'content',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'content.restore',
    argsSchema: IdArgSchema,
  },
  {
    tool: 'blocks.replace',
    label: 'Replace single Gutenberg block',
    family: 'blocks',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'content.restore',
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        index: z.number().int().min(0).max(500),
        html: z.string().min(1).max(100_000),
      })
      .strict(),
  },
  {
    tool: 'terms.create',
    label: 'Create category or tag',
    family: 'terms',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        taxonomy: z.string().regex(/^[a-z0-9_-]{1,64}$/).optional(),
        name: z.string().min(1).max(120),
        slug: z.string().max(120).optional(),
        description: z.string().max(500).optional(),
      })
      .strict(),
  },
  {
    tool: 'terms.assign',
    label: 'Assign categories/tags to post',
    family: 'terms',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'terms.restore',
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        taxonomy: z.string().regex(/^[a-z0-9_-]{1,64}$/).optional(),
        terms: z.array(z.union([z.number().int().positive(), z.string().min(1).max(120)])).min(1).max(50),
        append: z.boolean().optional(),
      })
      .strict(),
  },
  {
    tool: 'terms.restore',
    label: 'Restore post terms snapshot',
    family: 'terms',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        taxonomy: z.string().regex(/^[a-z0-9_-]{1,64}$/),
        termIds: z.array(z.number().int().positive()).max(50),
      })
      .strict(),
  },
  {
    tool: 'settings.update',
    label: 'Update general/reading settings',
    family: 'settings',
    scope: 'site_ops',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'settings.restore',
    argsSchema: z
      .object({
        values: z.record(z.union([z.string(), z.number()])),
      })
      .strict(),
  },
  {
    tool: 'settings.restore',
    label: 'Restore settings snapshot',
    family: 'settings',
    scope: 'site_ops',
    risk: 'R1',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        before: z.object({ values: z.record(z.union([z.string(), z.number()])) }),
      })
      .passthrough(),
  },
  {
    tool: 'seo.meta.update',
    label: 'Update SEO title, description & social meta',
    family: 'seo',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'seo.meta.restore',
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        title: z.string().max(200).optional(),
        description: z.string().max(400).optional(),
        canonical: z.string().max(500).optional(),
        ogTitle: z.string().max(200).optional(),
        ogDescription: z.string().max(400).optional(),
        noindex: z.boolean().optional(),
      })
      .strict(),
  },
  {
    tool: 'seo.meta.restore',
    label: 'Restore SEO meta snapshot',
    family: 'seo',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        provider: z.enum(['yoast', 'rankmath', 'seopress', 'sitepilot']).optional(),
        meta: z.record(z.string()),
      })
      .strict(),
  },
  {
    tool: 'media.update',
    label: 'Update image alt text, title & caption',
    family: 'media',
    scope: 'media',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'media.restore',
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        alt: z.string().max(300).optional(),
        title: z.string().max(300).optional(),
        caption: z.string().max(1_000).optional(),
        description: z.string().max(4_000).optional(),
      })
      .strict(),
  },
  {
    tool: 'media.restore',
    label: 'Restore media metadata snapshot',
    family: 'media',
    scope: 'media',
    risk: 'R1',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        alt: z.string().max(300),
        title: z.string().max(300),
        caption: z.string().max(1_000),
        description: z.string().max(4_000),
      })
      .strict(),
  },
  {
    tool: 'media.set_featured',
    label: 'Set or clear post featured image',
    family: 'media',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'media.restore_featured',
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        mediaId: z.number().int().nonnegative(),
      })
      .strict(),
  },
  {
    tool: 'media.restore_featured',
    label: 'Restore featured image snapshot',
    family: 'media',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        id: z.number().int().positive(),
        mediaId: z.number().int().nonnegative(),
      })
      .strict(),
  },
  {
    tool: 'menus.save',
    label: 'Create or update navigation menu & locations',
    family: 'menus',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: true,
    undoTool: 'menus.restore',
    argsSchema: z
      .object({
        menuId: z.number().int().positive().optional(),
        name: z.string().min(1).max(120).optional(),
        items: z
          .array(
            z
              .object({
                title: z.string().min(1).max(120),
                url: z.string().min(1).max(500),
              })
              .strict()
          )
          .min(1)
          .max(50),
        locations: z.array(z.string().regex(/^[a-z0-9_-]{1,64}$/)).max(10).optional(),
        location: z.string().regex(/^[a-z0-9_-]{1,64}$/).optional(),
      })
      .strict(),
  },
  {
    tool: 'menus.restore',
    label: 'Restore navigation menu snapshot',
    family: 'menus',
    scope: 'content',
    risk: 'R1',
    shipped: true,
    reversible: false,
    argsSchema: z
      .object({
        menuId: z.number().int().positive(),
        items: z
          .array(
            z
              .object({
                title: z.string().min(1).max(120),
                url: z.string().min(1).max(500),
              })
              .strict()
          )
          .max(100),
        locations: z.record(z.number().int().nonnegative()).optional(),
      })
      .strict(),
  },

  // ── Honest V2 Roadmap Entries (Never presented as executable buttons) ────
  {
    tool: 'woo.products.update',
    label: 'Manage WooCommerce products',
    family: 'commerce',
    scope: 'commerce',
    risk: 'R2',
    shipped: false,
    reversible: true,
    requiresFeature: 'woocommerce',
    argsSchema: z.object({ id: z.number().int().positive() }).passthrough(),
  },
  {
    tool: 'files.write',
    label: 'Guarded theme/plugin file edits',
    family: 'files',
    scope: 'files',
    risk: 'R3',
    shipped: false,
    reversible: true,
    argsSchema: z.object({ path: z.string().min(1) }).passthrough(),
  },
] as const;

const SPEC_MAP = new Map<string, ToolSpec>(WP_TOOL_SPECS.map((spec) => [spec.tool, spec]));

export const SHIPPED_TOOL_SPECS: readonly ToolSpec[] = WP_TOOL_SPECS.filter((spec) => spec.shipped);

export const SHIPPED_TOOL_ALLOWLIST: ReadonlySet<string> = new Set(
  SHIPPED_TOOL_SPECS.map((spec) => spec.tool)
);

export const PLANNABLE_TOOLS: readonly string[] = Object.freeze(
  SHIPPED_TOOL_SPECS.filter(
    (spec) => !spec.tool.endsWith('.restore') && spec.tool !== 'media.restore_featured'
  ).map((spec) => spec.tool)
);

export const SHIPPED_TOOL_RISK_MAP: Readonly<Record<string, ToolRisk>> = Object.freeze(
  Object.fromEntries(SHIPPED_TOOL_SPECS.map((spec) => [spec.tool, spec.risk]))
);

export function lookupTool(toolName: string): ToolSpec | null {
  if (typeof toolName !== 'string' || !toolName) return null;
  return SPEC_MAP.get(toolName) ?? null;
}

export function isShippedTool(toolName: string): boolean {
  const spec = lookupTool(toolName);
  return Boolean(spec?.shipped);
}

export function validateToolArgs(
  toolName: string,
  args: unknown
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
  const spec = lookupTool(toolName);
  if (!spec || !spec.shipped) {
    return { ok: false, reason: `Tool "${toolName}" is not a shipped Connector tool.` };
  }
  const parsed = spec.argsSchema.safeParse(args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `Invalid arguments for "${toolName}"${issue ? ` (${issue.path.join('.') || 'root'}: ${issue.message})` : ''}.`,
    };
  }
  return { ok: true, data: parsed.data as Record<string, unknown> };
}

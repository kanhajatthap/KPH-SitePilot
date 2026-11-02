import type { Risk } from './connector/planner';

/**
 * Per-site capability graph & prompt suggester (E4-06 / E9-13).
 *
 * Non-negotiable rule from the master plan (§2.3):
 *   "No fake capability — jo tool site pe possible nahi, UI usko dead button ke
 *   roop me nahi dikhayega; honest reason ke saath label karega."
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

export type DisabledReason = 'scope_disabled' | 'plugin_missing' | 'coming_in_v2';

export interface ToolCapabilityEntry {
  tool: string;
  label: string;
  scope: SiteScope;
  risk: Risk;
  shipped: boolean;
  requiresFeature?: 'woocommerce' | 'seo_plugin';
  available: boolean;
  disabledReason: DisabledReason | null;
  explanation: string;
}

export interface SiteCapabilityGraph {
  hasManifest: boolean;
  themeName: string | null;
  isBlockTheme: boolean;
  hasWooCommerce: boolean;
  hasElementor: boolean;
  hasSeoPlugin: boolean;
  pluginCount: number;
  postTypeCount: number;
  enabledScopes: SiteScope[];
  availableCount: number;
  disabledByScopeCount: number;
  tools: ToolCapabilityEntry[];
}

interface CatalogItem {
  tool: string;
  label: string;
  scope: SiteScope;
  risk: Risk;
  shipped: boolean;
  requiresFeature?: 'woocommerce' | 'seo_plugin';
}

const TOOL_CATALOG: readonly CatalogItem[] = [
  // Shipped R0 reads
  { tool: 'site.info', label: 'Inspect site manifest', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'site.health', label: 'Check site health', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'site.search', label: 'Search posts, pages & media', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'content.list', label: 'List posts & pages', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'content.get', label: 'Read post/page content', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'blocks.parse', label: 'Parse Gutenberg block tree', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'theme.info', label: 'Read active theme info', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'terms.list', label: 'List categories & tags', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'menus.list', label: 'List navigation menus', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'settings.get', label: 'Read allowlisted settings', scope: 'read', risk: 'R0', shipped: true },
  { tool: 'media.list', label: 'Browse media library', scope: 'media', risk: 'R0', shipped: true },
  { tool: 'plugins.list', label: 'List installed plugins', scope: 'site_ops', risk: 'R0', shipped: true },
  { tool: 'users.list', label: 'List user roles (no emails)', scope: 'site_ops', risk: 'R0', shipped: true },

  // Shipped verified writes (with snapshot + undo)
  { tool: 'content.create', label: 'Create draft page/post', scope: 'content', risk: 'R1', shipped: true },
  { tool: 'content.update', label: 'Update post/page copy', scope: 'content', risk: 'R1', shipped: true },
  { tool: 'blocks.replace', label: 'Replace single Gutenberg block', scope: 'content', risk: 'R1', shipped: true },
  { tool: 'terms.create', label: 'Create category or tag', scope: 'content', risk: 'R1', shipped: true },
  { tool: 'terms.assign', label: 'Assign categories/tags to post', scope: 'content', risk: 'R1', shipped: true },
  { tool: 'terms.restore', label: 'Restore post terms snapshot', scope: 'content', risk: 'R1', shipped: true },
  { tool: 'content.publish', label: 'Publish post/page (CONFIRM)', scope: 'content', risk: 'R2', shipped: true },
  { tool: 'content.unpublish', label: 'Move content back to draft', scope: 'content', risk: 'R1', shipped: true },
  { tool: 'content.restore', label: 'Restore content snapshot', scope: 'content', risk: 'R1', shipped: true },
  { tool: 'settings.update', label: 'Update general/reading settings', scope: 'site_ops', risk: 'R1', shipped: true },
  { tool: 'settings.restore', label: 'Restore settings snapshot', scope: 'site_ops', risk: 'R1', shipped: true },

  // Honest V2 roadmap entries (never presented as clickable dead buttons)
  {
    tool: 'woo.products.update',
    label: 'Manage WooCommerce products',
    scope: 'commerce',
    risk: 'R2',
    shipped: false,
    requiresFeature: 'woocommerce',
  },
  {
    tool: 'seo.meta.update',
    label: 'Edit Yoast / Rank Math SEO meta',
    scope: 'content',
    risk: 'R1',
    shipped: false,
    requiresFeature: 'seo_plugin',
  },
  {
    tool: 'files.write',
    label: 'Guarded theme/plugin file edits',
    scope: 'files',
    risk: 'R3',
    shipped: false,
  },
] as const;

function normalizeScopes(scopes: readonly string[] | null | undefined): SiteScope[] {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return ['read'];
  }
  const set = new Set<SiteScope>(['read']);
  for (const s of scopes) {
    if ((ALL_SITE_SCOPES as readonly string[]).includes(s)) {
      set.add(s as SiteScope);
    }
  }
  return ALL_SITE_SCOPES.filter((s) => set.has(s));
}

function hasPluginSlug(plugins: unknown, needle: string): boolean {
  if (!Array.isArray(plugins)) return false;
  return plugins.some((entry) => {
    const slug = String((entry as { slug?: unknown } | null)?.slug ?? '').toLowerCase();
    return slug.includes(needle);
  });
}

export function evaluateSiteCapabilities(site: {
  scopes?: readonly string[] | null;
  capabilities?: Record<string, unknown> | null;
}): SiteCapabilityGraph {
  const enabledScopes = normalizeScopes(site.scopes);
  const scopeSet = new Set<SiteScope>(enabledScopes);
  const raw = site.capabilities ?? null;
  const hasManifest = Boolean(raw && Object.keys(raw).length > 0);

  const theme = (raw?.theme as { name?: string; type?: string; blockTheme?: boolean } | undefined) ?? undefined;
  const builders = (raw?.builders as Record<string, unknown> | undefined) ?? undefined;
  const plugins = raw?.plugins;
  const postTypes = Array.isArray(raw?.postTypes) ? raw.postTypes.length : 0;
  const pluginCount = Array.isArray(plugins) ? plugins.length : 0;

  const isBlockTheme = Boolean(
    theme?.type === 'block' || theme?.blockTheme === true || builders?.blockTheme === true
  );
  const hasWooCommerce = Boolean(builders?.woocommerce || hasPluginSlug(plugins, 'woocommerce'));
  const hasElementor = Boolean(builders?.elementor || hasPluginSlug(plugins, 'elementor'));
  const hasSeoPlugin = Boolean(
    builders?.yoast ||
      builders?.rankMath ||
      hasPluginSlug(plugins, 'wordpress-seo') ||
      hasPluginSlug(plugins, 'rank-math')
  );

  const tools: ToolCapabilityEntry[] = TOOL_CATALOG.map((item) => {
    if (item.requiresFeature === 'woocommerce' && hasManifest && !hasWooCommerce) {
      return {
        ...item,
        available: false,
        disabledReason: 'plugin_missing',
        explanation: 'WooCommerce is not active on this site.',
      };
    }

    if (item.requiresFeature === 'seo_plugin' && hasManifest && !hasSeoPlugin) {
      return {
        ...item,
        available: false,
        disabledReason: 'plugin_missing',
        explanation: 'No supported SEO plugin (Yoast or Rank Math) was detected.',
      };
    }

    if (!scopeSet.has(item.scope)) {
      return {
        ...item,
        available: false,
        disabledReason: 'scope_disabled',
        explanation: `Enable the "${item.scope}" scope on this site to allow ${item.tool}.`,
      };
    }

    if (!item.shipped) {
      return {
        ...item,
        available: false,
        disabledReason: 'coming_in_v2',
        explanation: 'Planned for V2 — shown honestly rather than as an inactive action.',
      };
    }

    return {
      ...item,
      available: true,
      disabledReason: null,
      explanation: `Ready (${item.risk}, ${item.scope} scope).`,
    };
  });

  return {
    hasManifest,
    themeName: typeof theme?.name === 'string' && theme.name.trim() ? theme.name.trim() : null,
    isBlockTheme,
    hasWooCommerce,
    hasElementor,
    hasSeoPlugin,
    pluginCount,
    postTypeCount: postTypes,
    enabledScopes,
    availableCount: tools.filter((t) => t.available).length,
    disabledByScopeCount: tools.filter((t) => t.disabledReason === 'scope_disabled').length,
    tools,
  };
}

/**
 * Generates concrete, site-aware example prompts that respect the site's active
 * scopes so a user never clicks a suggestion the site will immediately reject.
 */
export function suggestPromptsForSite(site: {
  name?: string;
  scopes?: readonly string[] | null;
  capabilities?: Record<string, unknown> | null;
}): string[] {
  const graph = evaluateSiteCapabilities(site);
  const scopeSet = new Set(graph.enabledScopes);
  const prompts: string[] = [];

  if (scopeSet.has('content')) {
    prompts.push('Change the title of post #12 to "Built for teams that ship"');
    prompts.push('Create a draft page called "Pricing" with our starter and growth tiers');
    if (graph.isBlockTheme) {
      prompts.push('Replace the content of page #8 with "<!-- wp:heading --><h2>Our story</h2><!-- /wp:heading -->"');
    } else {
      prompts.push('Replace the content of page #8 with "Welcome to our updated service catalog."');
    }
  }

  if (scopeSet.has('site_ops')) {
    const cleanName = (site.name ?? '').trim();
    const exampleTitle = cleanName && cleanName.length <= 40 ? `${cleanName} — Official Site` : 'KPH Studio';
    prompts.push(`Change site tagline to "Fast, reliable WordPress operations"`);
    prompts.push(`Change site title to "${exampleTitle}"`);
  }

  if (prompts.length === 0) {
    // Read-only site: suggest inspection prompts instead of write prompts that would fail scope checks.
    prompts.push('Check site health and report WordPress & PHP versions');
    prompts.push('List the 10 most recently modified posts and pages');
    prompts.push('Read the current site settings and active theme details');
  }

  return prompts.slice(0, 5);
}

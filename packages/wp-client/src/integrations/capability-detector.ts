import { HttpTransport } from '../index.js';

export interface SiteCapabilities {
  gutenberg: boolean;
  elementor: boolean;
  acf: boolean;
  woocommerce: boolean;
  theme: {
    name: string;
    isBlockTheme: boolean;
    version?: string;
  };
  supportedNamespaces: string[];
}

/**
 * Detects active builder ecosystems and features supported by the connected WordPress site.
 */
export async function detectSiteCapabilities(
  siteUrl: URL,
  transport: HttpTransport
): Promise<SiteCapabilities> {
  const indexUrl = new URL('/wp-json/', siteUrl).toString();

  let data: { namespaces?: string[]; name?: string; description?: string } = {};
  try {
    const res = await transport(indexUrl, { method: 'GET' });
    if (res.ok) {
      data = (await res.json()) as { namespaces?: string[]; name?: string; description?: string };
    }
  } catch {
    // If offline, return zero capabilities safely
  }

  const namespaces = Array.isArray(data.namespaces) ? data.namespaces : [];

  const hasGutenberg = namespaces.some(
    (ns) => ns === 'wp/v2' || ns.includes('blocks')
  );
  const hasElementor = namespaces.some(
    (ns) => ns.includes('elementor') || ns === 'elementor/v1'
  );
  const hasAcf = namespaces.some(
    (ns) => ns.includes('acf') || ns === 'acf/v3' || ns === 'acf/v2'
  );
  const hasWooCommerce = namespaces.some(
    (ns) => ns.includes('wc') || ns === 'wc/v3' || ns === 'wc/v2'
  );

  // Probe theme capabilities
  let themeName = 'Default Theme';
  let isBlockTheme = false;

  try {
    const themeRes = await transport(
      new URL('/wp-json/wp/v2/themes?status=active', siteUrl).toString(),
      { method: 'GET' }
    );
    if (themeRes.ok) {
      const themes = (await themeRes.json()) as Array<{
        name?: { rendered?: string };
        stylesheet?: string;
        is_block_theme?: boolean;
        theme_supports?: Record<string, unknown>;
      }>;
      const activeTheme = Array.isArray(themes) ? themes[0] : themes;
      if (activeTheme) {
        themeName = activeTheme.name?.rendered || (activeTheme.theme_supports?.title_tag ? activeTheme.stylesheet : 'Active Theme') || 'Active Theme';
        isBlockTheme = !!(activeTheme.is_block_theme || activeTheme.theme_supports?.['block-templates']);
      }
    }
  } catch {
    // Graceful fallback
  }

  return {
    gutenberg: hasGutenberg,
    elementor: hasElementor,
    acf: hasAcf,
    woocommerce: hasWooCommerce,
    theme: {
      name: themeName,
      isBlockTheme,
    },
    supportedNamespaces: namespaces,
  };
}

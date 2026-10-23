export interface ThemeManifest {
  name: string;
  version?: string;
  author?: string;
  isBlockTheme: boolean;
  themeJsonSupported: boolean;
  colorPalette?: Array<{ slug: string; color: string; name: string }>;
  fontFamilies?: Array<{ slug: string; fontFamily: string; name: string }>;
}

/**
 * Parses theme metadata and theme.json settings safely.
 */
export function parseThemeManifest(
  themeData: {
    name?: { rendered?: string };
    stylesheet?: string;
    version?: string;
    is_block_theme?: boolean;
    theme_supports?: Record<string, unknown>;
  },
  themeJsonRaw?: {
    version?: number;
    settings?: {
      color?: { palette?: Array<{ slug: string; color: string; name: string }> };
      typography?: { fontFamilies?: Array<{ slug: string; fontFamily: string; name: string }> };
    };
  }
): ThemeManifest {
  const isBlockTheme = !!(
    themeData.is_block_theme ||
    themeData.theme_supports?.['block-templates']
  );

  const palette = themeJsonRaw?.settings?.color?.palette || [];
  const fontFamilies = themeJsonRaw?.settings?.typography?.fontFamilies || [];

  return {
    name: themeData.name?.rendered || themeData.stylesheet || 'Active Theme',
    version: themeData.version,
    isBlockTheme,
    themeJsonSupported: !!themeJsonRaw?.version,
    colorPalette: palette.length > 0 ? palette : undefined,
    fontFamilies: fontFamilies.length > 0 ? fontFamilies : undefined,
  };
}

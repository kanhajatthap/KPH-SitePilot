/**
 * Design tokens for wp-agent design system.
 * WordPress‑native colour palette, spacing scale, radius and shadows.
 * All values are static constants – swap via `createTheme()` if ever needed.
 */

export const colors = {
  // Brand – WordPress blue (#0073AA) family
  primary: '#0073AA',
  primaryHover: '#005177',
  primaryActive: '#003950',
  primaryFocusRing: 'rgba(0, 115, 170, 0.25)',

  // Neutrals – mirrors WP Admin background / surface scale
  background: '#f6f7f7',
  backgroundAlt: '#f0f0f0',
  surface: '#ffffff',
  surfaceAlt: '#fafafa',

  // Text
  text: '#1d2327',
  textMuted: '#646970',
  textOnPrimary: '#ffffff',

  // Borders & lines
  border: '#dcdcde',
  borderStrong: '#c3c4c7',

  // Feedback
  success: '#46b450',
  successBg: '#edf7ed',
  warning: '#ffb900',
  warningBg: '#fff8e5',
  error: '#dc3232',
  errorBg: '#fcf0ef',
  info: '#2271b1',
  infoBg: '#f0f6fb',

  // Overlay / scrim
  scrim: 'rgba(0, 0, 0, 0.5)',

  // Visual Build Surface & Canvas Selection Tokens
  selectionOutline: '#f43f5e', // brand-500 pink
  selectionRing: 'rgba(244, 63, 94, 0.25)',
  selectionBg: 'rgba(244, 63, 94, 0.05)',
  selectionBorder: '#fecdd3', // pink-200
  hoverOutline: 'rgba(251, 113, 133, 0.6)',
  focusRing: 'rgba(244, 63, 94, 0.35)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const typography = {
  fontFamily: {
    sans: 'Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
    mono: 'Cascadia Code, SFMono-Regular, Consolas, Liberation Mono, monospace',
  },
  fontSize: {
    xs: '10px',
    sm: '11px',
    base: '13px',
    md: '14px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
  },
  lineHeight: {
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
  },
} as const;

export const radius = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  pill: 9999,
} as const;

export const viewports = {
  desktop: {
    id: 'desktop',
    name: 'Desktop',
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    borderRadius: '0px',
    border: 'none',
    boxShadow: 'none',
  },
  tablet: {
    id: 'tablet',
    name: 'Tablet (iPad / 768px)',
    width: '768px',
    maxWidth: '100%',
    height: '100%',
    borderRadius: '18px',
    border: '1px solid #d9d2c7',
    boxShadow: '0 1px 2px rgba(27,25,23,.05), 0 30px 60px -35px rgba(27,25,23,.45)',
  },
  mobile: {
    id: 'mobile',
    name: 'Mobile (iPhone / 390px)',
    width: '390px',
    maxWidth: '100%',
    height: '100%',
    borderRadius: '28px',
    border: '1px solid #d9d2c7',
    boxShadow: '0 1px 2px rgba(27,25,23,.05), 0 30px 60px -35px rgba(27,25,23,.45)',
  },
} as const;

export type ViewportKey = keyof typeof viewports;
export type TypographyToken = typeof typography;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 8px rgba(0, 0, 0, 0.08)',
  lg: '0 12px 24px rgba(0, 0, 0, 0.12)',
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
export type ShadowToken = keyof typeof shadows;

export interface DesignTokens {
  colors: typeof colors;
  spacing: typeof spacing;
  typography: typeof typography;
  radius: typeof radius;
  shadows: typeof shadows;
  viewports: typeof viewports;
}

export const designTokens: DesignTokens = {
  colors,
  spacing,
  typography,
  radius,
  shadows,
  viewports,
};

export function createTheme(overrides?: Partial<DesignTokens>): DesignTokens {
  return {
    colors: { ...colors, ...overrides?.colors },
    spacing: { ...spacing, ...overrides?.spacing },
    typography: { ...typography, ...overrides?.typography },
    radius: { ...radius, ...overrides?.radius },
    shadows: { ...shadows, ...overrides?.shadows },
    viewports: { ...viewports, ...overrides?.viewports },
  };
}

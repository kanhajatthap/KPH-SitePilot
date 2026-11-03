/**
 * Single source of truth for the dashboard's design tokens (E9-17) and the
 * pure rules that drive the mobile workspace layout (E9-16).
 *
 * The colour hex values here are mirrored in `src/app/globals.css` and
 * `tailwind.config.js`; `tests/design-and-mobile.test.ts` asserts all three
 * stay in sync so a contrast fix cannot silently drift. No DOM, no network,
 * no React — everything in this module is trivially unit-testable.
 */

export const DESIGN_TOKENS = {
  colors: {
    paper: '#faf9f6',
    paperDeep: '#f3f0ea',
    card: '#ffffff',
    ink: '#1b1917',
    inkSoft: '#44403c',
    /** E9-17: was #7c756c (4.32:1 on paper, 4.00:1 on paper-deep → AA fail). */
    inkMuted: '#6b645b',
    line: '#e8e3da',
    lineStrong: '#d9d2c7',
    brand1: '#ff8a5b',
    brand2: '#ff4d8d',
    brand3: '#a855f7',
    /** Darkened from #16a34a / #d97706 / #e11d48 to clear AA on paper. */
    ok: '#15803d',
    warn: '#b45309',
    danger: '#be123c',
  },
  /** Smallest allowed size for secondary text on touch screens. */
  type: {
    micro: '0.75rem', // 12px
    xs: '0.8125rem', // 13px
    sm: '0.875rem', // 14px
    base: '1rem', // 16px
    lg: '1.125rem', // 18px
    xl: '1.25rem', // 20px
    xxl: '1.5rem', // 24px
    xxxl: '1.875rem', // 30px
  },
  spacing: { 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem', 6: '1.5rem', 8: '2rem' },
  radius: { card: '1rem', control: '0.75rem' },
  focus: { width: '2px', offset: '2px' },
} as const;

/** WCAG 2.1 AA for normal text. Large text (≥18.66px bold / 24px) needs 3:1. */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const TOUCH_TARGET_MIN_PX = 44;
/** Matches Tailwind's `md` breakpoint, where the two-pane layout returns. */
export const MOBILE_BREAKPOINT_PX = 768;

export type HexColor = `#${string}`;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Accepts #rgb or #rrggbb; throws on anything else so bad tokens fail loudly. */
export function parseHexColor(hex: string): Rgb {
  const value = hex.trim();
  let channels: string[];
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    channels = [value[1], value[2], value[3]].map((c) => c + c);
  } else if (/^#[0-9a-f]{6}$/i.test(value)) {
    channels = [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)];
  } else {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const [r, g, b] = channels.map((channel) => parseInt(channel, 16));
  return { r, g, b };
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  const linear = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** Symmetric contrast ratio in the range 1 … 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsContrastAA(ratio: number, largeText = false): boolean {
  return Number.isFinite(ratio) && ratio >= (largeText ? AA_LARGE_TEXT : AA_NORMAL_TEXT);
}

export interface ContrastPair {
  label: string;
  foreground: string;
  background: string;
}

/** Semantic foreground/background pairs actually used by the UI. */
export const TEXT_CONTRAST_PAIRS: readonly ContrastPair[] = [
  { label: 'body text on paper', foreground: DESIGN_TOKENS.colors.ink, background: DESIGN_TOKENS.colors.paper },
  { label: 'body text on card', foreground: DESIGN_TOKENS.colors.ink, background: DESIGN_TOKENS.colors.card },
  { label: 'body text on paper-deep', foreground: DESIGN_TOKENS.colors.ink, background: DESIGN_TOKENS.colors.paperDeep },
  { label: 'secondary text on paper', foreground: DESIGN_TOKENS.colors.inkSoft, background: DESIGN_TOKENS.colors.paper },
  { label: 'secondary text on card', foreground: DESIGN_TOKENS.colors.inkSoft, background: DESIGN_TOKENS.colors.card },
  { label: 'muted label on paper', foreground: DESIGN_TOKENS.colors.inkMuted, background: DESIGN_TOKENS.colors.paper },
  { label: 'muted label on card', foreground: DESIGN_TOKENS.colors.inkMuted, background: DESIGN_TOKENS.colors.card },
  { label: 'muted label on paper-deep', foreground: DESIGN_TOKENS.colors.inkMuted, background: DESIGN_TOKENS.colors.paperDeep },
  { label: 'success text on card', foreground: DESIGN_TOKENS.colors.ok, background: DESIGN_TOKENS.colors.card },
  { label: 'success text on paper', foreground: DESIGN_TOKENS.colors.ok, background: DESIGN_TOKENS.colors.paper },
  { label: 'warning text on card', foreground: DESIGN_TOKENS.colors.warn, background: DESIGN_TOKENS.colors.card },
  { label: 'warning text on paper', foreground: DESIGN_TOKENS.colors.warn, background: DESIGN_TOKENS.colors.paper },
  { label: 'danger text on card', foreground: DESIGN_TOKENS.colors.danger, background: DESIGN_TOKENS.colors.card },
  { label: 'danger text on paper', foreground: DESIGN_TOKENS.colors.danger, background: DESIGN_TOKENS.colors.paper },
  { label: 'danger text on paper-deep', foreground: DESIGN_TOKENS.colors.danger, background: DESIGN_TOKENS.colors.paperDeep },
];

export interface ContrastResult extends ContrastPair {
  ratio: number;
  threshold: number;
  pass: boolean;
}

export function auditTextContrast(
  pairs: readonly ContrastPair[] = TEXT_CONTRAST_PAIRS,
  largeText = false
): ContrastResult[] {
  const threshold = largeText ? AA_LARGE_TEXT : AA_NORMAL_TEXT;
  return pairs.map((pair) => {
    const ratio = contrastRatio(pair.foreground, pair.background);
    return { ...pair, ratio, threshold, pass: meetsContrastAA(ratio, largeText) };
  });
}

/** Type scale is declared in rem; this parses it for monotonicity checks. */
export function typeScalePx(): Array<{ name: string; px: number }> {
  return Object.entries(DESIGN_TOKENS.type).map(([name, value]) => ({
    name,
    px: parseFloat(value) * 16,
  }));
}

// ── Mobile workspace layout (E9-16) ──────────────────────────────────────────

export type MobilePane = 'chat' | 'canvas';

export const DEFAULT_MOBILE_PANE: MobilePane = 'chat';

export interface MobileTab {
  id: MobilePane;
  label: string;
  panelId: string;
  tabId: string;
  icon: string;
}

export const MOBILE_TABS: readonly MobileTab[] = [
  {
    id: 'chat',
    label: 'Chat',
    panelId: 'workspace-chat-panel',
    tabId: 'workspace-tab-chat',
    icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  },
  {
    id: 'canvas',
    label: 'Canvas',
    panelId: 'workspace-canvas-panel',
    tabId: 'workspace-tab-canvas',
    icon: 'M4 5h16v14H4z M4 9h16',
  },
];

export function isMobileViewport(width: number, breakpoint = MOBILE_BREAKPOINT_PX): boolean {
  return Number.isFinite(width) && width > 0 && width < breakpoint;
}

export function nextMobilePane(current: MobilePane): MobilePane {
  return current === 'chat' ? 'canvas' : 'chat';
}

/**
 * On a phone only the active pane is shown (chat-first). At `md` and above the
 * desktop split shows both panes regardless of the tab state, so a resize never
 * leaves the canvas hidden.
 */
export function paneVisibility(pane: MobilePane, active: MobilePane, width: number): boolean {
  return !isMobileViewport(width) || pane === active;
}

/** Reset to chat-first when the viewport grows back to the two-pane layout. */
export function resolveMobilePane(requested: MobilePane, width: number): MobilePane {
  return isMobileViewport(width) ? requested : DEFAULT_MOBILE_PANE;
}

export function touchTargetMeetsMinimum(px: number): boolean {
  return Number.isFinite(px) && px >= TOUCH_TARGET_MIN_PX;
}

/** Keyboard contract for a two-tab widget: arrow keys move between tabs. */
export function tabIndexForKey(key: string, currentIndex: number, count: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

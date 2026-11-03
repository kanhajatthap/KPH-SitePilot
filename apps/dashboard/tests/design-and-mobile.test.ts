import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  DEFAULT_MOBILE_PANE,
  DESIGN_TOKENS,
  MOBILE_BREAKPOINT_PX,
  MOBILE_TABS,
  TEXT_CONTRAST_PAIRS,
  TOUCH_TARGET_MIN_PX,
  auditTextContrast,
  contrastRatio,
  isMobileViewport,
  meetsContrastAA,
  nextMobilePane,
  paneVisibility,
  parseHexColor,
  relativeLuminance,
  resolveMobilePane,
  tabIndexForKey,
  touchTargetMeetsMinimum,
  typeScalePx,
} from '../src/lib/design-tokens';

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const globalsCss = read('src/app/globals.css');
const tailwindConfig = read('tailwind.config.js');
const layout = read('src/app/layout.tsx');
const workspace = read('src/app/WorkspaceClient.tsx');
const chatPanel = read('src/components/ChatPanel.tsx');
const previewCanvas = read('src/components/PreviewCanvas.tsx');
const composer = read('src/components/Composer.tsx');
const mobileTabs = read('src/components/WorkspaceMobileTabs.tsx');
const header = read('src/components/Header.tsx');

const CSS_VARS: Record<string, string> = {
  paper: '--paper',
  paperDeep: '--paper-deep',
  card: '--card',
  ink: '--ink',
  inkSoft: '--ink-soft',
  inkMuted: '--muted',
  line: '--line',
  lineStrong: '--line-strong',
  brand1: '--brand-1',
  brand2: '--brand-2',
  brand3: '--brand-3',
  ok: '--ok',
  warn: '--warn',
  danger: '--danger',
};

describe('E9-17 design tokens stay in one source of truth', () => {
  it('mirrors every colour token in globals.css', () => {
    const colors = DESIGN_TOKENS.colors as unknown as Record<string, string>;
    for (const [key, cssVar] of Object.entries(CSS_VARS)) {
      expect(globalsCss, cssVar).toContain(`${cssVar}: ${colors[key]};`);
    }
  });

  it('keeps tailwind.config.js on the AA-compliant muted ink', () => {
    expect(tailwindConfig).toContain("muted: '#6b645b'");
    expect(tailwindConfig).not.toContain("muted: '#7c756c'");
    expect(globalsCss).not.toContain('#7c756c;');
  });

  it('mirrors the full type scale as CSS custom properties', () => {
    const cssNames: Record<string, string> = {
      micro: '--text-micro',
      xs: '--text-xs',
      sm: '--text-sm',
      base: '--text-base',
      lg: '--text-lg',
      xl: '--text-xl',
      xxl: '--text-2xl',
      xxxl: '--text-3xl',
    };
    for (const [key, cssVar] of Object.entries(cssNames)) {
      expect(globalsCss, cssVar).toContain(`${cssVar}: ${DESIGN_TOKENS.type[key as keyof typeof DESIGN_TOKENS.type]};`);
    }
  });

  it('declares spacing, radius, focus and touch tokens', () => {
    expect(globalsCss).toContain('--focus-ring-color: var(--danger);');
    expect(globalsCss).toContain('--focus-ring-width: 2px;');
    expect(globalsCss).toContain('--focus-ring-offset: 2px;');
    expect(globalsCss).toContain('--touch-min: 44px;');
    expect(globalsCss).toContain('--radius-card: 1rem;');
    expect(globalsCss).toContain('--space-4: 1rem;');
    expect(DESIGN_TOKENS.focus.width).toBe('2px');
    expect(DESIGN_TOKENS.radius.card).toBe('1rem');
  });

  it('exposes a 44px touch token in Tailwind too', () => {
    expect(tailwindConfig).toContain("touch: '44px'");
    expect(tailwindConfig).toContain('minHeight:');
    expect(tailwindConfig).toContain('minWidth:');
  });

  it('has a strictly increasing type scale with a 12px floor', () => {
    const scale = typeScalePx();
    expect(scale[0].name).toBe('micro');
    expect(scale[0].px).toBe(12);
    expect(scale.find((step) => step.name === 'base')?.px).toBe(16);
    for (let i = 1; i < scale.length; i += 1) {
      expect(scale[i].px, `${scale[i].name} > ${scale[i - 1].name}`).toBeGreaterThan(scale[i - 1].px);
    }
  });
});

describe('E9-17 WCAG contrast audit', () => {
  it('parses short and long hex colours and rejects bad input', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor('#1b1917')).toEqual({ r: 27, g: 25, b: 23 });
    expect(() => parseHexColor('1b1917')).toThrow(/Invalid hex color/);
    expect(() => parseHexColor('#12345')).toThrow(/Invalid hex color/);
  });

  it('computes WCAG relative luminance at the two extremes', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
  });

  it('computes symmetric contrast ratios in the 1…21 range', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
    expect(contrastRatio('#6b645b', '#6b645b')).toBeCloseTo(1, 6);
  });

  it('applies the AA thresholds correctly', () => {
    expect(AA_NORMAL_TEXT).toBe(4.5);
    expect(AA_LARGE_TEXT).toBe(3);
    expect(meetsContrastAA(4.5)).toBe(true);
    expect(meetsContrastAA(4.49)).toBe(false);
    expect(meetsContrastAA(3.2, false)).toBe(false);
    expect(meetsContrastAA(3.2, true)).toBe(true);
    expect(meetsContrastAA(Number.NaN)).toBe(false);
    expect(meetsContrastAA(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('passes AA for every semantic text pair used in the UI', () => {
    const results = auditTextContrast();
    expect(results.length).toBe(TEXT_CONTRAST_PAIRS.length);
    expect(results.length).toBeGreaterThanOrEqual(15);
    for (const result of results) {
      expect(result.pass, `${result.label}: ${result.ratio.toFixed(2)}:1`).toBe(true);
    }
    expect(Math.min(...results.map((result) => result.ratio))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('proves the old muted ink would have failed AA (regression guard)', () => {
    expect(contrastRatio('#7c756c', DESIGN_TOKENS.colors.paper)).toBeLessThan(AA_NORMAL_TEXT);
    expect(contrastRatio('#7c756c', DESIGN_TOKENS.colors.paperDeep)).toBeLessThan(AA_NORMAL_TEXT);
    expect(contrastRatio(DESIGN_TOKENS.colors.inkMuted, DESIGN_TOKENS.colors.paperDeep)).toBeGreaterThan(
      AA_NORMAL_TEXT
    );
  });

  it('darkened the status colours so they clear AA on paper too', () => {
    for (const color of [DESIGN_TOKENS.colors.ok, DESIGN_TOKENS.colors.warn, DESIGN_TOKENS.colors.danger]) {
      expect(contrastRatio(color, DESIGN_TOKENS.colors.paper)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('can audit a custom pair list and large-text mode', () => {
    const custom = [
      { label: 'grey', foreground: '#777777', background: '#ffffff' },
    ];
    expect(auditTextContrast(custom)[0].pass).toBe(false);
    expect(auditTextContrast(custom, true)[0].threshold).toBe(AA_LARGE_TEXT);
    expect(auditTextContrast([])).toEqual([]);
  });

  it('provides a global visible focus fallback and respects reduced motion', () => {
    expect(globalsCss).toContain(':focus-visible {');
    expect(globalsCss).toContain('outline: var(--focus-ring-width) solid var(--focus-ring-color);');
    expect(globalsCss).toContain('.focus-ring {');
    expect(globalsCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('E9-16 mobile layout rules', () => {
  it('detects the phone breakpoint without trusting bad input', () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(768);
    expect(isMobileViewport(360)).toBe(true);
    expect(isMobileViewport(767)).toBe(true);
    expect(isMobileViewport(768)).toBe(false);
    expect(isMobileViewport(1024)).toBe(false);
    expect(isMobileViewport(0)).toBe(false);
    expect(isMobileViewport(Number.NaN)).toBe(false);
    expect(isMobileViewport(500, 600)).toBe(true);
    expect(isMobileViewport(700, 600)).toBe(false);
  });

  it('is chat-first and shows both panes on desktop', () => {
    expect(DEFAULT_MOBILE_PANE).toBe('chat');
    expect(paneVisibility('chat', 'chat', 375)).toBe(true);
    expect(paneVisibility('canvas', 'chat', 375)).toBe(false);
    expect(paneVisibility('chat', 'canvas', 375)).toBe(false);
    expect(paneVisibility('canvas', 'canvas', 375)).toBe(true);
    expect(paneVisibility('chat', 'canvas', 1280)).toBe(true);
    expect(paneVisibility('canvas', 'canvas', 1280)).toBe(true);
  });

  it('toggles panes and resets to chat when the viewport grows', () => {
    expect(nextMobilePane('chat')).toBe('canvas');
    expect(nextMobilePane('canvas')).toBe('chat');
    expect(resolveMobilePane('canvas', 375)).toBe('canvas');
    expect(resolveMobilePane('canvas', 1024)).toBe('chat');
  });

  it('declares two unique tabs with matching panel ids', () => {
    expect(MOBILE_TABS.map((tab) => tab.id)).toEqual(['chat', 'canvas']);
    expect(MOBILE_TABS.map((tab) => tab.label)).toEqual(['Chat', 'Canvas']);
    expect(new Set(MOBILE_TABS.map((tab) => tab.panelId)).size).toBe(2);
    expect(new Set(MOBILE_TABS.map((tab) => tab.tabId)).size).toBe(2);
    expect(chatPanel).toContain(`id="${MOBILE_TABS[0].panelId}"`);
    expect(previewCanvas).toContain(`id="${MOBILE_TABS[1].panelId}"`);
  });

  it('enforces a 44px minimum touch target', () => {
    expect(TOUCH_TARGET_MIN_PX).toBe(44);
    expect(touchTargetMeetsMinimum(44)).toBe(true);
    expect(touchTargetMeetsMinimum(32)).toBe(false);
    expect(touchTargetMeetsMinimum(Number.NaN)).toBe(false);
  });

  it('supports arrow, Home and End keys for the tablist', () => {
    expect(tabIndexForKey('ArrowRight', 0, 2)).toBe(1);
    expect(tabIndexForKey('ArrowRight', 1, 2)).toBe(0);
    expect(tabIndexForKey('ArrowLeft', 0, 2)).toBe(1);
    expect(tabIndexForKey('ArrowDown', 0, 2)).toBe(1);
    expect(tabIndexForKey('ArrowUp', 0, 2)).toBe(1);
    expect(tabIndexForKey('Home', 1, 2)).toBe(0);
    expect(tabIndexForKey('End', 0, 2)).toBe(1);
    expect(tabIndexForKey('Enter', 0, 2)).toBeNull();
  });
});

describe('E9-16 wiring in the workspace', () => {
  it('renders the phone tab bar and passes pane visibility to both panes', () => {
    expect(workspace).toContain('<WorkspaceMobileTabs active={mobilePane} onChange={setMobilePane} />');
    expect(workspace).toContain("mobileVisible={mobilePane === 'chat'}");
    expect(workspace).toContain("mobileVisible={mobilePane === 'canvas'}");
    expect(workspace).toContain('data-mobile-readable="true"');
    expect(workspace).toContain('data-session-watch="true"');
  });

  it('always restores the two-pane split at md and above', () => {
    expect(chatPanel).toContain('md:flex');
    expect(previewCanvas).toContain('md:flex');
    expect(chatPanel).toContain("mobileVisible ? 'flex' : 'hidden'");
    expect(previewCanvas).toContain("mobileVisible ? 'flex' : 'hidden'");
  });

  it('keeps the composer sticky with safe-area padding and large touch targets', () => {
    expect(composer).toContain('className="composer-dock pb-safe shrink-0 border-t border-line"');
    expect(globalsCss).toContain('.composer-dock {');
    expect(globalsCss).toContain('env(safe-area-inset-bottom, 0px)');
    expect(composer).toContain('h-11 w-11');
    expect(composer).toContain('min-h-touch');
    expect(header).toContain('min-h-touch');
  });

  it('declares a viewport that enables safe-area insets', () => {
    expect(layout).toContain("viewportFit: 'cover'");
    expect(layout).toContain("themeColor: '#faf9f6'");
    expect(layout).toContain('export const viewport: Viewport');
  });

  it('exposes safe-area, touch and readability utilities', () => {
    for (const utility of ['.pb-safe', '.pt-safe', '.px-safe', '.min-touch', '.text-micro']) {
      expect(globalsCss, utility).toContain(utility);
    }
    expect(globalsCss).toContain("[data-mobile-readable='true']");
    expect(globalsCss).toContain('@media (max-width: 767px)');
  });

  it('implements the tablist with ARIA state and keyboard handling', () => {
    expect(mobileTabs).toContain('role="tablist"');
    expect(mobileTabs).toContain('aria-selected={selected}');
    expect(mobileTabs).toContain('aria-controls={tab.panelId}');
    expect(mobileTabs).toContain('tabIndexForKey(');
    expect(mobileTabs).toContain('min-touch');
    expect(mobileTabs).toContain('md:hidden');
  });
});

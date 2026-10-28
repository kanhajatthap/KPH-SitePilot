import { describe, it, expect } from 'vitest';
import {
  colors,
  spacing,
  typography,
  radius,
  shadows,
  viewports,
  designTokens,
  tokenToCssVars,
  tokensCss,
  iconSvg,
  type IconName,
} from '../src';

describe('design-system tokens', () => {
  it('exports all token categories', () => {
    expect(colors).toBeDefined();
    expect(spacing).toBeDefined();
    expect(typography).toBeDefined();
    expect(radius).toBeDefined();
    expect(shadows).toBeDefined();
    expect(viewports).toBeDefined();
  });

  it('has expected visual build surface tokens', () => {
    expect(colors.selectionOutline).toBe('#f43f5e');
    expect(colors.selectionRing).toBe('rgba(244, 63, 94, 0.25)');
    expect(colors.selectionBg).toBe('rgba(244, 63, 94, 0.05)');
    expect(colors.selectionBorder).toBe('#fecdd3');
    expect(colors.hoverOutline).toBe('rgba(251, 113, 133, 0.6)');
    expect(colors.focusRing).toBe('rgba(244, 63, 94, 0.35)');
  });

  it('has responsive viewport layout configurations', () => {
    expect(viewports.desktop.width).toBe('100%');
    expect(viewports.tablet.width).toBe('768px');
    expect(viewports.tablet.borderRadius).toBe('18px');
    expect(viewports.mobile.width).toBe('390px');
    expect(viewports.mobile.borderRadius).toBe('28px');
  });

  it('has expected color keys', () => {
    expect(colors.primary).toBe('#0073AA');
    expect(colors.success).toBe('#46b450');
    expect(colors.error).toBe('#dc3232');
    expect(colors.background).toBe('#f6f7f7');
    expect(colors.text).toBe('#1d2327');
  });

  it('has expected spacing scale', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
    expect(spacing.xl).toBe(32);
  });

  it('has expected radius values', () => {
    expect(radius.sm).toBe(4);
    expect(radius.md).toBe(6);
    expect(radius.lg).toBe(8);
    expect(radius.pill).toBe(9999);
  });

  it('has expected shadow values', () => {
    expect(shadows.sm).toContain('rgba(0, 0, 0, 0.05)');
    expect(shadows.md).toContain('rgba(0, 0, 0, 0.08)');
  });

  it('exports complete designTokens object', () => {
    expect(designTokens.colors).toBe(colors);
    expect(designTokens.spacing).toBe(spacing);
    expect(designTokens.radius).toBe(radius);
    expect(designTokens.shadows).toBe(shadows);
  });

  it('tokenToCssVars returns namespaced CSS custom properties', () => {
    const vars = tokenToCssVars(designTokens);
    // Spacing tokens should be prefixed
    expect(vars['spacing-md']).toBe('16');
    expect(vars['spacing-xs']).toBe('4');
    // Radius tokens should be prefixed
    expect(vars['radius-md']).toBe('6');
    // Shadow tokens should be prefixed
    expect(vars['shadow-md']).toContain('rgba(0, 0, 0, 0.08)');
    // Colors are NOT prefixed (for backward compatibility / direct use)
    expect(vars['primary']).toBe('#0073AA');
    expect(vars['success']).toBe('#46b450');
  });

  it('tokensCss generates valid CSS with all namespaced tokens', () => {
    const css = tokensCss(designTokens);
    expect(css).toContain(':root');
    expect(css).toContain('--primary: #0073AA;');
    expect(css).toContain('--spacing-md: 16;');
    expect(css).toContain('--radius-md: 6;');
    expect(css).toContain('--shadow-md:');
  });

  it('iconSvg returns valid SVG string', () => {
    const svg = iconSvg('check' as IconName, 24);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="24"');
    expect(svg).toContain('height="24"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('fill="currentColor"');
  });
});
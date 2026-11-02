import { describe, expect, it } from 'vitest';
import { ALL_SITE_SCOPES, evaluateSiteCapabilities, suggestPromptsForSite } from '../src/lib/capabilities';
import { CONNECTOR_TOOL_ALLOWLIST } from '../src/lib/connector/jobs';

describe('capability graph & prompt suggestions (E4-06 / E9-13)', () => {
  it('evaluates every shipped connector tool plus honest V2 roadmap items when all scopes are enabled', () => {
    const summary = evaluateSiteCapabilities({
      scopes: [...ALL_SITE_SCOPES],
      capabilities: {
        theme: { blockTheme: true },
        plugins: [{ slug: 'woocommerce' }, { slug: 'wordpress-seo' }],
        postTypes: [{ slug: 'post' }, { slug: 'page' }],
      },
    });

    expect(summary.hasManifest).toBe(true);
    expect(summary.isBlockTheme).toBe(true);
    expect(summary.hasWooCommerce).toBe(true);
    expect(summary.hasSeoPlugin).toBe(true);
    expect(summary.availableCount).toBe(CONNECTOR_TOOL_ALLOWLIST.size);
    expect(summary.disabledByScopeCount).toBe(0);

    // Every allowlisted shipped tool is marked available.
    for (const shippedTool of CONNECTOR_TOOL_ALLOWLIST) {
      const entry = summary.tools.find((t) => t.tool === shippedTool);
      expect(entry?.available).toBe(true);
    }

    // Unshipped V2 items are explicitly labeled coming_in_v2, never available.
    const v2 = summary.tools.find((t) => t.tool === 'woo.products.update');
    expect(v2?.available).toBe(false);
    expect(v2?.disabledReason).toBe('coming_in_v2');
  });

  it('marks write tools disabled when a site only grants read scope', () => {
    const summary = evaluateSiteCapabilities({
      scopes: ['read'],
      capabilities: { theme: { blockTheme: false } },
    });

    expect(summary.disabledByScopeCount).toBeGreaterThan(0);
    const settingsUpdate = summary.tools.find((tool) => tool.tool === 'settings.update');
    expect(settingsUpdate?.available).toBe(false);
    expect(settingsUpdate?.disabledReason).toBe('scope_disabled');
    expect(settingsUpdate?.explanation).toContain('site_ops');

    const settingsGet = summary.tools.find((tool) => tool.tool === 'settings.get');
    expect(settingsGet?.available).toBe(true);
  });

  it('adapts suggested Studio prompts to the site\'s enabled scopes', () => {
    const readOnlyPrompts = suggestPromptsForSite({ scopes: ['read'], capabilities: null });
    expect(readOnlyPrompts.every((p) => !p.startsWith('Change '))).toBe(true);

    const fullPrompts = suggestPromptsForSite({
      name: 'KPH Store',
      scopes: ['read', 'content', 'site_ops'],
      capabilities: { theme: { blockTheme: true } },
    });
    expect(fullPrompts.some((item) => item.includes('post #12'))).toBe(true);
    expect(fullPrompts.some((item) => item.includes('site tagline'))).toBe(true);
  });
});

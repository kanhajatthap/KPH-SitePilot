import { describe, expect, it } from 'vitest';
import {
  SHIPPED_TOOL_ALLOWLIST,
  SHIPPED_TOOL_RISK_MAP,
  SHIPPED_TOOL_SPECS,
  WP_TOOL_SPECS,
  evaluateRiskPolicy,
  hardenToolRisk,
  isShippedTool,
  lookupTool,
  validateToolArgs,
  verifyRiskConfirmation,
} from '../src/index.js';

describe('@wp-agent/wp-tools catalog (E3-01)', () => {
  it('registers all 34 shipped Connector v1.0.0 tools plus honest V2 entries', () => {
    expect(SHIPPED_TOOL_SPECS.length).toBe(34);
    expect(SHIPPED_TOOL_ALLOWLIST.size).toBe(34);
    expect(WP_TOOL_SPECS.length).toBe(36);

    expect(isShippedTool('seo.meta.update')).toBe(true);
    expect(isShippedTool('media.update')).toBe(true);
    expect(isShippedTool('menus.save')).toBe(true);
    expect(isShippedTool('site.logs')).toBe(true);

    // Unshipped V2 items are in the catalog for UI honesty, never in the shipped allowlist.
    expect(lookupTool('woo.products.update')?.shipped).toBe(false);
    expect(isShippedTool('woo.products.update')).toBe(false);
    expect(SHIPPED_TOOL_ALLOWLIST.has('woo.products.update')).toBe(false);
  });

  it('rejects unknown tools and validates per-tool argument schemas', () => {
    expect(lookupTool('code.eval')).toBeNull();
    expect(validateToolArgs('code.eval', {})).toEqual({
      ok: false,
      reason: 'Tool "code.eval" is not a shipped Connector tool.',
    });

    expect(validateToolArgs('seo.meta.update', { id: 12, title: 'Rank #1' }).ok).toBe(true);
    expect(validateToolArgs('seo.meta.update', { id: -5 }).ok).toBe(false);

    expect(
      validateToolArgs('menus.save', {
        name: 'Main Header',
        items: [{ title: 'Pricing', url: '/pricing' }],
        locations: ['primary'],
      }).ok
    ).toBe(true);

    expect(validateToolArgs('menus.save', { items: [] }).ok).toBe(false);
  });

  it('assigns every shipped tool an explicit risk floor', () => {
    for (const spec of SHIPPED_TOOL_SPECS) {
      expect(SHIPPED_TOOL_RISK_MAP[spec.tool]).toBe(spec.risk);
    }
  });
});

describe('risk policy engine (E3-03)', () => {
  it('floors risk at the tool minimum and never allows lowering', () => {
    expect(hardenToolRisk('content.publish', 'R0')).toBe('R2');
    expect(hardenToolRisk('content.update', 'R3')).toBe('R3');
    // Unknown tools default to R3 fail-closed.
    expect(hardenToolRisk('unknown.dangerous')).toBe('R3');
  });

  it('evaluates R0, R1, R2 and R3 plans with staging advice on production', () => {
    const r0 = evaluateRiskPolicy({ steps: [{ tool: 'site.health' }], environment: 'production' });
    expect(r0.overallRisk).toBe('R0');
    expect(r0.isWrite).toBe(false);
    expect(r0.confirmationKind).toBe('none');
    expect(r0.stagingAdvice).toBeNull();

    const r1 = evaluateRiskPolicy({ steps: [{ tool: 'seo.meta.update' }], environment: 'production' });
    expect(r1.overallRisk).toBe('R1');
    expect(r1.isWrite).toBe(true);
    expect(r1.requiresConfirmation).toBe(false);

    const r2 = evaluateRiskPolicy({ steps: [{ tool: 'content.publish' }], environment: 'production' });
    expect(r2.overallRisk).toBe('R2');
    expect(r2.isPublicFacing).toBe(true);
    expect(r2.confirmationKind).toBe('word');
    expect(r2.stagingAdvice).toContain('production');

    const r3 = evaluateRiskPolicy({ steps: [{ tool: 'files.write' }], environment: 'production' });
    expect(r3.overallRisk).toBe('R3');
    expect(r3.isDestructive).toBe(true);
    expect(r3.confirmationKind).toBe('plan-id');
    expect(r3.stagingAdvice).toContain('staging');
  });

  it('enforces non-interchangeable confirmation tokens between R2 and R3', () => {
    const planId = '3b1c9e66-3e4a-40f9-bbb7-3979b988b572';
    expect(verifyRiskConfirmation({ confirmationKind: 'none', planId })).toBe(true);

    expect(verifyRiskConfirmation({ confirmationKind: 'word', planId, provided: 'confirm' })).toBe(true);
    expect(verifyRiskConfirmation({ confirmationKind: 'word', planId, provided: '3B1C9E66' })).toBe(false);

    expect(verifyRiskConfirmation({ confirmationKind: 'plan-id', planId, provided: '3b1c9e66' })).toBe(true);
    expect(verifyRiskConfirmation({ confirmationKind: 'plan-id', planId, provided: 'CONFIRM' })).toBe(false);
  });
});

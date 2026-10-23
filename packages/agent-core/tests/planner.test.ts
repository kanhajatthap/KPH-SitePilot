import { describe, it, expect } from 'vitest';
import { WebsitePlanner, createStarterPlan } from '../src/planner.js';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { AuditLogger } from '@wp-agent/audit';
import { SitePlanSchema } from '@wp-agent/contracts';

describe('Phase 4: Website Planning, Design System and Preview Engine', () => {
  it('creates valid starter plan strictly conforming to SitePlanSchema', () => {
    const plan = createStarterPlan('Build a modern portfolio for a freelance photographer', 'LensCraft Studio');

    const validated = SitePlanSchema.safeParse(plan);
    expect(validated.success).toBe(true);

    expect(plan.title).toBe('LensCraft Studio');
    expect(plan.designSystem.palette.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(plan.designSystem.palette.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(plan.navigation.length).toBeGreaterThanOrEqual(3);
    expect(plan.pages.length).toBeGreaterThanOrEqual(2);

    const homePage = plan.pages.find((p) => p.isHome);
    expect(homePage).toBeDefined();
    expect(homePage?.sections.some((s) => s.type === 'hero')).toBe(true);
    expect(homePage?.sections.some((s) => s.type === 'features')).toBe(true);
    expect(plan.accessibility.wcagTarget).toBe('AA');
  });

  it('generates a structured plan using WebsitePlanner and MockModelAdapter', async () => {
    const auditLogger = new AuditLogger();
    const adapter = new MockModelAdapter({
      cannedResponses: [
        'Here is the requested plan for your corporate consulting agency.',
      ],
    });

    const planner = new WebsitePlanner({ modelAdapter: adapter, auditLogger });
    const plan = await planner.generatePlan({
      prompt: 'Build a corporate consulting site with emerald theme',
      siteTitle: 'Apex Advisory',
    });

    const validated = SitePlanSchema.safeParse(plan);
    expect(validated.success).toBe(true);
    expect(plan.title).toBe('Apex Advisory');
    expect(plan.version).toBe(1);

    const events = auditLogger.getEvents();
    expect(events.some((e) => e.action === 'generatePlan')).toBe(true);
  });

  it('revises plan design system colors and increments version safely', async () => {
    const planner = new WebsitePlanner({ modelAdapter: new MockModelAdapter() });
    const initialPlan = createStarterPlan('Design agency website', 'DesignCo');

    expect(initialPlan.version).toBe(1);

    // Revise to Ocean Blue palette
    const revisedPlan = await planner.revisePlan(
      initialPlan,
      'Change the color palette to ocean blue'
    );

    expect(revisedPlan.version).toBe(2);
    expect(revisedPlan.designSystem.palette.primary).toBe('#2563eb');
    expect(revisedPlan.designSystem.name).toBe('Ocean Blue');
    expect(SitePlanSchema.safeParse(revisedPlan).success).toBe(true);
  });

  it('revises plan by adding pricing and FAQ sections upon user request', async () => {
    const planner = new WebsitePlanner({ modelAdapter: new MockModelAdapter() });
    const initialPlan = createStarterPlan('SaaS software landing page', 'CloudFlow');

    const homePageBefore = initialPlan.pages.find((p) => p.isHome)!;
    expect(homePageBefore.sections.some((s) => s.type === 'pricing')).toBe(false);

    const revisedPlan = await planner.revisePlan(
      initialPlan,
      'Add a transparent pricing section and FAQ to the homepage'
    );

    const homePageAfter = revisedPlan.pages.find((p) => p.isHome)!;
    expect(homePageAfter.sections.some((s) => s.type === 'pricing')).toBe(true);
    expect(homePageAfter.sections.some((s) => s.type === 'faq')).toBe(true);
    expect(SitePlanSchema.safeParse(revisedPlan).success).toBe(true);
  });

  it('rejects malformed plan request inputs', async () => {
    const planner = new WebsitePlanner({ modelAdapter: new MockModelAdapter() });

    await expect(
      // @ts-expect-error Testing invalid runtime input
      planner.generatePlan({ prompt: '' })
    ).rejects.toThrow();
  });
});

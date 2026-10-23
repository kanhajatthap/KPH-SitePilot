import { randomUUID } from 'node:crypto';
import {
  SitePlan,
  SitePlanSchema,
  PlanGenerationRequest,
  PlanGenerationRequestSchema,
} from '@wp-agent/contracts';
import { ModelAdapter } from '@wp-agent/model-adapters';
import { AuditLogger } from '@wp-agent/audit';

export interface PlannerOptions {
  modelAdapter: ModelAdapter;
  auditLogger?: AuditLogger;
}

/**
 * Creates a default, well-structured starter SitePlan based on prompt context.
 */
export function createStarterPlan(
  prompt: string,
  title = 'My WordPress Website'
): SitePlan {
  const isPortfolio = /portfolio|photo|creative|designer|artist/i.test(prompt);
  const isECommerce = /shop|store|product|commerce|sell/i.test(prompt);
  const isCorporate = /agency|business|consulting|corporate|enterprise/i.test(prompt);

  const primaryColor = isPortfolio ? '#8b5cf6' : isECommerce ? '#f59e0b' : isCorporate ? '#0f766e' : '#059669';
  const secondaryColor = isPortfolio ? '#6d28d9' : isECommerce ? '#d97706' : '#047857';
  const accentColor = isPortfolio ? '#ec4899' : isECommerce ? '#10b981' : '#3b82f6';

  const plan: SitePlan = {
    id: randomUUID(),
    title,
    purpose: `A modern website generated for: "${prompt.slice(0, 100)}"`,
    targetAudience: isPortfolio
      ? 'Clients seeking creative design and visual excellence.'
      : isECommerce
      ? 'Online shoppers looking for premium products with fast checkout.'
      : 'Businesses and clients seeking trusted professional services.',
    designSystem: {
      name: isPortfolio ? 'Creative Violet' : isECommerce ? 'Warm Amber' : 'Emerald Slate',
      palette: {
        primary: primaryColor,
        secondary: secondaryColor,
        accent: accentColor,
        background: '#090d16',
        text: '#f8fafc',
        muted: '#94a3b8',
      },
      typography: {
        headingFont: 'Plus Jakarta Sans',
        bodyFont: 'Inter',
        baseSizePx: 16,
      },
      borderRadius: 'md',
      spacingScale: 'normal',
    },
    navigation: [
      { label: 'Home', slug: 'home' },
      { label: 'About', slug: 'about' },
      { label: 'Services', slug: 'services' },
      { label: 'Contact', slug: 'contact', isCta: true },
    ],
    pages: [
      {
        id: randomUUID(),
        slug: 'home',
        title: 'Home',
        isHome: true,
        seo: {
          metaTitle: `${title} — Modern High-Performance Experience`,
          metaDescription: `Discover ${title}. Crafted with high-speed performance and modern aesthetics.`,
          keywords: ['wordpress', 'modern', 'fast', 'accessible'],
        },
        sections: [
          {
            id: 'sec_hero',
            type: 'hero',
            headline: `Elevate Your Online Presence with ${title}`,
            subheadline: 'Designed with precision, built for performance, and structured for seamless WordPress deployment.',
            callToAction: {
              label: 'Explore Services',
              href: '#services',
              style: 'primary',
            },
          },
          {
            id: 'sec_features',
            type: 'features',
            headline: 'Engineered for Excellence',
            subheadline: 'Key capabilities designed to deliver measurable results.',
            items: [
              {
                title: 'High Speed & SEO',
                description: 'Optimized asset delivery, semantic markup, and Core Web Vitals compliance.',
                icon: 'zap',
              },
              {
                title: 'Accessible Design',
                description: 'WCAG 2.2 AA compliant contrast, keyboard navigation, and screen-reader support.',
                icon: 'shield',
              },
              {
                title: 'Seamless Integration',
                description: 'Built to connect cleanly with WordPress block editor and headless APIs.',
                icon: 'check',
              },
            ],
          },
          {
            id: 'sec_cta',
            type: 'cta',
            headline: 'Ready to Transform Your Website?',
            subheadline: 'Start with our guided blueprint and deploy with total confidence.',
            callToAction: {
              label: 'Get in Touch',
              href: '#contact',
              style: 'primary',
            },
          },
        ],
      },
      {
        id: randomUUID(),
        slug: 'about',
        title: 'About Us',
        isHome: false,
        seo: {
          metaTitle: `About Us — ${title}`,
          metaDescription: `Learn more about our mission and the team behind ${title}.`,
        },
        sections: [
          {
            id: 'sec_about_content',
            type: 'content',
            headline: 'Our Mission & Approach',
            subheadline: 'Dedicated to delivering reliable, beautifully crafted digital solutions.',
          },
        ],
      },
      {
        id: randomUUID(),
        slug: 'contact',
        title: 'Contact',
        isHome: false,
        seo: {
          metaTitle: `Contact — ${title}`,
          metaDescription: `Get in touch with the team at ${title}.`,
        },
        sections: [
          {
            id: 'sec_contact_form',
            type: 'contact',
            headline: "Let's Start a Conversation",
            subheadline: 'Reach out today for inquiries or project consultations.',
          },
        ],
      },
    ],
    accessibility: {
      wcagTarget: 'AA',
      highContrastCompliant: true,
      notes: [
        'Color contrast ratio exceeds 4.5:1 for body text and 3:1 for large headings.',
        'Interactive elements include visible focus rings and minimum 44x44px touch targets.',
        'Semantic landmarks (header, nav, main, footer) used throughout.',
      ],
    },
    version: 1,
    createdAt: new Date().toISOString(),
  };

  return SitePlanSchema.parse(plan);
}

/**
 * Website Planning Engine.
 * Converts user descriptions into validated structured SitePlan objects using shared Zod schemas.
 */
export class WebsitePlanner {
  private readonly modelAdapter: ModelAdapter;
  private readonly auditLogger?: AuditLogger;

  constructor(options: PlannerOptions) {
    this.modelAdapter = options.modelAdapter;
    this.auditLogger = options.auditLogger;
  }

  /**
   * Generates a validated structured SitePlan from a user prompt.
   */
  async generatePlan(request: PlanGenerationRequest): Promise<SitePlan> {
    const validatedRequest = PlanGenerationRequestSchema.parse(request);

    this.auditLogger?.log({
      type: 'agent_request',
      actor: 'user',
      action: 'generatePlan',
      payload: { prompt: validatedRequest.prompt },
    });

    const systemPrompt = [
      'You are KPH SitePilot Website Architect.',
      'Generate a comprehensive, structured JSON website plan matching the SitePlanSchema specification.',
      'MANDATES:',
      '1. Return ONLY valid JSON wrapped in a codeblock or raw JSON.',
      '2. Must include: title, purpose, targetAudience, designSystem (palette with hex codes, typography, borderRadius, spacingScale), navigation, pages with sections, accessibility.',
      '3. Every section must have id, type (hero, features, testimonials, pricing, cta, faq, contact, content), and headline.',
      '4. Strictly no executable code, no scripts, no HTML tags.',
    ].join('\n');

    try {
      const response = await this.modelAdapter.generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create a website plan for: "${validatedRequest.prompt}"` },
      ]);

      // Attempt to extract JSON from model response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          // Inject missing UUID / dates if omitted by model
          parsed.id = parsed.id || randomUUID();
          parsed.createdAt = parsed.createdAt || new Date().toISOString();
          parsed.version = parsed.version || 1;

          const validatedPlan = SitePlanSchema.safeParse(parsed);
          if (validatedPlan.success) {
            return validatedPlan.data;
          }
        } catch {
          // Fall through to deterministic starter plan
        }
      }

      // If model returned freeform text or partial JSON, use deterministic generator customized by prompt
      const plan = createStarterPlan(
        validatedRequest.prompt,
        validatedRequest.siteTitle || 'Planned WordPress Site'
      );

      this.auditLogger?.log({
        type: 'tool_result',
        actor: 'planner',
        action: 'generatePlan',
        result: { success: true, planId: plan.id, version: plan.version },
      });

      return plan;
    } catch (err) {
      // Graceful resilient fallback to deterministic planner if model quota is exceeded or offline
      const plan = createStarterPlan(
        validatedRequest.prompt,
        validatedRequest.siteTitle || 'Planned WordPress Site'
      );

      this.auditLogger?.log({
        type: 'tool_result',
        actor: 'planner',
        action: 'generatePlanFallback',
        result: { fallback: true, originalError: (err as Error).message },
      });

      return plan;
    }
  }

  /**
   * Revises an existing SitePlan based on user feedback.
   */
  async revisePlan(
    currentPlan: SitePlan,
    revisionPrompt: string
  ): Promise<SitePlan> {
    const validatedPlan = SitePlanSchema.parse(currentPlan);

    // Apply structured mutations safely
    const revised: SitePlan = {
      ...validatedPlan,
      version: validatedPlan.version + 1,
      purpose: `${validatedPlan.purpose} (Revised: ${revisionPrompt.slice(0, 50)})`,
    };

    // Check if user requested a color change
    if (/emerald|green/i.test(revisionPrompt)) {
      revised.designSystem.palette.primary = '#059669';
      revised.designSystem.palette.secondary = '#047857';
      revised.designSystem.name = 'Emerald Modern';
    } else if (/blue|navy|ocean/i.test(revisionPrompt)) {
      revised.designSystem.palette.primary = '#2563eb';
      revised.designSystem.palette.secondary = '#1d4ed8';
      revised.designSystem.name = 'Ocean Blue';
    } else if (/purple|violet/i.test(revisionPrompt)) {
      revised.designSystem.palette.primary = '#7c3aed';
      revised.designSystem.palette.secondary = '#6d28d9';
      revised.designSystem.name = 'Deep Violet';
    }

    // Check if user requested a section addition
    if (/pricing/i.test(revisionPrompt)) {
      const homePage = revised.pages.find((p) => p.isHome) || revised.pages[0];
      if (!homePage.sections.some((s) => s.type === 'pricing')) {
        homePage.sections.push({
          id: `sec_pricing_${Date.now()}`,
          type: 'pricing',
          headline: 'Simple, Transparent Pricing',
          subheadline: 'Choose the plan that fits your business goals.',
          items: [
            { title: 'Starter Plan', description: 'Essential features for small sites', meta: '$29/mo' },
            { title: 'Pro Plan', description: 'Full capabilities for growing brands', meta: '$79/mo' },
          ],
        });
      }
    }

    if (/faq/i.test(revisionPrompt)) {
      const homePage = revised.pages.find((p) => p.isHome) || revised.pages[0];
      if (!homePage.sections.some((s) => s.type === 'faq')) {
        homePage.sections.push({
          id: `sec_faq_${Date.now()}`,
          type: 'faq',
          headline: 'Frequently Asked Questions',
          subheadline: 'Answers to common questions about our services.',
          items: [
            { title: 'How does it work?', description: 'Everything is built with clean WordPress standards.' },
            { title: 'Is it mobile friendly?', description: 'Fully responsive across all device sizes.' },
          ],
        });
      }
    }

    return SitePlanSchema.parse(revised);
  }
}

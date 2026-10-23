import { describe, it, expect } from 'vitest';
import {
  detectSiteCapabilities,
  parseGutenbergBlocks,
  serializeGutenbergBlocks,
  convertSectionToGutenberg,
  parseElementorData,
  convertSectionToElementor,
  validateAcfFields,
  validateWooProduct,
  checkHposCompatibility,
  parseThemeManifest,
  HttpTransport,
} from '../src/index.js';
import { Section } from '@wp-agent/contracts';

describe('Phase 6: WordPress Builder Integrations', () => {
  // =========================================================================
  // 1. Capability Detection
  // =========================================================================
  describe('CapabilityDetector', () => {
    it('detects all active builder ecosystems from WordPress REST namespaces', async () => {
      const mockTransport: HttpTransport = async (url) => {
        if (url.includes('/wp-json/wp/v2/themes')) {
          return new Response(
            JSON.stringify([
              {
                stylesheet: 'twentytwentyfour',
                is_block_theme: true,
                theme_supports: { 'block-templates': true },
              },
            ]),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            namespaces: [
              'wp/v2',
              'elementor/v1',
              'acf/v3',
              'wc/v3',
            ],
          }),
          { status: 200 }
        );
      };

      const caps = await detectSiteCapabilities(
        new URL('http://plugin-test.local'),
        mockTransport
      );

      expect(caps.gutenberg).toBe(true);
      expect(caps.elementor).toBe(true);
      expect(caps.acf).toBe(true);
      expect(caps.woocommerce).toBe(true);
      expect(caps.theme.isBlockTheme).toBe(true);
    });

    it('gracefully reports unsupported builders when namespaces are absent', async () => {
      const minimalTransport: HttpTransport = async () => {
        return new Response(
          JSON.stringify({ namespaces: ['wp/v2'] }),
          { status: 200 }
        );
      };

      const caps = await detectSiteCapabilities(
        new URL('http://plugin-test.local'),
        minimalTransport
      );

      expect(caps.gutenberg).toBe(true);
      expect(caps.elementor).toBe(false);
      expect(caps.acf).toBe(false);
      expect(caps.woocommerce).toBe(false);
    });
  });

  // =========================================================================
  // 2. Gutenberg Block Editor Integration
  // =========================================================================
  describe('GutenbergAdapter', () => {
    it('parses block comment grammar and preserves unknown third-party blocks', () => {
      const html = `
        <!-- wp:heading {"level":2} -->
        <h2>Welcome to SitePilot</h2>
        <!-- /wp:heading -->

        <!-- wp:acme/custom-carousel {"speed":500,"autoplay":true} -->
        <div class="acme-carousel">Slide Data</div>
        <!-- /wp:acme/custom-carousel -->

        <!-- wp:paragraph -->
        <p>A standard paragraph.</p>
        <!-- /wp:paragraph -->
      `;

      const blocks = parseGutenbergBlocks(html);
      expect(blocks).toHaveLength(3);

      expect(blocks[0].blockName).toBe('core/heading');
      expect(blocks[0].attrs).toEqual({ level: 2 });

      // Unknown block preserved verbatim!
      expect(blocks[1].blockName).toBe('acme/custom-carousel');
      expect(blocks[1].attrs).toEqual({ speed: 500, autoplay: true });
      expect(blocks[1].innerHtml).toContain('acme-carousel');

      expect(blocks[2].blockName).toBe('core/paragraph');

      // Reserialization preserves unknown blocks
      const serialized = serializeGutenbergBlocks(blocks);
      expect(serialized).toContain('<!-- wp:acme/custom-carousel');
      expect(serialized).toContain('"speed":500');
    });

    it('converts SitePlan Section to structured Gutenberg blocks', () => {
      const heroSection: Section = {
        id: 'hero_1',
        type: 'hero',
        headline: 'Modern Architecture',
        subheadline: 'High speed performance',
        callToAction: { label: 'Get Started', href: '#contact', style: 'primary' },
      };

      const blocks = convertSectionToGutenberg(heroSection);
      expect(blocks.some((b) => b.blockName === 'core/heading')).toBe(true);
      expect(blocks.some((b) => b.blockName === 'core/paragraph')).toBe(true);
      expect(blocks.some((b) => b.blockName === 'core/buttons')).toBe(true);
    });
  });

  // =========================================================================
  // 3. Elementor Integration
  // =========================================================================
  describe('ElementorAdapter', () => {
    it('parses raw Elementor data and preserves widget hierarchies', () => {
      const sampleData = [
        {
          id: 'sec1',
          elType: 'section',
          settings: { layout: 'boxed' },
          elements: [
            {
              id: 'col1',
              elType: 'column',
              settings: {},
              elements: [
                {
                  id: 'wid1',
                  elType: 'widget',
                  widgetType: 'heading',
                  settings: { title: 'Elementor Heading' },
                  elements: [],
                },
                {
                  id: 'wid_third_party',
                  elType: 'widget',
                  widgetType: 'essential-addons-slider',
                  settings: { custom_setting: 'value' },
                  elements: [],
                },
              ],
            },
          ],
        },
      ];

      const elements = parseElementorData(sampleData);
      expect(elements).toHaveLength(1);
      expect(elements[0].elements[0].elements).toHaveLength(2);

      // Third-party widget preserved
      expect(elements[0].elements[0].elements[1].widgetType).toBe('essential-addons-slider');
    });

    it('converts SitePlan Section into valid Elementor Section -> Column -> Widget tree', () => {
      const section: Section = {
        id: 'feat_1',
        type: 'features',
        headline: 'Core Services',
        items: [
          { title: 'SEO Audit', description: 'Complete search optimization' },
        ],
      };

      const elSection = convertSectionToElementor(section);
      expect(elSection.elType).toBe('section');
      expect(elSection.elements[0].elType).toBe('column');
      expect(elSection.elements[0].elements.some((w) => w.widgetType === 'heading')).toBe(true);
      expect(elSection.elements[0].elements.some((w) => w.widgetType === 'icon-box')).toBe(true);
    });
  });

  // =========================================================================
  // 4. ACF Integration
  // =========================================================================
  describe('ACFAdapter', () => {
    const sampleGroup = {
      key: 'group_homepage',
      title: 'Homepage Fields',
      fields: [
        { key: 'f1', name: 'hero_badge', label: 'Hero Badge', type: 'text' as const, required: true },
        { key: 'f2', name: 'rating_count', label: 'Rating Count', type: 'number' as const },
        { key: 'f3', name: 'support_email', label: 'Support Email', type: 'email' as const },
      ],
    };

    it('validates compliant ACF field values successfully', () => {
      const values = {
        hero_badge: 'New 2026 Release',
        rating_count: 500,
        support_email: 'hello@kphsitepilot.local',
      };

      const result = validateAcfFields(values, sampleGroup);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing required fields and type mismatches', () => {
      const invalidValues = {
        hero_badge: '', // Required!
        rating_count: 'not-a-number' as unknown as number, // Bad type!
        support_email: 'invalid-email-address',
      };

      const result = validateAcfFields(invalidValues, sampleGroup);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.some((e) => e.includes('required'))).toBe(true);
    });
  });

  // =========================================================================
  // 5. WooCommerce Integration
  // =========================================================================
  describe('WooCommerceAdapter', () => {
    it('validates compliant WooCommerce product data', () => {
      const validProduct = {
        name: 'Pro Subscription',
        type: 'simple' as const,
        regularPrice: '99.00',
        salePrice: '79.00',
        description: 'Complete digital workspace',
        stockStatus: 'instock' as const,
      };

      const result = validateWooProduct(validProduct);
      expect(result.valid).toBe(true);
    });

    it('rejects product when salePrice exceeds regularPrice or name is missing', () => {
      const invalidProduct = {
        name: '',
        type: 'simple' as const,
        regularPrice: '50.00',
        salePrice: '75.00', // Invalid: salePrice >= regularPrice
        description: 'Invalid pricing',
        stockStatus: 'instock' as const,
      };

      const result = validateWooProduct(invalidProduct);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('name is required'))).toBe(true);
      expect(result.errors.some((e) => e.includes('less than regular price'))).toBe(true);
    });

    it('checks HPOS compatibility accurately from system status', () => {
      expect(checkHposCompatibility({ environment: { hpos_enabled: true } })).toBe(true);
      expect(checkHposCompatibility({ environment: { hpos_enabled: false } })).toBe(false);
    });
  });

  // =========================================================================
  // 6. Custom Themes & theme.json Integration
  // =========================================================================
  describe('ThemeAdapter', () => {
    it('parses FSE block themes and extracts theme.json color palettes', () => {
      const manifest = parseThemeManifest(
        {
          stylesheet: 'twentytwentyfour',
          is_block_theme: true,
          version: '1.2',
        },
        {
          version: 2,
          settings: {
            color: {
              palette: [
                { slug: 'base', color: '#ffffff', name: 'Base' },
                { slug: 'primary', color: '#059669', name: 'Emerald' },
              ],
            },
          },
        }
      );

      expect(manifest.isBlockTheme).toBe(true);
      expect(manifest.themeJsonSupported).toBe(true);
      expect(manifest.colorPalette).toHaveLength(2);
      expect(manifest.colorPalette?.[1].color).toBe('#059669');
    });

    it('handles classic themes safely when theme.json is absent', () => {
      const manifest = parseThemeManifest({
        name: { rendered: 'Astra Classic' },
        stylesheet: 'astra',
        is_block_theme: false,
      });

      expect(manifest.isBlockTheme).toBe(false);
      expect(manifest.themeJsonSupported).toBe(false);
      expect(manifest.name).toBe('Astra Classic');
    });
  });
});

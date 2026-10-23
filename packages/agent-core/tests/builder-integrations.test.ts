import { describe, it, expect, vi } from 'vitest';
import {
  AgentCore,
  createBuilderDetectTool,
  createBuilderInspectTool,
} from '../src/index.js';
import {
  WordPressClient,
  convertSectionToGutenberg,
  serializeGutenbergBlocks,
  parseGutenbergBlocks,
  convertSectionToElementor,
  parseElementorData,
  validateAcfFields,
  validateWooProduct,
  checkHposCompatibility,
  parseThemeManifest,
} from '@wp-agent/wp-client';
import { Section, PermissionLevel } from '@wp-agent/contracts';

class MockAuditLogger {
  public logs: unknown[] = [];
  log(entry: unknown) {
    this.logs.push(entry);
  }
}

describe('Phase 6: Builder Integrations & Agent Tools', () => {
  // 1. Tool Contracts & Permission Levels
  describe('Builder Tool Contracts', () => {
    it('creates builder.detect tool with READ_ONLY permission', () => {
      const mockWpClient = {
        detectCapabilities: vi.fn(),
      } as unknown as WordPressClient;

      const tool = createBuilderDetectTool(mockWpClient);
      expect(tool.name).toBe('builder.detect');
      expect(tool.permissionLevel).toBe(PermissionLevel.READ_ONLY);
      expect(tool.isReadOnly).toBe(true);
    });

    it('creates builder.inspect tool with READ_ONLY permission', () => {
      const mockWpClient = {
        readBuilderContent: vi.fn(),
      } as unknown as WordPressClient;

      const tool = createBuilderInspectTool(mockWpClient);
      expect(tool.name).toBe('builder.inspect');
      expect(tool.permissionLevel).toBe(PermissionLevel.READ_ONLY);
      expect(tool.isReadOnly).toBe(true);
    });

    it('executes builder.detect and builder.inspect via AgentCore safely', async () => {
      const mockWpClient = {
        detectCapabilities: vi.fn().mockResolvedValue({
          gutenberg: true,
          elementor: true,
          acf: true,
          woocommerce: false,
          theme: { name: 'Twenty Twenty-Four', isBlockTheme: true },
          supportedNamespaces: ['wp/v2', 'elementor/v1', 'acf/v3'],
        }),
        readBuilderContent: vi.fn().mockResolvedValue({
          page: { id: 10, title: 'Sample Page', slug: 'sample-page', status: 'publish' },
          detectedBuilder: 'gutenberg',
          gutenbergBlocks: [
            { blockName: 'core/heading', attrs: { level: 2 }, innerHtml: '<h2>Title</h2>' },
          ],
          elementorElements: [],
          rawContent: '<!-- wp:heading {"level":2} --><h2>Title</h2><!-- /wp:heading -->',
        }),
      } as unknown as WordPressClient;

      const auditLogger = new MockAuditLogger();
      const agent = new AgentCore({
        modelAdapter: { providerId: 'mock', modelName: 'mock', generate: vi.fn() },
        auditLogger: auditLogger as any,
        wpClient: mockWpClient,
      });

      // 1. Execute builder.detect
      const detectResult = await agent.executeToolCall(
        { id: 'c1', name: 'builder.detect', arguments: {} },
        { siteUrl: 'http://test.local', correlationId: 'corr-1' }
      );
      expect(detectResult.isError).toBe(false);
      expect(detectResult.output).toMatchObject({
        gutenberg: true,
        elementor: true,
        acf: true,
      });

      // 2. Execute builder.inspect
      const inspectResult = await agent.executeToolCall(
        { id: 'c2', name: 'builder.inspect', arguments: { pageIdOrSlug: 'sample-page' } },
        { siteUrl: 'http://test.local', correlationId: 'corr-2' }
      );
      expect(inspectResult.isError).toBe(false);
      expect(inspectResult.output).toMatchObject({
        detectedBuilder: 'gutenberg',
      });
    });
  });

  // 2. Integration Order 1: Gutenberg / WordPress Block Editor
  describe('1. Gutenberg Block Editor Integration', () => {
    it('converts all section types to Gutenberg blocks and preserves unknown blocks', () => {
      const heroSection: Section = {
        id: 'hero',
        type: 'hero',
        headline: 'Hero Title',
        subheadline: 'Hero Subtitle',
        callToAction: { label: 'Click Me', href: '/contact', style: 'primary' },
      };

      const blocks = convertSectionToGutenberg(heroSection);
      expect(blocks.some((b) => b.blockName === 'core/heading')).toBe(true);
      expect(blocks.some((b) => b.blockName === 'core/paragraph')).toBe(true);
      expect(blocks.some((b) => b.blockName === 'core/buttons')).toBe(true);

      const serialized = serializeGutenbergBlocks(blocks);
      expect(serialized).toContain('<!-- wp:core/heading');
      expect(serialized).toContain('<!-- wp:core/paragraph');
      expect(serialized).toContain('<!-- wp:core/buttons');

      // Preserve third-party blocks round-trip
      const mixedContent = `${serialized}\n\n<!-- wp:custom/slider {"slides":3} --><div class="slider"></div><!-- /wp:custom/slider -->`;
      const parsedBlocks = parseGutenbergBlocks(mixedContent);
      expect(parsedBlocks.some((b) => b.blockName === 'custom/slider')).toBe(true);

      const reserialized = serializeGutenbergBlocks(parsedBlocks);
      expect(reserialized).toContain('<!-- wp:custom/slider {"slides":3} -->');
    });
  });

  // 3. Integration Order 2: Elementor
  describe('2. Elementor Integration', () => {
    it('converts section to Elementor Section -> Column -> Widget hierarchy and preserves custom widgets', () => {
      const section: Section = {
        id: 'sec1',
        type: 'features',
        headline: 'Our Features',
        items: [
          { title: 'Fast', description: 'Lightning speed' },
          { title: 'Secure', description: 'Bank grade' },
        ],
      };

      const elSection = convertSectionToElementor(section);
      expect(elSection.elType).toBe('section');
      expect(elSection.elements[0].elType).toBe('column');
      expect(elSection.elements[0].elements.length).toBe(3); // 1 heading + 2 icon-boxes

      // Preserves custom third-party widgets
      const existingData = [
        elSection,
        {
          id: 'custom_sec',
          elType: 'section' as const,
          settings: {},
          elements: [
            {
              id: 'col_c',
              elType: 'column' as const,
              settings: {},
              elements: [
                {
                  id: 'wid_pro',
                  elType: 'widget' as const,
                  widgetType: 'jet-engine-listing-grid',
                  settings: { query_id: 123 },
                  elements: [],
                },
              ],
            },
          ],
        },
      ];

      const parsed = parseElementorData(existingData);
      expect(parsed).toHaveLength(2);
      expect(parsed[1].elements[0].elements[0].widgetType).toBe('jet-engine-listing-grid');
    });
  });

  // 4. Integration Order 3: Advanced Custom Fields (ACF)
  describe('3. Advanced Custom Fields (ACF) Integration', () => {
    it('validates ACF field constraints and reports clear error messages', () => {
      const fieldGroup = {
        key: 'group_test',
        title: 'Project Meta',
        fields: [
          { key: 'f1', label: 'Client Name', name: 'client_name', type: 'text' as const, required: true },
          { key: 'f2', label: 'Budget', name: 'budget', type: 'number' as const, required: true },
          { key: 'f3', label: 'Contact Email', name: 'contact_email', type: 'email' as const },
        ],
      };

      // Valid case
      const validRes = validateAcfFields(
        { client_name: 'Acme Corp', budget: 15000, contact_email: 'hello@acme.com' },
        fieldGroup
      );
      expect(validRes.valid).toBe(true);

      // Invalid case: missing required budget & invalid email
      const invalidRes = validateAcfFields(
        { client_name: 'Acme Corp', budget: null, contact_email: 'not-an-email' },
        fieldGroup
      );
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.errors.length).toBeGreaterThanOrEqual(2);
      expect(invalidRes.errors.some((e) => e.includes('budget'))).toBe(true);
      expect(invalidRes.errors.some((e) => e.includes('valid email'))).toBe(true);
    });
  });

  // 5. Integration Order 4: WooCommerce
  describe('4. WooCommerce Integration', () => {
    it('validates WooCommerce product pricing and checks HPOS compatibility', () => {
      // Valid product
      const valid = validateWooProduct({
        name: 'WordPress Starter Kit',
        type: 'simple',
        regularPrice: '49.00',
        salePrice: '29.00',
        description: 'Complete starter kit',
        stockStatus: 'instock',
      });
      expect(valid.valid).toBe(true);

      // Invalid pricing: sale price >= regular price
      const invalid = validateWooProduct({
        name: 'Faulty Product',
        type: 'simple',
        regularPrice: '30.00',
        salePrice: '35.00',
        description: 'Overpriced sale',
        stockStatus: 'instock',
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.some((e) => e.includes('less than regular price'))).toBe(true);

      // HPOS check
      expect(checkHposCompatibility({ environment: { hpos_enabled: true } })).toBe(true);
      expect(checkHposCompatibility({ environment: { hpos_enabled: false } })).toBe(false);
    });
  });

  // 6. Integration Order 5: Custom Themes & theme.json
  describe('5. Custom Themes & theme.json Integration', () => {
    it('differentiates FSE block themes from classic themes and extracts color palettes', () => {
      // Block theme with theme.json
      const fseTheme = parseThemeManifest(
        { name: { rendered: 'Twenty Twenty-Four' }, stylesheet: 'twentytwentyfour', is_block_theme: true },
        {
          version: 2,
          settings: {
            color: {
              palette: [
                { slug: 'primary', color: '#059669', name: 'Primary Emerald' },
                { slug: 'dark', color: '#0f172a', name: 'Dark Slate' },
              ],
            },
          },
        }
      );
      expect(fseTheme.isBlockTheme).toBe(true);
      expect(fseTheme.themeJsonSupported).toBe(true);
      expect(fseTheme.colorPalette?.[0].color).toBe('#059669');

      // Classic theme without theme.json
      const classicTheme = parseThemeManifest({
        name: { rendered: 'GeneratePress' },
        stylesheet: 'generatepress',
        is_block_theme: false,
      });
      expect(classicTheme.isBlockTheme).toBe(false);
      expect(classicTheme.themeJsonSupported).toBe(false);
    });
  });
});

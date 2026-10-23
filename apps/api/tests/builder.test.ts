import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildServer, activeProposals } from '../src/index.js';
import { AuditLogger } from '@wp-agent/audit';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { WordPressClient } from '@wp-agent/wp-client';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

describe('Phase 6: Builder Endpoints (/api/builder/detect and /api/builder/propose)', () => {
  let server: Server;
  let baseUrl: string;
  let mockWpClient: WordPressClient;

  beforeAll(async () => {
    const auditLogger = new AuditLogger();
    const mockAdapter = new MockModelAdapter();

    mockWpClient = {
      detectCapabilities: vi.fn().mockImplementation(async (targetSite: string) => {
        return {
          gutenberg: true,
          elementor: true,
          acf: true,
          woocommerce: true,
          theme: {
            name: 'Twenty Twenty-Four',
            isBlockTheme: true,
            version: '1.2',
          },
          supportedNamespaces: ['wp/v2', 'elementor/v1', 'acf/v3', 'wc/v3'],
        };
      }),
      readBuilderContent: vi.fn().mockImplementation(async (_site: string, pageIdOrSlug: string) => {
        if (pageIdOrSlug === 'custom-post') {
          return {
            page: { id: 10, slug: 'custom-post', title: 'Custom Post', content: '<!-- wp:thirdparty/slider {"autoplay":true} --><div class="slider">Slide</div><!-- /wp:thirdparty/slider -->' },
            detectedBuilder: 'gutenberg',
            gutenbergBlocks: [
              {
                blockName: 'thirdparty/slider',
                attrs: { autoplay: true },
                innerHtml: '<div class="slider">Slide</div>',
              },
            ],
            elementorElements: [],
            rawContent: '...',
          };
        }
        return {
          page: { id: 1, slug: 'home', title: 'Home', content: '' },
          detectedBuilder: 'gutenberg',
          gutenbergBlocks: [],
          elementorElements: [],
          rawContent: '',
        };
      }),
      proposeGutenbergPost: vi.fn().mockImplementation(async (_site: string, params) => {
        const blocks = [
          {
            blockName: 'core/heading',
            attrs: { level: 2 },
            innerHtml: `<h2>${params.title}</h2>`,
          },
          ...(params.existingBlocks || []),
        ];
        return {
          title: params.title,
          blocks,
          serializedContent: '<!-- wp:heading {"level":2} --><h2>' + params.title + '</h2><!-- /wp:heading -->',
          renderedPreviewHtml: `<div class="wp-block wp-block-heading"><h2>${params.title}</h2></div>`,
          diff: {
            before: params.existingBlocks?.length ? 'existing-content' : null,
            after: '<!-- wp:heading -->...',
          },
          unsupportedFeatures: [],
        };
      }),
      proposeElementorPost: vi.fn().mockImplementation(async (_site: string, params) => {
        const elements = [
          {
            id: 'sec_1',
            elType: 'section',
            elements: [
              {
                id: 'col_1',
                elType: 'column',
                elements: [
                  {
                    id: 'w_1',
                    elType: 'widget',
                    widgetType: 'heading',
                    settings: { title: params.title },
                  },
                ],
              },
            ],
          },
        ];
        return {
          title: params.title,
          elements,
          serializedData: JSON.stringify(elements),
          renderedPreviewHtml: `<div class="elementor-section"><h2>${params.title}</h2></div>`,
          diff: {
            before: null,
            after: elements,
          },
          unsupportedFeatures: [],
        };
      }),
      validateAcf: vi.fn().mockImplementation((values, group) => {
        const errors: string[] = [];
        for (const field of group.fields) {
          if (field.required && (values[field.name] === undefined || values[field.name] === '')) {
            errors.push(`Field "${field.label || field.name}" is required.`);
          }
        }
        return { valid: errors.length === 0, errors };
      }),
      validateProduct: vi.fn().mockImplementation((product) => {
        const errors: string[] = [];
        if (!product.name) errors.push('Product name is required.');
        if (product.salePrice && parseFloat(product.salePrice) >= parseFloat(product.regularPrice)) {
          errors.push('Sale price must be strictly less than regular price.');
        }
        return { valid: errors.length === 0, errors };
      }),
      inspectTheme: vi.fn().mockImplementation(async () => {
        return {
          name: 'Twenty Twenty-Four',
          slug: 'twentytwentyfour',
          version: '1.2',
          isBlockTheme: true,
          supports: { blockTemplates: true },
        };
      }),
      createDraftPost: vi.fn().mockImplementation(async (targetSite, params) => {
        return {
          id: 501,
          slug: 'builder-draft',
          title: params.title,
          status: 'draft',
          editLink: `${targetSite}/wp-admin/post.php?post=501&action=edit`,
          verified: true,
        };
      }),
    } as unknown as WordPressClient;

    server = buildServer(auditLogger, mockAdapter, mockWpClient);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('POST /api/builder/detect successfully probes site capabilities', async () => {
    const res = await fetch(`${baseUrl}/api/builder/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSite: 'http://test.local' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.targetSite).toBe('http://test.local');
    expect(data.capabilities.gutenberg).toBe(true);
    expect(data.capabilities.elementor).toBe(true);
    expect(data.capabilities.acf).toBe(true);
    expect(data.capabilities.woocommerce).toBe(true);
    expect(data.capabilities.theme.isBlockTheme).toBe(true);
  });

  it('POST /api/builder/detect rejects invalid request body with 400', async () => {
    const res = await fetch(`${baseUrl}/api/builder/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSite: 'invalid-url-string' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('VALIDATION_FAILED');
  });

  it('POST /api/builder/propose generates Gutenberg block proposal with diff and integrity hash', async () => {
    const res = await fetch(`${baseUrl}/api/builder/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSite: 'http://test.local',
        builderType: 'gutenberg',
        title: 'Modern AI Architecture',
        prompt: 'Generate Gutenberg blocks for Modern AI Architecture',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('proposed');
    expect(data.builderType).toBe('gutenberg');
    expect(data.title).toBe('Modern AI Architecture');
    expect(data.integrityHash).toBeDefined();
    expect(data.diff).toBeDefined();
    expect(data.renderedPreviewHtml).toContain('wp-block');
    expect(activeProposals.has(data.planId)).toBe(true);
  });

  it('POST /api/builder/propose preserves third-party blocks from existing content', async () => {
    const res = await fetch(`${baseUrl}/api/builder/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSite: 'http://test.local',
        builderType: 'gutenberg',
        pageIdOrSlug: 'custom-post',
        title: 'Updated Custom Post',
        prompt: 'Update post while preserving slider',
      }),
    });

    expect(res.status).toBe(200);
    expect(mockWpClient.readBuilderContent).toHaveBeenCalledWith('http://test.local', 'custom-post');
    expect(mockWpClient.proposeGutenbergPost).toHaveBeenCalledWith(
      'http://test.local',
      expect.objectContaining({
        existingBlocks: expect.arrayContaining([
          expect.objectContaining({ blockName: 'thirdparty/slider' }),
        ]),
      })
    );
  });

  it('POST /api/builder/propose generates Elementor section structure with diff', async () => {
    const res = await fetch(`${baseUrl}/api/builder/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSite: 'http://test.local',
        builderType: 'elementor',
        title: 'Elementor Hero Banner',
        prompt: 'Create an Elementor hero banner',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('proposed');
    expect(data.builderType).toBe('elementor');
    expect(data.renderedPreviewHtml).toContain('elementor-section');
    expect(data.integrityHash).toBeDefined();
  });

  it('POST /api/builder/propose accepts valid ACF metadata', async () => {
    const res = await fetch(`${baseUrl}/api/builder/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSite: 'http://test.local',
        builderType: 'acf',
        title: 'ACF Page Meta',
        prompt: 'Update ACF page metadata',
        acfData: {
          subheading: 'Valid Subheading',
          rating: 4,
        },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('proposed');
    expect(data.builderType).toBe('acf');
    expect(data.renderedPreviewHtml).toContain('ACF Field Group');
  });

  it('POST /api/builder/propose rejects invalid ACF metadata with 400', async () => {
    const res = await fetch(`${baseUrl}/api/builder/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSite: 'http://test.local',
        builderType: 'acf',
        title: 'ACF Page Meta',
        prompt: 'Update ACF metadata without required fields',
        acfData: {
          // missing required 'subheading'
          rating: 4,
        },
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('VALIDATION_FAILED');
    expect(data.message).toContain('ACF validation failed');
  });

  it('POST /api/builder/propose rejects WooCommerce product when sale price exceeds regular price', async () => {
    const res = await fetch(`${baseUrl}/api/builder/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSite: 'http://test.local',
        builderType: 'woocommerce',
        title: 'Invalid Discount Product',
        prompt: 'Create product with invalid discount',
        wooProductData: {
          name: 'Invalid Discount Product',
          type: 'simple',
          regularPrice: '20.00',
          salePrice: '30.00', // Invalid: salePrice >= regularPrice
          description: 'A test product',
          stockStatus: 'instock',
        },
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('VALIDATION_FAILED');
    expect(data.message).toContain('WooCommerce validation failed');
  });

  it('applies a proposed builder plan via POST /api/mutate/apply after approval', async () => {
    // 1. Propose Gutenberg post
    const propRes = await fetch(`${baseUrl}/api/builder/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSite: 'http://test.local',
        builderType: 'gutenberg',
        title: 'Approved Builder Page',
        prompt: 'Propose page for approval',
      }),
    });
    const propData = await propRes.json();

    // 2. Submit explicit human approval with exact planId and integrityHash
    const applyRes = await fetch(`${baseUrl}/api/mutate/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: propData.planId,
        integrityHash: propData.integrityHash,
        targetSite: 'http://test.local',
        approvedBy: 'reviewer',
        post: {
          title: 'Approved Builder Page',
          content: '<!-- wp:heading -->Approved<!-- /wp:heading -->',
        },
      }),
    });

    expect(applyRes.status).toBe(200);
    const applyData = await applyRes.json();
    expect(applyData.status).toBe('applied');
    expect(applyData.post.verified).toBe(true);
    expect(applyData.post.id).toBe(501);

    // Staged proposal should be removed from active memory
    expect(activeProposals.has(propData.planId)).toBe(false);
  });
});

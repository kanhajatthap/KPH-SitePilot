import { describe, expect, it } from 'vitest';
import {
  extractInspectableBlockAttributes,
  identifyPageSections,
  validatePropertyPatch,
  applyPropertyPatchToBlock,
  proposeSectionEdit,
} from '../src/section-editor';

describe('Gutenberg section inspector attributes', () => {
  it('exposes an allow-listed, bounded set of block attributes', () => {
    const longText = 'x'.repeat(200);
    const attributes = extractInspectableBlockAttributes({
      align: 'wide',
      anchor: 'hero',
      backgroundColor: 'contrast',
      className: longText,
      customData: 'must not be exposed',
      style: {
        color: { background: '#123456', text: '#ffffff', custom: 'hidden' },
        spacing: { padding: '24px', margin: { top: '2rem' } },
        custom: { secret: 'hidden' },
      },
    });

    expect(attributes).toEqual({
      align: 'wide',
      anchor: 'hero',
      backgroundColor: 'contrast',
      className: 'x'.repeat(160),
      'style.color.background': '#123456',
      'style.color.text': '#ffffff',
      'style.spacing.padding': '24px',
    });
    expect(attributes).not.toHaveProperty('customData');
    expect(attributes).not.toHaveProperty('style.custom.secret');
  });

  it('returns inspectable attributes for identified Gutenberg sections', () => {
    const content = [
      '<!-- wp:cover {"align":"full","backgroundColor":"contrast","style":{"color":{"background":"#101820"}}} -->',
      '<div class="wp-block-cover"><h1>Welcome</h1></div>',
      '<!-- /wp:cover -->',
    ].join('');

    const [section] = identifyPageSections(content);

    expect(section.id).toBe('hero');
    expect(section.blockName).toBe('cover');
    expect(section.attributes).toEqual({
      align: 'full',
      backgroundColor: 'contrast',
      'style.color.background': '#101820',
    });
  });

  describe('validatePropertyPatch', () => {
    it('accepts valid allow-listed properties', () => {
      const patch = {
        align: 'wide',
        backgroundColor: '#ff5500',
        textColor: 'contrast',
        fontSize: 'large',
        'style.spacing.padding': '2rem',
      };
      const validated = validatePropertyPatch(patch);
      expect(validated).toEqual(patch);
    });

    it('rejects unsupported property keys', () => {
      expect(() => {
        validatePropertyPatch({ arbitraryKey: 'malicious' });
      }).toThrow(/Unsupported editable attribute/);
    });

    it('rejects invalid align values', () => {
      expect(() => {
        validatePropertyPatch({ align: 'invalid-align' });
      }).toThrow(/Invalid align value/);
    });

    it('rejects unsafe color values', () => {
      expect(() => {
        validatePropertyPatch({ backgroundColor: 'expression(alert(1))' });
      }).toThrow(/Invalid background color/);
    });

    it('rejects unsafe spacing values', () => {
      expect(() => {
        validatePropertyPatch({ 'style.spacing.padding': '10px; background: red' });
      }).toThrow(/Invalid spacing value/);
    });
  });

  describe('applyPropertyPatchToBlock', () => {
    it('updates comment JSON attributes and class names', () => {
      const rawBlock = '<!-- wp:group {"align":"none"} -->\n<div class="wp-block-group alignnone"><p>Content</p></div>\n<!-- /wp:group -->';
      const updated = applyPropertyPatchToBlock(rawBlock, {
        align: 'full',
        backgroundColor: 'contrast',
        'style.color.text': '#ffffff',
      });

      expect(updated).toContain('"align":"full"');
      expect(updated).toContain('"backgroundColor":"contrast"');
      expect(updated).toContain('"style":{"color":{"text":"#ffffff"}}');
      expect(updated).toContain('alignfull');
      expect(updated).toContain('style="color:#ffffff"');
    });

    it('preserves nested/inner blocks and unrelated wrapper styles', () => {
      const rawBlock = [
        '<!-- wp:group {"align":"wide","fontSize":"medium","style":{"spacing":{"margin":{"top":"40px"}}}} -->',
        '<div class="wp-block-group alignwide has-medium-font-size" style="margin-top:40px;border:1px solid #ccc">',
        '<!-- wp:heading {"level":2} -->',
        '<h2>Nested Heading</h2>',
        '<!-- /wp:heading -->',
        '<!-- wp:paragraph -->',
        '<p>Nested paragraph text</p>',
        '<!-- /wp:paragraph -->',
        '</div>',
        '<!-- /wp:group -->',
      ].join('\n');

      const updated = applyPropertyPatchToBlock(rawBlock, {
        backgroundColor: '#0a0a0a',
        'style.spacing.padding': '24px',
      });

      // Target block comment attributes updated
      expect(updated).toContain('"style":{"spacing":{"margin":{"top":"40px"},"padding":"24px"}}');
      expect(updated).toContain('"backgroundColor":"#0a0a0a"');

      // Unrelated properties preserved
      expect(updated).toContain('"fontSize":"medium"');
      expect(updated).toContain('margin-top:40px');
      expect(updated).toContain('border:1px solid #ccc');
      expect(updated).toContain('padding:24px');
      expect(updated).toContain('background-color:#0a0a0a');

      // Nested child blocks completely preserved
      expect(updated).toContain('<!-- wp:heading {"level":2} -->');
      expect(updated).toContain('<h2>Nested Heading</h2>');
      expect(updated).toContain('<!-- wp:paragraph -->');
      expect(updated).toContain('<p>Nested paragraph text</p>');
    });
  });

  describe('proposeSectionEdit with propertyPatch', () => {
    it('updates only the targeted section while preserving sibling sections intact', () => {
      const fullPageContent = [
        '<!-- wp:group {"align":"full"} -->',
        '<div class="wp-block-group alignfull" id="hero"><h1>Hero Title</h1></div>',
        '<!-- /wp:group -->',
        '<!-- wp:group {"align":"wide"} -->',
        '<div class="wp-block-group alignwide" id="features"><p>Engineered for performance</p></div>',
        '<!-- /wp:group -->',
      ].join('\n');

      const result = proposeSectionEdit({
        fullContent: fullPageContent,
        sectionId: 'hero',
        propertyPatch: {
          backgroundColor: 'contrast',
        },
      });

      expect(result.sectionId).toBe('hero');
      expect(result.diff.before).toContain('id="hero"');
      expect(result.diff.after).toContain('"backgroundColor":"contrast"');

      // Sibling section (features) is completely untouched
      expect(result.updatedFullContent).toContain('id="features"><p>Engineered for performance</p>');
      expect(result.updatedFullContent).not.toContain('Update Features');
    });
  });
});

describe('Gutenberg section reorder', () => {
  it('preserves block attributes and inner blocks when reordering top-level sections', async () => {
    const { proposeSectionReorder } = await import('../src/section-editor');
    const content = [
      '<!-- wp:group {"align":"wide","backgroundColor":"contrast"} -->',
      '<div class="wp-block-group"><!-- wp:paragraph -->',
      '<p>Group content</p>',
      '<!-- /wp:paragraph --></div>',
      '<!-- /wp:group -->',
      '',
      '<!-- wp:cover {"align":"full"} -->',
      '<div class="wp-block-cover"><h1>Cover</h1></div>',
      '<!-- /wp:cover -->',
    ].join('\n\n');

    const result = proposeSectionReorder({ fullContent: content, sectionIds: ['sec_2', 'hero'] });
    expect(result.updatedFullContent).toContain('wp:cover');
    expect(result.updatedFullContent).toContain('wp:group');
    expect(result.updatedFullContent).toContain('Group content');
    expect(result.updatedFullContent).toContain('Cover');
    expect((result.updatedFullContent.match(/<!-- wp:/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('rejects duplicate sections', async () => {
    const { proposeSectionReorder } = await import('../src/section-editor');
    const content = [
      '<!-- wp:group -->',
      '<div></div>',
      '<!-- /wp:group -->',
      '',
      '<!-- wp:cover -->',
      '<div></div>',
      '<!-- /wp:cover -->',
    ].join('\n\n');
    expect(() => proposeSectionReorder({ fullContent: content, sectionIds: ['sec_1', 'sec_1'] })).toThrow(/duplicate/i);
  });

  it('rejects missing sections', async () => {
    const { proposeSectionReorder } = await import('../src/section-editor');
    const content = [
      '<!-- wp:group -->',
      '<div></div>',
      '<!-- /wp:group -->',
    ].join('\n\n');
    expect(() => proposeSectionReorder({ fullContent: content, sectionIds: ['sec_1', 'missing'] })).toThrow(/not found/i);
  });

  it('rejects partial reorder (must include all top-level sections)', async () => {
    const { proposeSectionReorder } = await import('../src/section-editor');
    const content = [
      '<!-- wp:group -->',
      '<div></div>',
      '<!-- /wp:group -->',
      '',
      '<!-- wp:cover -->',
      '<div></div>',
      '<!-- /wp:cover -->',
    ].join('\n\n');
    expect(() => proposeSectionReorder({ fullContent: content, sectionIds: ['hero'] })).toThrow(/exactly once/i);
  });
});

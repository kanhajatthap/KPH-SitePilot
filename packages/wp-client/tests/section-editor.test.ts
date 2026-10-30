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

describe('Gutenberg block parsing', () => {
  it('does not confuse prefixed nested block names with the outer block', async () => {
    const { extractTopLevelBlocks } = await import('../src/section-editor');
    const content = [
      '<!-- wp:query {"queryId":1} -->',
      '<div class="wp-block-query">',
      '<!-- wp:query-title {"type":"archive"} /-->',
      '<!-- wp:query-pagination -->',
      '<div class="wp-block-query-pagination"><!-- wp:query-pagination-previous /--></div>',
      '<!-- /wp:query-pagination -->',
      '</div>',
      '<!-- /wp:query -->',
      '<!-- wp:group -->',
      '<div><p>Group After Query</p></div>',
      '<!-- /wp:group -->',
    ].join('\n');

    const blocks = extractTopLevelBlocks(content);
    expect(blocks.map((b) => b.blockName)).toEqual(['query', 'group']);
    // The following group must not be swallowed by the query block.
    expect(blocks[0].rawBlock).not.toContain('Group After Query');
    expect(blocks[1].rawBlock).toContain('Group After Query');
  });

  it('records only the outermost block when names are identical and nested', async () => {
    const { extractTopLevelBlocks } = await import('../src/section-editor');
    const content = [
      '<!-- wp:group {"className":"outer"} -->',
      '<div class="wp-block-group outer">',
      '<!-- wp:group {"className":"inner"} -->',
      '<div class="wp-block-group inner"><p>Inner</p></div>',
      '<!-- /wp:group -->',
      '</div>',
      '<!-- /wp:group -->',
    ].join('\n');

    const blocks = extractTopLevelBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].blockName).toBe('group');
    expect(blocks[0].rawBlock).toContain('"className":"outer"');
    expect(blocks[0].rawBlock).toContain('"className":"inner"');
    expect(blocks[0].rawBlock).toContain('<p>Inner</p>');
  });

  it('keeps nested self-closing blocks inside their parent slice', async () => {
    const { extractTopLevelBlocks } = await import('../src/section-editor');
    const content = [
      '<!-- wp:group -->',
      '<div>',
      '<!-- wp:spacer {"height":20} /-->',
      '<p>Group body</p>',
      '</div>',
      '<!-- /wp:group -->',
      '<!-- wp:spacer {"height":40} /-->',
    ].join('\n');

    const blocks = extractTopLevelBlocks(content);
    expect(blocks.map((b) => b.blockName)).toEqual(['group', 'spacer']);
    expect(blocks[0].rawBlock).toContain('"height":20');
    expect(blocks[0].rawBlock).toContain('Group body');
    expect(blocks[1].rawBlock).toContain('"height":40');
  });

  it('degrades an unclosed top-level block to one slice instead of dropping content', async () => {
    const { extractTopLevelBlocks } = await import('../src/section-editor');
    const content = [
      '<!-- wp:group -->',
      '<div><p>Unclosed body</p></div>',
      '<!-- wp:paragraph -->',
      '<p>Still inside</p>',
      '<!-- /wp:paragraph -->',
    ].join('\n');

    const blocks = extractTopLevelBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].blockName).toBe('group');
    expect(blocks[0].rawBlock).toContain('Unclosed body');
    expect(blocks[0].rawBlock).toContain('Still inside');
  });

  it('assigns unique, stable ids regardless of section content', async () => {
    const { identifyPageSections } = await import('../src/section-editor');
    const content = [
      '<!-- wp:group -->',
      '<div><h1>Hero headline</h1><p>hero copy</p></div>',
      '<!-- /wp:group -->',
      '<!-- wp:group -->',
      '<div><p>hero metrics 99.9% latency</p></div>',
      '<!-- /wp:group -->',
      '<!-- wp:group -->',
      '<div><p>hero features zero-delay</p></div>',
      '<!-- /wp:group -->',
    ].join('\n');

    const sections = identifyPageSections(content);
    expect(sections.map((s) => s.id)).toEqual(['hero', 'sec_2', 'sec_3']);
    expect(new Set(sections.map((s) => s.id)).size).toBe(3);
    expect(sections.map((s) => s.name)).toEqual([
      'Hero Section',
      'Section 2 (group)',
      'Section 3 (group)',
    ]);
  });

  it('reorders a query page with following sections as distinct sections', async () => {
    const { proposeSectionReorder, identifyPageSections } = await import('../src/section-editor');
    const content = [
      '<!-- wp:query {"queryId":1} -->',
      '<div class="wp-block-query">',
      '<!-- wp:query-pagination -->',
      '<div class="wp-block-query-pagination">Pages</div>',
      '<!-- /wp:query-pagination -->',
      '</div>',
      '<!-- /wp:query -->',
      '<!-- wp:group -->',
      '<div><p>Trailing group</p></div>',
      '<!-- /wp:group -->',
    ].join('\n');

    const sections = identifyPageSections(content);
    expect(sections.map((s) => s.blockName)).toEqual(['query', 'group']);

    const result = proposeSectionReorder({ fullContent: content, sectionIds: ['sec_2', 'hero'] });
    expect(result.updatedFullContent.indexOf('wp:group')).toBeLessThan(
      result.updatedFullContent.indexOf('wp:query')
    );
    expect(result.updatedFullContent).toContain('Trailing group');
    expect(result.updatedFullContent).toContain('wp:query-pagination');
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

  describe('edge case hardening', () => {
    it('reorders very large pages (150 sections) successfully', async () => {
      const { proposeSectionReorder } = await import('../src/section-editor');
      const blocks: string[] = [];
      const sectionIds: string[] = [];
      // First top-level block is always identified as "hero"; later ones are sec_<n>
      for (let i = 0; i < 150; i++) {
        blocks.push('<!-- wp:group -->', '<div>Content ' + i + '</div>', '<!-- /wp:group -->', '');
        sectionIds.push(i === 0 ? 'hero' : 'sec_' + (i + 1));
      }
      const content = blocks.join('\n\n');

      // Reverse the order to exercise a real reorder at scale
      const reversed = [...sectionIds].reverse();
      const result = proposeSectionReorder({ fullContent: content, sectionIds: reversed });
      expect(result.sectionIds.length).toBe(150);
      expect(result.sectionIds).toEqual(reversed);
      expect(result.updatedFullContent).toContain('Content 0');
      expect(result.updatedFullContent).toContain('Content 149');
    });

    it('rejects pages with more than 200 sections with a helpful message', async () => {
      const { proposeSectionReorder } = await import('../src/section-editor');
      const blocks: string[] = [];
      const sectionIds: string[] = [];
      for (let i = 0; i < 201; i++) {
        blocks.push('<!-- wp:group -->', '<div>Content ' + i + '</div>', '<!-- /wp:group -->', '');
        sectionIds.push('sec_' + (i + 1));
      }
      const content = blocks.join('\n\n');
      expect(() => proposeSectionReorder({ fullContent: content, sectionIds })).toThrow(/more than 200 sections/i);
    });

    it('preserves HTML comments and whitespace separators between blocks', async () => {
      const { proposeSectionReorder } = await import('../src/section-editor');
      const content = [
        '<!-- wp:group -->',
        '<div>Section One Content</div>',
        '<!-- /wp:group -->',
        '\n\n<!-- separator-comment -->\n\n',
        '<!-- wp:cover -->',
        '<div>Cover Content</div>',
        '<!-- /wp:cover -->',
        '\t\n',
        '<!-- wp:columns -->',
        '<div>Columns Content</div>',
        '<!-- /wp:columns -->',
      ].join('\n\n');

      const result = proposeSectionReorder({
        fullContent: content,
        sectionIds: ['hero', 'sec_2', 'sec_3'],
      });

      expect(result.updatedFullContent).toContain('Section One Content');
      expect(result.updatedFullContent).toContain('Cover Content');
      expect(result.updatedFullContent).toContain('Columns Content');
      expect(result.updatedFullContent).toContain('<!-- separator-comment -->');
    });

    it('is byte-stable: an unchanged order is a no-op and the inverse order restores the original', async () => {
      const { proposeSectionReorder } = await import('../src/section-editor');
      const content = [
        '<!-- wp:group -->',
        '<div>Section One Content</div>',
        '<!-- /wp:group -->',
        '\n\t\n<!-- keep -->\n',
        '<!-- wp:cover -->',
        '<div>Cover Content</div>',
        '<!-- /wp:cover -->',
        '\n\n\n',
        '<!-- wp:paragraph -->',
        '<p>Three</p>',
        '<!-- /wp:paragraph -->',
        '\n<!-- trailing -->\n',
      ].join('\n\n');

      // Same order must not add, trim, or re-synthesize separators.
      const noop = proposeSectionReorder({
        fullContent: content,
        sectionIds: ['hero', 'sec_2', 'sec_3'],
      });
      expect(noop.updatedFullContent).toBe(content);

      // Reverse, then apply the same reversal to the new document: the original
      // file layout must come back byte-for-byte (no whitespace/comment drift).
      const reversedIds = ['sec_3', 'sec_2', 'hero'];
      const forward = proposeSectionReorder({ fullContent: content, sectionIds: reversedIds });
      expect(forward.updatedFullContent).not.toBe(content);

      const back = proposeSectionReorder({
        fullContent: forward.updatedFullContent,
        sectionIds: reversedIds,
      });
      expect(back.updatedFullContent).toBe(content);
    });

    it('preserves self-closing blocks during reorder', async () => {
      const { proposeSectionReorder } = await import('../src/section-editor');
      const content = [
        '<!-- wp:spacer {"height":30} /-->',
        '<!-- wp:group -->',
        '<div>Section content</div>',
        '<!-- /wp:group -->',
        '<!-- wp:spacer {"height":60} /-->',
      ].join('\n\n');

      const result = proposeSectionReorder({
        fullContent: content,
        sectionIds: ['sec_2', 'hero', 'sec_3'],
      });
      expect(result.updatedFullContent).toContain('"height":30');
      expect(result.updatedFullContent).toContain('"height":60');
      expect(result.updatedFullContent).toContain('Section content');
      // Group block moved to the front
      expect(result.updatedFullContent.indexOf('Section content')).toBeLessThan(
        result.updatedFullContent.indexOf('"height":30')
      );
    });

    it('preserves whitespace/comments in prefix and suffix', async () => {
      const { proposeSectionReorder } = await import('../src/section-editor');
      const content = [
        '<!-- preamble comment -->',
        '<!-- wp:group -->',
        '<div>Section One Content</div>',
        '<!-- /wp:group -->',
        '<!-- wp:cover -->',
        '<div>Cover Content</div>',
        '<!-- /wp:cover -->',
        '<!-- postamble comment -->',
      ].join('\n\n');

      const result = proposeSectionReorder({ fullContent: content, sectionIds: ['hero', 'sec_2'] });
      expect(result.updatedFullContent).toContain('<!-- preamble comment -->');
      expect(result.updatedFullContent).toContain('<!-- postamble comment -->');
    });

    it('preserves attributes and nested inner blocks exactly', async () => {
      const { proposeSectionReorder } = await import('../src/section-editor');
      const content = [
        '<!-- wp:group {"align":"wide","backgroundColor":"#ff0000","fontSize":"large"} -->',
        '<div class="wp-block-group alignwide"><h2>Title</h2><p>Content</p></div>',
        '<!-- /wp:group -->',
        '<!-- wp:columns {"align":"full"} -->',
        '<div class="wp-block-columns alignfull"><!-- wp:column -->',
        '<div class="wp-block-column"><p>Column 1</p></div>',
        '<!-- /wp:column --><!-- wp:column -->',
        '<div class="wp-block-column"><p>Column 2</p></div>',
        '<!-- /wp:column --></div>',
        '<!-- /wp:columns -->',
      ].join('\n\n');

      const result = proposeSectionReorder({ fullContent: content, sectionIds: ['sec_2', 'hero'] });
      expect(result.updatedFullContent).toContain('"backgroundColor":"#ff0000"');
      expect(result.updatedFullContent).toContain('"align":"full"');
      expect(result.updatedFullContent).toContain('Column 1');
      expect(result.updatedFullContent).toContain('Column 2');
      // Reordered: columns first, then group
      expect(result.updatedFullContent.indexOf('wp:columns')).toBeLessThan(
        result.updatedFullContent.indexOf('wp:group')
      );
    });

    it('rejects mixed content between blocks (raw HTML)', async () => {
      const { proposeSectionReorder } = await import('../src/section-editor');
      const content = [
        '<!-- wp:group -->',
        '<div>Section One Content</div>',
        '<!-- /wp:group -->',
        '<p>Raw HTML paragraph between blocks</p>',
        '<!-- wp:cover -->',
        '<div>Cover Content</div>',
        '<!-- /wp:cover -->',
      ].join('\n\n');

      expect(() =>
        proposeSectionReorder({ fullContent: content, sectionIds: ['hero', 'sec_2'] })
      ).toThrow(/not supported when non-whitespace/i);
    });
  });
});

import { Section } from '@wp-agent/contracts';

export interface GutenbergBlock {
  blockName: string;
  attrs: Record<string, unknown>;
  innerHtml: string;
  innerBlocks?: GutenbergBlock[];
}

/**
 * Parses raw Gutenberg HTML block comments into structured blocks, preserving unknown blocks.
 */
export function parseGutenbergBlocks(html: string): GutenbergBlock[] {
  const blocks: GutenbergBlock[] = [];
  // Regex matching Gutenberg block delimiters: <!-- wp:name {attributes} -->...<!-- /wp:name --> or void <!-- wp:name {attributes} /-->
  const blockRegex = /<!--\s+wp:([a-z0-9\/-]+)(?:\s+({[\s\S]*?}))?\s+(\/)?-->([\s\S]*?)(?:<!--\s+\/wp:\1\s+-->|$)/gi;

  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const rawName = match[1];
    const blockName = rawName.includes('/') ? rawName : `core/${rawName}`;
    let attrs: Record<string, unknown> = {};
    if (match[2]) {
      try {
        attrs = JSON.parse(match[2]);
      } catch {
        attrs = {};
      }
    }
    const isVoid = !!match[3];
    const innerHtml = isVoid ? '' : match[4] || '';

    blocks.push({
      blockName,
      attrs,
      innerHtml: innerHtml.trim(),
    });
  }

  // If content has text without block delimiters (classic content), preserve it as a core/freeform block
  if (blocks.length === 0 && html.trim()) {
    blocks.push({
      blockName: 'core/freeform',
      attrs: {},
      innerHtml: html.trim(),
    });
  }

  return blocks;
}

/**
 * Serializes Gutenberg blocks back into standard WordPress block comment markup.
 */
export function serializeGutenbergBlocks(blocks: GutenbergBlock[]): string {
  return blocks
    .map((b) => {
      const hasAttrs = Object.keys(b.attrs).length > 0;
      const attrStr = hasAttrs ? ` ${JSON.stringify(b.attrs)}` : '';

      if (!b.innerHtml && (!b.innerBlocks || b.innerBlocks.length === 0)) {
        return `<!-- wp:${b.blockName}${attrStr} /-->`;
      }

      const innerContent = b.innerBlocks && b.innerBlocks.length > 0
        ? serializeGutenbergBlocks(b.innerBlocks)
        : b.innerHtml;

      return `<!-- wp:${b.blockName}${attrStr} -->\n${innerContent}\n<!-- /wp:${b.blockName} -->`;
    })
    .join('\n\n');
}

/**
 * Converts a SitePlan section into standard WordPress Gutenberg blocks.
 */
export function convertSectionToGutenberg(section: Section): GutenbergBlock[] {
  const blocks: GutenbergBlock[] = [];

  if (section.type === 'hero') {
    blocks.push({
      blockName: 'core/heading',
      attrs: { level: 1, textAlign: 'center' },
      innerHtml: `<h1 class="has-text-align-center">${section.headline}</h1>`,
    });

    if (section.subheadline) {
      blocks.push({
        blockName: 'core/paragraph',
        attrs: { align: 'center', fontSize: 'medium' },
        innerHtml: `<p class="has-text-align-center has-medium-font-size">${section.subheadline}</p>`,
      });
    }

    if (section.callToAction) {
      blocks.push({
        blockName: 'core/buttons',
        attrs: { layout: { type: 'flex', justifyContent: 'center' } },
        innerHtml: `<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="${section.callToAction.href}">${section.callToAction.label}</a></div></div>`,
      });
    }
  } else if (section.type === 'features') {
    blocks.push({
      blockName: 'core/heading',
      attrs: { level: 2, textAlign: 'center' },
      innerHtml: `<h2 class="has-text-align-center">${section.headline}</h2>`,
    });

    if (section.items && section.items.length > 0) {
      const columnBlocks: GutenbergBlock[] = section.items.map((item) => ({
        blockName: 'core/column',
        attrs: {},
        innerHtml: `<div class="wp-block-column"><h3>${item.title}</h3><p>${item.description}</p></div>`,
      }));

      blocks.push({
        blockName: 'core/columns',
        attrs: {},
        innerHtml: '',
        innerBlocks: columnBlocks,
      });
    }
  } else {
    // Default heading + text blocks
    blocks.push({
      blockName: 'core/heading',
      attrs: { level: 2 },
      innerHtml: `<h2>${section.headline}</h2>`,
    });
    if (section.subheadline) {
      blocks.push({
        blockName: 'core/paragraph',
        attrs: {},
        innerHtml: `<p>${section.subheadline}</p>`,
      });
    }
  }

  return blocks;
}

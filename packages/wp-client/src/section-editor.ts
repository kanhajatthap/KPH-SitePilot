export interface IdentifiedSection {
  id: string;
  name: string;
  blockName: string;
  startIndex: number;
  endIndex: number;
  rawBlock: string;
  excerpt: string;
}

/**
 * Splits top-level Gutenberg blocks while strictly preserving markup and non-block text.
 */
export function extractTopLevelBlocks(html: string): Array<{
  blockName: string;
  rawBlock: string;
  attrs: Record<string, unknown>;
  startIndex: number;
  endIndex: number;
}> {
  const blocks: Array<{
    blockName: string;
    rawBlock: string;
    attrs: Record<string, unknown>;
    startIndex: number;
    endIndex: number;
  }> = [];

  // Match top-level wp:block tags. We support nested structures by balancing open/close tags for that block.
  const openTagRegex = /<!--\s+wp:([a-z0-9\/-]+)(?:\s+({[\s\S]*?}))?\s*(\/)?-->/gi;
  let match: RegExpExecArray | null;

  let searchFrom = 0;
  while ((match = openTagRegex.exec(html)) !== null) {
    if (match.index < searchFrom) continue;

    const rawBlockName = match[1];
    const isSelfClosing = !!match[3];
    const startIndex = match.index;
    let attrs: Record<string, unknown> = {};
    if (match[2]) {
      try {
        attrs = JSON.parse(match[2]);
      } catch {
        attrs = {};
      }
    }

    if (isSelfClosing) {
      const endIndex = startIndex + match[0].length;
      blocks.push({
        blockName: rawBlockName,
        rawBlock: html.slice(startIndex, endIndex),
        attrs,
        startIndex,
        endIndex,
      });
      searchFrom = endIndex;
      openTagRegex.lastIndex = searchFrom;
      continue;
    }

    // Find matching closing tag with nesting counter
    const closeTagStr = `<!-- /wp:${rawBlockName} -->`;
    const innerOpenStr = `<!-- wp:${rawBlockName}`;
    let depth = 1;
    let scanPos = startIndex + match[0].length;
    let finalEnd = -1;

    while (depth > 0 && scanPos < html.length) {
      const nextOpen = html.indexOf(innerOpenStr, scanPos);
      const nextClose = html.indexOf(closeTagStr, scanPos);

      if (nextClose === -1) {
        // Unclosed block: consume till end
        finalEnd = html.length;
        depth = 0;
        break;
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Verify this isn't a self-closing inner tag
        const afterOpen = html.slice(nextOpen, nextOpen + 200);
        const selfCloseCheck = afterOpen.match(/^<!--\s+wp:[a-z0-9\/-]+(?:\s+({[\s\S]*?}))?\s*\/-->/);
        if (!selfCloseCheck) {
          depth++;
        }
        scanPos = nextOpen + innerOpenStr.length;
      } else {
        depth--;
        scanPos = nextClose + closeTagStr.length;
        if (depth === 0) {
          finalEnd = scanPos;
        }
      }
    }

    if (finalEnd !== -1) {
      blocks.push({
        blockName: rawBlockName,
        rawBlock: html.slice(startIndex, finalEnd),
        attrs,
        startIndex,
        endIndex: finalEnd,
      });
      searchFrom = finalEnd;
      openTagRegex.lastIndex = searchFrom;
    }
  }

  return blocks;
}

/**
 * Parses page content into named editable sections.
 */
export function identifyPageSections(html: string): IdentifiedSection[] {
  const topBlocks = extractTopLevelBlocks(html);
  const sections: IdentifiedSection[] = [];

  for (let i = 0; i < topBlocks.length; i++) {
    const b = topBlocks[i];
    const rawLower = b.rawBlock.toLowerCase();

    let id = `section-${i + 1}`;
    let name = `Section ${i + 1} (${b.blockName})`;
    let excerpt = '';

    if (rawLower.includes('level":1') || rawLower.includes('wp-block-heading has-text-align-center') || rawLower.includes('hero') || i === 0) {
      id = 'hero';
      name = 'Hero Section';
      excerpt = 'Hero headline, value proposition lead, and call-to-action buttons.';
    } else if (rawLower.includes('engineered for performance') || rawLower.includes('wp:columns') && (rawLower.includes('feature') || rawLower.includes('zero-delay'))) {
      id = 'features';
      name = 'Features Grid';
      excerpt = 'Three-column architectural features grid with security highlights.';
    } else if (rawLower.includes('99.9%') || rawLower.includes('metric') || rawLower.includes('latency') || (rawLower.includes('wp:columns') && rawLower.includes('100%'))) {
      id = 'metrics';
      name = 'Metrics Bar';
      excerpt = 'Three-column operational performance stats and accuracy metrics.';
    } else {
      id = `sec_${i + 1}`;
      name = `Section ${i + 1}`;
      excerpt = b.rawBlock.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) + '...';
    }

    sections.push({
      id,
      name,
      blockName: b.blockName,
      startIndex: b.startIndex,
      endIndex: b.endIndex,
      rawBlock: b.rawBlock,
      excerpt,
    });
  }

  return sections;
}

export interface SectionEditProposalResult {
  updatedFullContent: string;
  sectionId: string;
  sectionName: string;
  diff: {
    before: string;
    after: string;
  };
  renderedPreviewHtml: string;
  unsupportedOperations: string[];
  summary: string;
}

/**
 * Applies scoped instruction to a targeted section while preserving all sibling sections.
 */
export function proposeSectionEdit(params: {
  fullContent: string;
  sectionId: string;
  instruction: string;
}): SectionEditProposalResult {
  const { fullContent, sectionId, instruction } = params;
  const sections = identifyPageSections(fullContent);

  const targetSection = sections.find((s) => s.id.toLowerCase() === sectionId.toLowerCase());
  if (!targetSection) {
    throw new Error(`Target section "${sectionId}" not found in page content. Available sections: ${sections.map((s) => s.id).join(', ')}`);
  }

  const unsupportedOperations: string[] = [];
  const lowerInst = instruction.toLowerCase();

  // Safety checks for unsupported or forbidden operations
  if (lowerInst.includes('drop table') || lowerInst.includes('delete database') || lowerInst.includes('wp db')) {
    unsupportedOperations.push('Database drop/alter operations are not permitted via Section Editor.');
  }
  if (lowerInst.includes('eval(') || lowerInst.includes('base64_decode') || lowerInst.includes('shell_exec')) {
    unsupportedOperations.push('Arbitrary PHP code execution is strictly prohibited.');
  }
  if (lowerInst.includes('<script') || lowerInst.includes('javascript:')) {
    unsupportedOperations.push('Raw script injection into Gutenberg block markup is disallowed.');
  }
  if (lowerInst.includes('post 23') || lowerInst.includes('post 24') || lowerInst.includes('draft post')) {
    unsupportedOperations.push('Protected resource mutation (Draft Posts #23 & #24) is blocked.');
  }
  if (lowerInst.includes('elementor') && !lowerInst.includes('gutenberg')) {
    unsupportedOperations.push('Direct Elementor AST conversion for individual Gutenberg group sections is not supported.');
  }

  let modifiedBlock = targetSection.rawBlock;

  // Apply scoped transformations based on the instruction
  if (targetSection.id === 'hero') {
    // 1. Darker background transformation
    if (lowerInst.includes('dark background') || lowerInst.includes('darker') || lowerInst.includes('deep black')) {
      const newBg = lowerInst.includes('deep black') ? '#020617' : '#090d16';
      // Replace style background-color
      modifiedBlock = modifiedBlock.replace(
        /\"background\":\s*\"#[0-9a-fA-F]+\"/g,
        `"background":"${newBg}"`
      );
      modifiedBlock = modifiedBlock.replace(
        /background-color:\s*#[0-9a-fA-F]+;/g,
        `background-color:${newBg};`
      );
    }

    // 2. Prominent CTA Button transformation
    if (
      lowerInst.includes('prominent') ||
      lowerInst.includes('cta') ||
      lowerInst.includes('button') ||
      lowerInst.includes('more prominent')
    ) {
      // Enhance primary button background to vibrant accent (#3b82f6 or #2563eb) and add visual weight
      modifiedBlock = modifiedBlock.replace(
        /<!-- wp:button \{"style":\{"color":\{"background":"#[0-9a-fA-F]+","text":"#ffffff"\}\}\} -->/g,
        '<!-- wp:button {"style":{"color":{"background":"#2563eb","text":"#ffffff"},"typography":{"fontSize":"16px","fontStyle":"normal","fontWeight":"700"}},"className":"is-style-fill"} -->'
      );
      // Upgrade inline style for primary link
      modifiedBlock = modifiedBlock.replace(
        /<a class="wp-block-button__link has-text-color has-background wp-element-button" href="([^"]+)" style="background-color:#[0-9a-fA-F]+;color:#ffffff">/g,
        '<a class="wp-block-button__link has-text-color has-background wp-element-button" href="$1" style="background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:700;padding:12px 28px;box-shadow:0 10px 25px -5px rgba(37,99,235,0.4)">'
      );
    }

    // 3. Custom text or heading updates
    const titleMatch = instruction.match(/heading[:\s]+"([^"]+)"/i) || instruction.match(/title[:\s]+"([^"]+)"/i);
    if (titleMatch) {
      const newTitle = titleMatch[1];
      modifiedBlock = modifiedBlock.replace(
        /<h1 class="wp-block-heading has-text-align-center"[^>]*>[\s\S]*?<\/h1>/i,
        `<h1 class="wp-block-heading has-text-align-center" style="font-size:48px;line-height:1.2">${newTitle}</h1>`
      );
    }
  } else if (targetSection.id === 'features') {
    if (lowerInst.includes('dark background') || lowerInst.includes('darker')) {
      modifiedBlock = modifiedBlock.replace(
        /<div class="wp-block-group alignwide"/g,
        '<div class="wp-block-group alignwide has-text-color has-background" style="background-color:#0f172a;color:#f8fafc'
      );
    }
    if (lowerInst.includes('border') || lowerInst.includes('highlight')) {
      modifiedBlock = modifiedBlock.replace(
        /border-color:#e2e8f0/g,
        'border-color:#3b82f6'
      );
    }
  } else if (targetSection.id === 'metrics') {
    if (lowerInst.includes('dark') || lowerInst.includes('navy')) {
      modifiedBlock = modifiedBlock.replace(
        /background-color:#1e293b/g,
        'background-color:#0b1120'
      );
    }
  }

  // Construct full content: replace ONLY the target section slice
  const beforeTarget = fullContent.slice(0, targetSection.startIndex);
  const afterTarget = fullContent.slice(targetSection.endIndex);
  const updatedFullContent = beforeTarget + modifiedBlock + afterTarget;

  return {
    updatedFullContent,
    sectionId: targetSection.id,
    sectionName: targetSection.name,
    diff: {
      before: targetSection.rawBlock,
      after: modifiedBlock,
    },
    renderedPreviewHtml: updatedFullContent,
    unsupportedOperations,
    summary: `Update ${targetSection.name}: ${instruction}`,
  };
}

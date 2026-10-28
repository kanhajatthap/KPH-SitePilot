export interface IdentifiedSection {
  id: string;
  name: string;
  blockName: string;
  attributes: Record<string, string | number | boolean>;
  startIndex: number;
  endIndex: number;
  rawBlock: string;
  excerpt: string;
}

const INSPECTABLE_ATTRIBUTE_KEYS = [
  'align',
  'anchor',
  'backgroundColor',
  'textColor',
  'fontSize',
  'className',
  'level',
  'url',
  'alt',
  'width',
  'height',
  'layout',
] as const;

const INSPECTABLE_STYLE_KEYS = {
  color: ['background', 'text'],
  typography: ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing'],
  spacing: ['margin', 'padding', 'blockGap', 'columnGap', 'rowGap'],
} as const;

function isInspectableValue(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (typeof value === 'string' && value.trim().length > 0)
  );
}

function addInspectableAttribute(
  target: Record<string, string | number | boolean>,
  key: string,
  value: unknown
): void {
  if (!isInspectableValue(value)) return;
  target[key] = typeof value === 'string' ? value.slice(0, 160) : value;
}

export function extractInspectableBlockAttributes(
  attributes: Record<string, unknown>
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};

  for (const key of INSPECTABLE_ATTRIBUTE_KEYS) {
    addInspectableAttribute(result, key, attributes[key]);
  }

  const style = attributes.style;
  if (!style || typeof style !== 'object' || Array.isArray(style)) return result;

  const styleRecord = style as Record<string, unknown>;
  for (const [group, keys] of Object.entries(INSPECTABLE_STYLE_KEYS)) {
    const values = styleRecord[group];
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;

    const valueRecord = values as Record<string, unknown>;
    for (const key of keys) {
      addInspectableAttribute(result, `style.${group}.${key}`, valueRecord[key]);
    }
  }

  return result;
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
      attributes: extractInspectableBlockAttributes(b.attrs),
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

const ALLOWED_ALIGN_VALUES = new Set(['none', 'wide', 'full', 'center', 'left', 'right']);
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ALLOWED_PRESET_COLORS = new Set([
  'primary', 'secondary', 'contrast', 'base', 'black', 'white',
  'cyan-bluish-gray', 'pale-pink', 'vivid-red', 'luminous-vivid-orange',
  'luminous-vivid-amber', 'light-green-cyan', 'vivid-green-cyan',
  'pale-cyan-blue', 'vivid-cyan-blue', 'vivid-purple'
]);
const ALLOWED_FONT_SIZES = new Set(['small', 'medium', 'large', 'x-large', 'xx-large']);
const PIXEL_FONT_SIZE_REGEX = /^(?:[1-5][0-9]|6[0-4]|12|13|14|15|16|17|18|19)px$/i;
const SAFE_SPACING_REGEX = /^(?:0|\d{1,2}(?:\.\d+)?(?:px|rem|em|%))$/i;

/**
 * Validates and normalizes an allow-listed property patch for a Gutenberg block.
 * Throws an Error if any unsupported key or invalid value is provided.
 */
export function validatePropertyPatch(
  patch: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  const normalized: Record<string, string | number | boolean> = {};

  for (const [rawKey, rawValue] of Object.entries(patch)) {
    const key = rawKey.trim();
    if (typeof rawValue !== 'string') {
      throw new Error(`Invalid value for "${key}": must be a string.`);
    }
    const val = rawValue.trim();

    // 1. Alignment
    if (key === 'align') {
      const lower = val.toLowerCase();
      if (!ALLOWED_ALIGN_VALUES.has(lower)) {
        throw new Error(`Invalid align value "${val}". Must be one of: ${[...ALLOWED_ALIGN_VALUES].join(', ')}`);
      }
      normalized['align'] = lower === 'none' ? '' : lower;
      continue;
    }

    // 2. Background color
    if (key === 'backgroundColor' || key === 'style.color.background') {
      if (HEX_COLOR_REGEX.test(val)) {
        normalized[key] = val;
      } else if (ALLOWED_PRESET_COLORS.has(val.toLowerCase())) {
        normalized[key] = val.toLowerCase();
      } else {
        throw new Error(`Invalid background color "${val}". Must be a valid hex color (#RRGGBB) or approved preset.`);
      }
      continue;
    }

    // 3. Text color
    if (key === 'textColor' || key === 'style.color.text') {
      if (HEX_COLOR_REGEX.test(val)) {
        normalized[key] = val;
      } else if (ALLOWED_PRESET_COLORS.has(val.toLowerCase())) {
        normalized[key] = val.toLowerCase();
      } else {
        throw new Error(`Invalid text color "${val}". Must be a valid hex color (#RRGGBB) or approved preset.`);
      }
      continue;
    }

    // 4. Font size
    if (key === 'fontSize' || key === 'style.typography.fontSize') {
      if (PIXEL_FONT_SIZE_REGEX.test(val) || ALLOWED_FONT_SIZES.has(val.toLowerCase())) {
        normalized[key] = val;
      } else {
        throw new Error(`Invalid font size "${val}". Must be a preset (small, medium, large, x-large) or 12px-64px.`);
      }
      continue;
    }

    // 5. Spacing: padding / margin
    if (key === 'style.spacing.padding' || key === 'style.spacing.margin') {
      if (!SAFE_SPACING_REGEX.test(val)) {
        throw new Error(`Invalid spacing value "${val}" for "${key}". Must be a valid CSS value (e.g. 16px, 1.5rem).`);
      }
      normalized[key] = val;
      continue;
    }

    throw new Error(`Unsupported editable attribute "${key}". Inspector edits are restricted to align, colors, font size, and spacing.`);
  }

  return normalized;
}

/**
 * Applies an allow-listed property patch directly to a Gutenberg block markup.
 */
export function applyPropertyPatchToBlock(
  rawBlock: string,
  patch: Record<string, string | number | boolean>
): string {
  const validatedPatch = validatePropertyPatch(patch);
  if (Object.keys(validatedPatch).length === 0) return rawBlock;

  // Top-level block opening comment: <!-- wp:name {"attr":"val"} -->
  const blockCommentRegex = /^<!--\s+wp:([a-z0-9\/-]+)(?:\s+({[\s\S]*?}))?\s*(\/)?-->/i;
  const match = blockCommentRegex.exec(rawBlock);
  if (!match) return rawBlock;

  const blockName = match[1];
  const isSelfClosing = Boolean(match[3]);
  let attrs: Record<string, any> = {};
  if (match[2]) {
    try {
      attrs = JSON.parse(match[2]);
    } catch {
      attrs = {};
    }
  }

  // Apply properties to attrs
  for (const [key, val] of Object.entries(validatedPatch)) {
    if (key === 'align') {
      if (val === '') {
        delete attrs.align;
      } else {
        attrs.align = val;
      }
    } else if (key === 'backgroundColor') {
      attrs.backgroundColor = val;
    } else if (key === 'textColor') {
      attrs.textColor = val;
    } else if (key === 'fontSize') {
      attrs.fontSize = val;
    } else if (key === 'style.color.background') {
      attrs.style = attrs.style || {};
      attrs.style.color = attrs.style.color || {};
      attrs.style.color.background = val;
    } else if (key === 'style.color.text') {
      attrs.style = attrs.style || {};
      attrs.style.color = attrs.style.color || {};
      attrs.style.color.text = val;
    } else if (key === 'style.typography.fontSize') {
      attrs.style = attrs.style || {};
      attrs.style.typography = attrs.style.typography || {};
      attrs.style.typography.fontSize = val;
    } else if (key === 'style.spacing.padding') {
      attrs.style = attrs.style || {};
      attrs.style.spacing = attrs.style.spacing || {};
      attrs.style.spacing.padding = val;
    } else if (key === 'style.spacing.margin') {
      attrs.style = attrs.style || {};
      attrs.style.spacing = attrs.style.spacing || {};
      attrs.style.spacing.margin = val;
    }
  }

  const newComment = `<!-- wp:${blockName} ${JSON.stringify(attrs)} ${isSelfClosing ? '/-->' : '-->'}`;
  let updatedBlock = newComment + rawBlock.slice(match[0].length);

  // Update HTML container classes / inline style on the root wrapper tag if present
  // Find first opening HTML tag after the wp comment
  const htmlTagMatch = updatedBlock.slice(newComment.length).match(/^(\s*)(<[a-z0-9-]+)(\s+[^>]*)?(>)/i);
  if (htmlTagMatch) {
    const whitespace = htmlTagMatch[1];
    const tagName = htmlTagMatch[2];
    let attributesStr = htmlTagMatch[3] || '';
    const closingBracket = htmlTagMatch[4];

    // Align class update
    if (validatedPatch['align'] !== undefined) {
      const alignVal = validatedPatch['align'];
      attributesStr = attributesStr.replace(/\b(alignwide|alignfull|aligncenter|alignleft|alignright)\b/g, '').trim();
      if (alignVal && alignVal !== 'none') {
        const alignClass = `align${alignVal}`;
        const classMatch = attributesStr.match(/class="([^"]*)"/i);
        if (classMatch) {
          attributesStr = attributesStr.replace(/class="([^"]*)"/i, `class="${classMatch[1].trim()} ${alignClass}"`);
        } else {
          attributesStr = ` class="${alignClass}"` + attributesStr;
        }
      }
    }

    // Inline background color & text color
    const bgColor = validatedPatch['style.color.background'] !== undefined
      ? String(validatedPatch['style.color.background'])
      : (validatedPatch['backgroundColor'] !== undefined ? String(validatedPatch['backgroundColor']) : undefined);
    const textColor = validatedPatch['style.color.text'] !== undefined
      ? String(validatedPatch['style.color.text'])
      : (validatedPatch['textColor'] !== undefined ? String(validatedPatch['textColor']) : undefined);
    const padding = validatedPatch['style.spacing.padding'] !== undefined
      ? String(validatedPatch['style.spacing.padding'])
      : undefined;

    if (bgColor || textColor || padding) {
      const styleMatch = attributesStr.match(/style="([^"]*)"/i);
      let existingStyles = styleMatch ? styleMatch[1].split(';').map((s) => s.trim()).filter(Boolean) : [];
      if (bgColor && bgColor.startsWith('#')) {
        existingStyles = existingStyles.filter((s) => !s.startsWith('background-color:'));
        existingStyles.push(`background-color:${bgColor}`);
      }
      if (textColor && textColor.startsWith('#')) {
        existingStyles = existingStyles.filter((s) => !s.startsWith('color:'));
        existingStyles.push(`color:${textColor}`);
      }
      if (padding) {
        existingStyles = existingStyles.filter((s) => !s.startsWith('padding:'));
        existingStyles.push(`padding:${padding}`);
      }
      const newStyleAttr = `style="${existingStyles.join(';')}"`;
      if (styleMatch) {
        attributesStr = attributesStr.replace(/style="([^"]*)"/i, newStyleAttr);
      } else {
        attributesStr = ` ${newStyleAttr}` + attributesStr;
      }
    }

    const replacementTag = `${whitespace}${tagName}${attributesStr}${closingBracket}`;
    updatedBlock = newComment + replacementTag + updatedBlock.slice(newComment.length + htmlTagMatch[0].length);
  }

  return updatedBlock;
}

/**
 * Applies scoped instruction or property patch to a targeted section while preserving all sibling sections.
 */
export function proposeSectionEdit(params: {
  fullContent: string;
  sectionId: string;
  instruction?: string;
  propertyPatch?: Record<string, string | number | boolean>;
}): SectionEditProposalResult {
  const { fullContent, sectionId, instruction = '', propertyPatch } = params;
  const sections = identifyPageSections(fullContent);

  const targetSection = sections.find((s) => s.id.toLowerCase() === sectionId.toLowerCase());
  if (!targetSection) {
    throw new Error(`Target section "${sectionId}" not found in page content. Available sections: ${sections.map((s) => s.id).join(', ')}`);
  }

  const unsupportedOperations: string[] = [];

  let modifiedBlock = targetSection.rawBlock;

  // 1. If propertyPatch is supplied, apply exact attribute modifications
  if (propertyPatch && Object.keys(propertyPatch).length > 0) {
    modifiedBlock = applyPropertyPatchToBlock(targetSection.rawBlock, propertyPatch);
  } else {
    // 2. Otherwise fall back to instruction-based transform
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

    if (targetSection.id === 'hero') {
      if (lowerInst.includes('dark background') || lowerInst.includes('darker') || lowerInst.includes('deep black')) {
        const newBg = lowerInst.includes('deep black') ? '#020617' : '#090d16';
        modifiedBlock = modifiedBlock.replace(
          /\"background\":\s*\"#[0-9a-fA-F]+\"/g,
          `"background":"${newBg}"`
        );
        modifiedBlock = modifiedBlock.replace(
          /background-color:\s*#[0-9a-fA-F]+;/g,
          `background-color:${newBg};`
        );
      }
      if (
        lowerInst.includes('prominent') ||
        lowerInst.includes('cta') ||
        lowerInst.includes('button') ||
        lowerInst.includes('more prominent')
      ) {
        modifiedBlock = modifiedBlock.replace(
          /<!-- wp:button \{"style":\{"color":\{"background":"#[0-9a-fA-F]+","text":"#ffffff"\}\}\} -->/g,
          '<!-- wp:button {"style":{"color":{"background":"#2563eb","text":"#ffffff"},"typography":{"fontSize":"16px","fontStyle":"normal","fontWeight":"700"}},"className":"is-style-fill"} -->'
        );
        modifiedBlock = modifiedBlock.replace(
          /<a class="wp-block-button__link has-text-color has-background wp-element-button" href="([^"]+)" style="background-color:#[0-9a-fA-F]+;color:#ffffff">/g,
          '<a class="wp-block-button__link has-text-color has-background wp-element-button" href="$1" style="background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:700;padding:12px 28px;box-shadow:0 10px 25px -5px rgba(37,99,235,0.4)">'
        );
      }
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
  }

  // Construct full content: replace ONLY the target section slice
  const beforeTarget = fullContent.slice(0, targetSection.startIndex);
  const afterTarget = fullContent.slice(targetSection.endIndex);
  const updatedFullContent = beforeTarget + modifiedBlock + afterTarget;

  const summary = propertyPatch && Object.keys(propertyPatch).length > 0
    ? `Update ${targetSection.name} properties: ${Object.entries(propertyPatch).map(([k, v]) => `${k}=${v}`).join(', ')}`
    : `Update ${targetSection.name}: ${instruction}`;

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
    summary,
  };
}

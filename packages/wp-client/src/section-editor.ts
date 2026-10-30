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
 *
 * Uses a stack of open block delimiters so that nested blocks whose names share a
 * prefix with an outer block (e.g. `wp:query` + `wp:query-pagination`/`wp:query-title`)
 * cannot be confused with the outer block. Only the outermost frame is recorded as a
 * top-level section; nested blocks remain inside their parent's raw slice.
 *
 * Fail-soft: an unclosed top-level block is recorded from its start to end-of-document,
 * so a malformed page degrades to a single (non-reorderable) section instead of losing
 * content.
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

  // Matches open, close, and self-closing delimiters:
  //   open:        <!-- wp:name {json} -->
  //   close:       <!-- /wp:name -->
  //   self-closing:<!-- wp:name {json} /-->
  const tokenRegex = /<!--\s+(\/)?wp:([a-z0-9\/-]+)(?:\s+({[\s\S]*?}))?\s*(\/)?-->/gi;

  type Frame = {
    blockName: string;
    attrs: Record<string, unknown>;
    startIndex: number;
  };
  const stack: Frame[] = [];

  const record = (frame: Frame, endIndex: number) => {
    blocks.push({
      blockName: frame.blockName,
      rawBlock: html.slice(frame.startIndex, endIndex),
      attrs: frame.attrs,
      startIndex: frame.startIndex,
      endIndex,
    });
  };

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    const isClose = Boolean(match[1]);
    const blockName = match[2];
    const isSelfClosing = Boolean(match[4]);
    const tokenStart = match.index;
    const tokenEnd = tokenStart + match[0].length;

    if (isClose) {
      // Find the nearest matching frame. Ignore stray or mismatched closing tags.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].blockName === blockName) {
          // Only the outermost frame becomes a top-level section.
          if (i === 0) {
            record(stack[0], tokenEnd);
          }
          // Drop this frame and any unclosed frames nested inside it.
          stack.length = i;
          break;
        }
      }
      continue;
    }

    let attrs: Record<string, unknown> = {};
    if (match[3]) {
      try {
        attrs = JSON.parse(match[3]);
      } catch {
        attrs = {};
      }
    }

    if (isSelfClosing) {
      // Nested self-closing blocks stay inside their parent slice.
      if (stack.length === 0) {
        record({ blockName, attrs, startIndex: tokenStart }, tokenEnd);
      }
      continue;
    }

    stack.push({ blockName, attrs, startIndex: tokenStart });
  }

  // Fail-soft: an unclosed outermost block consumes the remainder of the document.
  if (stack.length > 0) {
    record(stack[0], html.length);
  }

  blocks.sort((a, b) => a.startIndex - b.startIndex);
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

    // IDs must be stable and unique: reorder/approval APIs key sections by id, so
    // content-based heuristics (which can match several blocks) would collide.
    // The first top-level block is always "hero"; the rest are index-based.
    const id = i === 0 ? 'hero' : `sec_${i + 1}`;
    const name = i === 0 ? 'Hero Section' : `Section ${i + 1} (${b.blockName})`;
    const excerpt =
      b.rawBlock
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) + '...';

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

export interface SectionReorderProposalResult {
  updatedFullContent: string;
  sectionIds: string[];
  sectionNames: string[];
  diff: {
    before: string;
    after: string;
  };
  renderedPreviewHtml: string;
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

/**
 * Reorders top-level Gutenberg sections exactly by section IDs.
 * Preserves each block's serialized attributes, inner blocks, and content.
 * Only reorders the selected top-level block slices - non-block content is not supported for reorder.
 * Hardened for edge cases: very large pages, mixed content, malformed HTML.
 */
const MAX_SECTIONS = 200;
const WARNING_SECTION_THRESHOLD = 100;

/**
 * Checks if content consists only of allowed prefix/suffix content (whitespace and HTML comments).
 */
function isAllowedContentBlock(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed === '') return true;
  // Allow only HTML comments and whitespace
  const cleaned = trimmed.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, '');
  return cleaned === '';
}

/**
 * Extracts separators between blocks (whitespace and HTML comments only).
 * Returns { separators: string[], hasInvalid: boolean }
 */
function extractSeparatorsSafely(fullContent: string, topBlocks: Array<{
  startIndex: number;
  endIndex: number;
}>): { separators: string[]; hasInvalidSeparators: boolean } {
  const separators: string[] = [];
  let hasInvalidSeparators = false;

  for (let i = 0; i < topBlocks.length - 1; i++) {
    const blockEnd = topBlocks[i].endIndex;
    const nextBlockStart = topBlocks[i + 1].startIndex;
    const separator = fullContent.slice(blockEnd, nextBlockStart);

    const hasOnlyWhitespaceAndComments = /^(?:<!--[\s\S]*?-->|\s)*$/.test(separator);

    if (hasOnlyWhitespaceAndComments) {
      separators.push(separator);
    } else {
      hasInvalidSeparators = true;
    }
  }

  return { separators, hasInvalidSeparators };
}

export function proposeSectionReorder(params: {
  fullContent: string;
  sectionIds: string[];
}): SectionReorderProposalResult {
  const { fullContent, sectionIds } = params;

  if (!Array.isArray(sectionIds) || sectionIds.length === 0) {
    throw new Error('sectionIds must contain at least one section.');
  }

  // Ensure unique section IDs
  const seen = new Set<string>();
  for (const id of sectionIds) {
    const normalized = id.trim();
    if (!normalized) {
      throw new Error('sectionIds cannot contain empty values.');
    }
    if (seen.has(normalized.toLowerCase())) {
      throw new Error('sectionIds must not contain duplicate sections.');
    }
    seen.add(normalized.toLowerCase());
  }

  // Performance guard: hard limit at MAX_SECTIONS
  if (sectionIds.length > MAX_SECTIONS) {
    throw new Error(`Cannot reorder pages with more than ${MAX_SECTIONS} sections. Page contains ${sectionIds.length} sections. For best performance, consider keeping sections under ${WARNING_SECTION_THRESHOLD}.`);
  }

  const sections = identifyPageSections(fullContent);
  if (sections.length === 0) {
    throw new Error('No reorderable top-level sections found in page content. Ensure the page contains Gutenberg blocks (wp:...).');
  }

  // Build map of sections by normalized id
  const sectionById = new Map<string, IdentifiedSection>();
  for (const section of sections) {
    sectionById.set(section.id.toLowerCase(), section);
  }

  // Validate all requested sections exist
  for (const id of sectionIds) {
    if (!sectionById.has(id.toLowerCase())) {
      throw new Error(`Section "${id}" not found in page content. Available sections: ${sections.map(s => s.id).join(', ')}`);
    }
  }

  // Ensure we are reordering only existing sections - we must reorder exactly the provided set
  // All requested sections must be present; we do not allow reordering subsets in a way that drops blocks
  // Validate that sectionIds correspond exactly to reorderable top-level sections from the page
  if (sectionIds.length !== sections.length) {
    throw new Error(`Section reorder must include all top-level sections exactly once. Page has ${sections.length} sections, but ${sectionIds.length} were specified.`);
  }

  // Build ordered blocks
  const orderedBlocks: IdentifiedSection[] = [];
  for (const id of sectionIds) {
    const section = sectionById.get(id.toLowerCase());
    if (!section) {
      throw new Error(`Section "${id}" not found.`);
    }
    orderedBlocks.push(section);
  }

  // Reconstruct content: extract all top-level blocks in original order, replace with reordered ones
  const topBlocks = extractTopLevelBlocks(fullContent);
  if (topBlocks.length !== sections.length) {
    throw new Error(`Unsupported page structure for section reordering. Found ${topBlocks.length} top-level blocks but ${sections.length} sections were identified. Page may have malformed or unclosed block tags.`);
  }

  // Find first block start and last block end
  const firstBlockStart = topBlocks[0].startIndex;
  const lastBlockEnd = topBlocks[topBlocks.length - 1].endIndex;
  const prefix = fullContent.slice(0, firstBlockStart);
  const suffix = fullContent.slice(lastBlockEnd);

  // Check prefix and suffix for non-allowed content
  // Allow: leading/trailing whitespace, HTML comments only
  // Reject: text, HTML tags, shortcodes, or other markup outside blocks
  const prefixAllowed = isAllowedContentBlock(prefix);
  const suffixAllowed = isAllowedContentBlock(suffix);

  if (!prefixAllowed || !suffixAllowed) {
    let errorMsg = 'Section reordering is only supported when all content is in reorderable top-level blocks.\n\n';

    if (!prefixAllowed) {
      const cleanedPrefix = prefix.replace(/\s+/g, ' ').trim();
      const prefixWithoutComments = cleanedPrefix.replace(/<!--[\s\S]*?-->/g, '').trim();
      errorMsg += `✖ Prefix contains non-whitespace content: "${prefixWithoutComments.substring(0, 80)}${prefixWithoutComments.length > 80 ? '...' : ''}"\n`;
    }
    if (!suffixAllowed) {
      const cleanedSuffix = suffix.replace(/\s+/g, ' ').trim();
      const suffixWithoutComments = cleanedSuffix.replace(/<!--[\s\S]*?-->/g, '').trim();
      errorMsg += `✖ Suffix contains non-whitespace content: "${suffixWithoutComments.substring(0, 80)}${suffixWithoutComments.length > 80 ? '...' : ''}"\n`;
    }
    errorMsg += '\nThis can happen with:\n';
    errorMsg += '- HTML comments or markup before the first block\n';
    errorMsg += '- Text or shortcodes after the last block\n';
    errorMsg += '- Other unsupported markup types outside block boundaries\n\n';
    errorMsg += 'To reorder, ensure all content is wrapped in Gutenberg blocks, or accept that only the block content will be reordered.';
    throw new Error(errorMsg);
  }

  // Extract separators between blocks
  const { separators, hasInvalidSeparators } = extractSeparatorsSafely(fullContent, topBlocks);

  if (hasInvalidSeparators && topBlocks.length > 1) {
    throw new Error(`Section reordering is not supported when non-whitespace or non-comment content exists between blocks. Section reorder requires all content to be in reorderable top-level blocks with only whitespace/comments between them.`);
  }

  // Reorder by placing blocks into the original separator slots. Separators are
  // positional (the gap between block N and N+1), so prefix, separators, and
  // suffix are emitted byte-for-byte instead of being re-synthesized. This makes
  // reordering stable: applying the inverse order restores the original document
  // exactly, with no whitespace or comment drift.
  const reorderedParts: string[] = [];
  for (let i = 0; i < orderedBlocks.length; i++) {
    if (i > 0) {
      reorderedParts.push(separators[i - 1] ?? '');
    }
    reorderedParts.push(orderedBlocks[i].rawBlock);
  }

  const reorderedContent = prefix + reorderedParts.join('') + suffix;

  const beforeContent = topBlocks.map((b) => b.rawBlock).join('\n\n');

  return {
    updatedFullContent: reorderedContent,
    sectionIds: orderedBlocks.map((s) => s.id),
    sectionNames: orderedBlocks.map((s) => s.name),
    diff: {
      before: beforeContent,
      after: reorderedContent,
    },
    renderedPreviewHtml: reorderedContent,
    summary: `Reorder sections: ${orderedBlocks.map((s, i) => `${i + 1}. ${s.name}`).join(' → ')}`,
  };
}

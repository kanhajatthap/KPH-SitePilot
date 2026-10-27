import { PageDesign, PageDesignSchema } from '@wp-agent/contracts';

function escapePromptText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function serializeUntrustedPageContext(title: string, content: string): string {
  return [
    '<UNTRUSTED_PAGE_DATA>',
    `Page title: ${escapePromptText(title)}`,
    `Page content: ${escapePromptText(content)}`,
    '</UNTRUSTED_PAGE_DATA>',
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderSection(section: PageDesign['sections'][number]): {
  content: string;
  preview: string;
} {
  const heading = escapeHtml(section.heading);
  const colors = {
    hero: { background: '#0f172a', text: '#ffffff' },
    content: { background: '#ffffff', text: '#0f172a' },
    features: { background: '#f8fafc', text: '#0f172a' },
    cta: { background: '#ecfdf5', text: '#064e3b' },
  }[section.type];
  const style = {
    color: { background: colors.background, text: colors.text },
    spacing: {
      padding: { top: '4rem', right: '1.5rem', bottom: '4rem', left: '1.5rem' },
    },
  };
  const styleAttribute =
    `background-color:${colors.background};color:${colors.text};` +
    'padding:4rem 1.5rem';
  const className = `sitepilot-section sitepilot-section-${section.type}`;
  const blockAttrs = JSON.stringify({
    tagName: 'section',
    className,
    style,
    layout: { type: 'constrained' },
  });
  const blockClasses = `wp-block-group ${className} has-background has-text-color`;
  const headingLevel = section.type === 'hero' ? 1 : 2;
  const headingBlock = `<!-- wp:heading {"level":${headingLevel}} --><h${headingLevel} class="wp-block-heading">${heading}</h${headingLevel}><!-- /wp:heading -->`;
  const headingPreview = `<h${headingLevel}>${heading}</h${headingLevel}>`;
  const paragraphs = section.body
    ? section.body.split(/\r?\n/).filter(Boolean).map((line) => {
        const text = escapeHtml(line);
        return {
          content: `<!-- wp:paragraph --><p>${text}</p><!-- /wp:paragraph -->`,
          preview: `<p>${text}</p>`,
        };
      })
    : [];
  const listContent = section.items
    ? `<!-- wp:list --><ul class="wp-block-list">${section.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul><!-- /wp:list -->`
    : '';
  const listPreview = section.items
    ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  const openContent = `<!-- wp:group ${blockAttrs} --><section class="${blockClasses}" style="${styleAttribute}">`;
  const closeContent = '</section><!-- /wp:group -->';
  const previewOpen = `<section class="${className}" style="${styleAttribute}">`;

  return {
    content: `${openContent}${headingBlock}${paragraphs.map((item) => item.content).join('')}${listContent}${closeContent}`,
    preview: `${previewOpen}${headingPreview}${paragraphs.map((item) => item.preview).join('')}${listPreview}</section>`,
  };
}

export function parsePageDesignResponse(content: string): PageDesign | undefined {
  try {
    const result = PageDesignSchema.safeParse(JSON.parse(content));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function renderPageDesign(design: PageDesign): {
  gutenbergBlocksHtml: string;
  previewHtml: string;
} {
  const validatedDesign = PageDesignSchema.parse(design);
  const sections = validatedDesign.sections.map(renderSection);

  return {
    gutenbergBlocksHtml: `<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} --><main class="wp-block-group">${sections.map((section) => section.content).join('')}</main><!-- /wp:group -->`,
    previewHtml: `<main>${sections.map((section) => section.preview).join('')}</main>`,
  };
}

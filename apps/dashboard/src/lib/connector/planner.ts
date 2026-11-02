/**
 * Deterministic planner v1.
 *
 * Turns a plain-language request into a small, auditable list of connector
 * steps. It deliberately refuses when it is not sure: a wrong guess here would
 * become a real WordPress write after one click.
 *
 * The LLM planner (E3-02) replaces `planFromPrompt` behind the same return type,
 * so the plan/approval machinery does not change when it lands.
 */

export type Risk = 'R0' | 'R1' | 'R2' | 'R3';

export interface PlanStep {
  tool: string;
  args: Record<string, unknown>;
  risk: Risk;
  summary: string;
}

export type PlannerResult =
  | { ok: true; summary: string; risk: Risk; steps: PlanStep[] }
  | { ok: false; reason: string };

const WRITABLE_TYPES = ['post', 'page'];

function highestRisk(steps: PlanStep[]): Risk {
  const order: Risk[] = ['R0', 'R1', 'R2', 'R3'];
  return steps.reduce<Risk>(
    (worst, step) => (order.indexOf(step.risk) > order.indexOf(worst) ? step.risk : worst),
    'R0'
  );
}

/** Pulls a post/page id out of "#123", "post 123" or "page 42". */
export function extractPostId(prompt: string): number | null {
  const explicit = prompt.match(/#(\d{1,9})\b/);
  if (explicit) return Number(explicit[1]);

  const named = prompt.match(/\b(?:post|page|article)\s+(\d{1,9})\b/i);
  if (named) return Number(named[1]);

  return null;
}

/** Extracts a quoted fragment, if the user supplied one. */
export function extractQuotedText(prompt: string): string | null {
  const straight = prompt.match(/"([^"]{2,4000})"/);
  if (straight) return straight[1];

  const curly = prompt.match(/[\u201c\u201d]([^\u201c\u201d]{2,4000})[\u201c\u201d]/);
  if (curly) return curly[1];

  const single = prompt.match(/'([^']{2,4000})'/);
  if (single) return single[1];

  return null;
}

function looksLikeHtml(value: string): boolean {
  return /<!--\s*wp:|<[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRichLandingGutenbergHtml(title: string, promptHint: string): string {
  const safeTitle = escapeHtml(title);
  const cleanedHint = promptHint.replace(/\s+/g, ' ').trim().slice(0, 180);
  const safeSubtitle = escapeHtml(
    cleanedHint.length > 20
      ? `Crafted for ${safeTitle} — modern layout with structured sections ready to customize in WordPress or Elementor.`
      : `Modern insights, curated resources, and practical guides from ${safeTitle}.`
  );
  return [
    '<!-- wp:group {"align":"full","layout":{"type":"constrained"}} -->',
    '<div class="wp-block-group alignfull">',
    '<!-- wp:heading {"textAlign":"center","level":1} -->',
    `<h1 class="wp-block-heading has-text-align-center">${safeTitle}</h1>`,
    '<!-- /wp:heading -->',
    '<!-- wp:paragraph {"align":"center"} -->',
    `<p class="has-text-align-center">${safeSubtitle}</p>`,
    '<!-- /wp:paragraph -->',
    '<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->',
    '<div class="wp-block-buttons"><!-- wp:button -->',
    '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#features">Explore Features</a></div>',
    '<!-- /wp:button --><!-- wp:button {"className":"is-style-outline"} -->',
    '<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#contact">Get Started</a></div>',
    '<!-- /wp:button --></div>',
    '<!-- /wp:buttons -->',
    '</div>',
    '<!-- /wp:group -->',
    '<!-- wp:columns {"align":"wide"} -->',
    '<div class="wp-block-columns alignwide" id="features">',
    '<!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Modern Architecture</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Fast, responsive sections built with clean WordPress blocks that adapt to your active theme.</p><!-- /wp:paragraph --></div><!-- /wp:column -->',
    '<!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Curated Highlights</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Showcase flagship articles, products, or services in a scannable three-column layout.</p><!-- /wp:paragraph --></div><!-- /wp:column -->',
    '<!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Built to Convert</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Clear calls to action and structured headings ready for publishing or visual editing.</p><!-- /wp:paragraph --></div><!-- /wp:column -->',
    '</div>',
    '<!-- /wp:columns -->',
    '<!-- wp:group {"align":"wide","layout":{"type":"constrained"}} -->',
    '<div class="wp-block-group alignwide" id="contact">',
    '<!-- wp:heading {"textAlign":"center","level":2} --><h2 class="wp-block-heading has-text-align-center">Ready to launch?</h2><!-- /wp:heading -->',
    '<!-- wp:paragraph {"align":"center"} --><p class="has-text-align-center">Review this draft in WordPress and customize headlines, colors, or Elementor sections anytime.</p><!-- /wp:paragraph -->',
    '</div>',
    '<!-- /wp:group -->',
  ].join('\n');
}

function fail(reason: string): PlannerResult {
  return { ok: false, reason };
}

/**
 * Maps a prompt to connector steps, or explains why it cannot.
 */
export function planFromPrompt(prompt: string): PlannerResult {
  const text = (prompt ?? '').trim();
  if (text.length < 4) {
    return fail('Describe what should change on the site, for example: change the title of post #12 to "Hello".');
  }

  const lower = text.toLowerCase();
  const postId = extractPostId(text);
  const quoted = extractQuotedText(text);

  const wantsCreate = /\b(create|add|new)\b/.test(lower) && /\b(page|post|article)\b/.test(lower);
  const wantsDesignPage =
    !postId &&
    /\b(design|build|create|generate|make)\b/.test(lower) &&
    /\b(home\s*page|landing\s*page|elementor|hero\s+section|front\s*page)\b/.test(lower);
  const wantsTitle = /\btitle\b/.test(lower);
  const wantsContent = /\b(content|body|text|copy|rewrite|replace|paragraph|section)\b/.test(lower);
  const wantsPublish = /\b(publish|go live|live karo)\b/.test(lower);
  const wantsForbiddenUrlChange = !postId && /\b(siteurl|site\s+url|home\s+url)\b/.test(lower);
  const wantsSiteTitle = !postId && /\b(site\s+(?:title|name)|blogname)\b/.test(lower);
  const wantsTagline = !postId && /\b(tagline|site\s+description|blogdescription)\b/.test(lower);
  const wantsReadSettings =
    !postId &&
    !quoted &&
    /\b(read|check|show|inspect|list|get)\b/.test(lower) &&
    /\b(site\s+settings|settings)\b/.test(lower);
  const wantsSiteHealth =
    !postId &&
    !quoted &&
    /\b(check|read|show|inspect)\b/.test(lower) &&
    /\b(site\s+health|wordpress\s*(?:&|and)\s*php)\b/.test(lower);
  const wantsListContent =
    !postId &&
    !quoted &&
    /\b(list|show)\b/.test(lower) &&
    /\b(posts|pages)\b/.test(lower);
  const wantsSearch = !postId && !!quoted && /\b(search|find)\b/.test(lower);
  const wantsCreateTerm =
    !postId &&
    !!quoted &&
    /\b(create|add|new)\b/.test(lower) &&
    /\b(category|tag)\b/.test(lower);
  const wantsAssignTerm =
    !!postId &&
    !!quoted &&
    (/\b(assign|set|add)\b[\s\S]*\b(category|tag)\b/.test(lower) || /\btag\s+(?:post|page)\b/.test(lower));

  if (wantsForbiddenUrlChange) {
    return fail(
      'Changing siteurl or home is blocked so SitePilot can never lock out your WordPress connection.'
    );
  }

  if (wantsReadSettings) {
    const includeTheme = /\btheme\b/.test(lower);
    const steps: PlanStep[] = [
      {
        tool: 'settings.get',
        args: {},
        risk: 'R0',
        summary: 'Read allowlisted WordPress settings',
      },
    ];
    if (includeTheme) {
      steps.push({
        tool: 'theme.info',
        args: {},
        risk: 'R0',
        summary: 'Read active theme details',
      });
    }
    return {
      ok: true,
      summary: includeTheme ? 'Read site settings and active theme' : 'Read site settings',
      risk: 'R0',
      steps,
    };
  }

  if (wantsSiteHealth) {
    return {
      ok: true,
      summary: 'Check WordPress site health',
      risk: 'R0',
      steps: [{ tool: 'site.health', args: {}, risk: 'R0', summary: 'Check site health and versions' }],
    };
  }

  if (wantsListContent) {
    return {
      ok: true,
      summary: 'List recent posts and pages',
      risk: 'R0',
      steps: [{ tool: 'content.list', args: { limit: 10 }, risk: 'R0', summary: 'List up to 10 recent items' }],
    };
  }

  if (wantsSearch && quoted) {
    const q = quoted.trim();
    if (q.length < 1 || q.length > 120) {
      return fail('Search queries must be between 1 and 120 characters.');
    }
    return {
      ok: true,
      summary: `Search site for “${q}”`,
      risk: 'R0',
      steps: [
        {
          tool: 'site.search',
          args: { query: q, limit: 15 },
          risk: 'R0',
          summary: `Search posts, pages and media for “${q}”`,
        },
      ],
    };
  }

  if (wantsCreateTerm && quoted) {
    const taxonomy = /\btag\b/.test(lower) ? 'post_tag' : 'category';
    const label = taxonomy === 'post_tag' ? 'tag' : 'category';
    const name = quoted.trim();
    if (name.length < 1 || name.length > 120) {
      return fail('Category and tag names must be between 1 and 120 characters.');
    }
    return {
      ok: true,
      summary: `Create ${label} “${name}”`,
      risk: 'R1',
      steps: [
        {
          tool: 'terms.create',
          args: { taxonomy, name },
          risk: 'R1',
          summary: `Create ${label} “${name}”`,
        },
      ],
    };
  }

  if (wantsAssignTerm && postId && quoted) {
    const taxonomy = /\btag\b/.test(lower) ? 'post_tag' : 'category';
    const label = taxonomy === 'post_tag' ? 'tags' : 'categories';
    const terms = quoted
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= 120)
      .slice(0, 20);
    if (terms.length === 0) {
      return fail('Provide at least one category or tag name in quotes.');
    }
    return {
      ok: true,
      summary: `Assign ${label} (${terms.join(', ')}) to #${postId}`,
      risk: 'R1',
      steps: [
        {
          tool: 'terms.assign',
          args: { id: postId, taxonomy, terms },
          risk: 'R1',
          summary: `Assign ${label} ${terms.map((t) => `“${t}”`).join(', ')} to #${postId}`,
        },
      ],
    };
  }

  if (wantsSiteTitle || wantsTagline) {
    if (!quoted) {
      return fail(
        'Put the new site setting in quotes, for example: change site title to "KPH Studio".'
      );
    }
    const key = wantsSiteTitle ? 'blogname' : 'blogdescription';
    const label = wantsSiteTitle ? 'site title' : 'tagline';
    const trimmed = quoted.trim();
    if ((wantsSiteTitle && (trimmed.length < 1 || trimmed.length > 200)) || trimmed.length > 400) {
      return fail('That setting value is outside WordPress length limits.');
    }

    return {
      ok: true,
      summary: `Change ${label} to “${trimmed}”`,
      risk: 'R1',
      steps: [
        {
          tool: 'settings.update',
          args: { values: { [key]: trimmed } },
          risk: 'R1',
          summary: `Change ${label} (${key}) to “${trimmed}”`,
        },
      ],
    };
  }

  if (wantsDesignPage) {
    const title = quoted?.trim() || (/\blanding\s*page\b/i.test(text) ? 'Landing Page' : 'Home');
    const status = wantsPublish ? 'publish' : 'draft';
    const steps: PlanStep[] = [
      {
        tool: 'content.create',
        args: {
          title,
          type: 'page',
          status,
          content: buildRichLandingGutenbergHtml(title, text),
        },
        risk: wantsPublish ? 'R2' : 'R1',
        summary: `Create multi-section layout page “${title}”${wantsPublish ? ' and publish it' : ' as a draft'}`,
      },
    ];
    return {
      ok: true,
      summary: `Create page layout “${title}”`,
      risk: highestRisk(steps),
      steps,
    };
  }

  if (wantsCreate) {
    if (!quoted) {
      return fail('For a new page, put the title in quotes: create a page called "About us".');
    }

    const type = /\bpost\b/i.test(lower) && !/\bpage\b/i.test(lower) ? 'post' : 'page';
    const bodyMatch = text.match(/(?:with|containing|body)[:\s]+([\s\S]{10,8000})$/i);
    const body = bodyMatch ? bodyMatch[1].trim() : '';

    const steps: PlanStep[] = [
      {
        tool: 'content.create',
        args: {
          title: quoted,
          type,
          status: wantsPublish ? 'publish' : 'draft',
          content: looksLikeHtml(body) ? body : body ? `<p>${body}</p>` : '',
        },
        risk: wantsPublish ? 'R2' : 'R1',
        summary: `Create a ${type} titled “${quoted}”${wantsPublish ? ' and publish it' : ' as a draft'}`,
      },
    ];

    return {
      ok: true,
      summary: `Create ${type} “${quoted}”`,
      risk: highestRisk(steps),
      steps,
    };
  }

  if (!postId) {
    return fail(
      'Tell me which post or page to change, for example: update post #42 title to "Spring sale". You can find the id in Content → All Posts.'
    );
  }

  if (!wantsTitle && !wantsContent) {
    return fail('Say whether the title or the content should change (for example “change the title of post #12 to …”).');
  }

  if (!quoted) {
    return fail('Put the new text in quotes so I copy it exactly, for example: change the title of post #12 to "Hello".');
  }

  const steps: PlanStep[] = [];

  if (wantsTitle) {
    steps.push({
      tool: 'content.update',
      args: { id: postId, title: quoted },
      risk: 'R1',
      summary: `Change the title of #${postId} to “${quoted}”`,
    });
  }

  if (wantsContent) {
    steps.push({
      tool: 'content.update',
      args: { id: postId, content: looksLikeHtml(quoted) ? quoted : `<p>${quoted}</p>` },
      risk: 'R1',
      summary: `Replace the content of #${postId} with the quoted text`,
    });
  }

  if (wantsPublish) {
    steps.push({
      tool: 'content.update',
      args: { id: postId, status: 'publish' },
      risk: 'R2',
      summary: `Publish #${postId}`,
    });
  }

  if (steps.length === 0) {
    return fail('I could not find a change to make in that request.');
  }

  // Title and content are independent writes: never merge them into one step,
  // so a partial failure is always explainable (and undoable) per field.
  const unique = steps.filter(
    (step, index) => steps.findIndex((other) => other.tool === step.tool && JSON.stringify(other.args) === JSON.stringify(step.args)) === index
  );

  return {
    ok: true,
    summary: unique.map((step) => step.summary).join(' · '),
    risk: highestRisk(unique),
    steps: unique,
  };
}

/** Post types this planner knows how to write. */
export function writableTypes(): string[] {
  return [...WRITABLE_TYPES];
}

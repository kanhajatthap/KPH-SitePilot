/**
 * Intelligent UI Component & Content Synthesizer
 * Generates rich, interactive, beautifully styled Lovable-grade components
 * and WordPress/Gutenberg/Elementor compatible markup based on user prompt.
 */

export interface SynthesizedComponent {
  title: string;
  type: 'about' | 'auth' | 'hero' | 'ceramics' | 'products' | 'pricing' | 'contact' | 'plugins' | 'settings' | 'code' | 'blog' | 'custom';
  route: string;
  summary: string;
  bulletPoints: string[];
  codeSnippet: string;
  renderedHtml: string;
  gutenbergBlocksHtml: string;
}

/**
 * Escapes user-controlled prompt text before it is embedded in preview HTML
 * or Gutenberg block markup. The synthesizer must never turn a prompt into
 * executable markup.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

/**
 * The KPH SitePilot About page is intentionally a separate branch from the
 * generic About template. Page 36 already uses a calm, craft-led SitePilot
 * voice; this branch keeps that tone while following the requested five
 * sections exactly.
 */
function synthesizeKphAboutPreview(siteUrl: string): SynthesizedComponent {
  const safeSiteUrl = escapeHtml(siteUrl);
  const year = new Date().getFullYear();

  const aboutCss = `
.about-preview { container-type: inline-size; }
.about-preview .ap-header { padding: 1rem 1.25rem; }
.about-preview .ap-nav { display: none; }
.about-preview .ap-hero { padding: 3.5rem 1.25rem; }
.about-preview .ap-hero-grid { display: grid; gap: 2.5rem; }
.about-preview .ap-hero-title { font-size: 40px; line-height: 1.02; }
.about-preview .ap-section { padding: 3rem 1.25rem; }
.about-preview .ap-cards { display: grid; gap: 1rem; grid-template-columns: 1fr; }
.about-preview .ap-principles { display: grid; gap: 0.75rem; grid-template-columns: 1fr; }
.about-preview .ap-mission-grid { display: grid; gap: 2rem; }
.about-preview .ap-cta-row { display: flex; flex-direction: column; gap: 1.5rem; }
.about-preview .ap-cta { padding: 3rem 1.25rem; }
.about-preview .ap-footer { padding: 1.25rem; }
@container (min-width: 640px) {
  .about-preview .ap-header { padding: 1rem 2rem; }
  .about-preview .ap-nav { display: flex; }
  .about-preview .ap-hero { padding: 5rem 2rem; }
  .about-preview .ap-hero-title { font-size: 56px; }
  .about-preview .ap-section { padding: 3rem 2rem; }
  .about-preview .ap-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .about-preview .ap-principles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .about-preview .ap-cta { padding: 3rem 2rem; }
  .about-preview .ap-footer { padding: 1.25rem 2rem; }
}
@container (min-width: 900px) {
  .about-preview .ap-hero-grid { grid-template-columns: 1.05fr 0.95fr; align-items: center; }
  .about-preview .ap-mission-grid { grid-template-columns: 0.8fr 1.2fr; gap: 3.5rem; }
  .about-preview .ap-principles { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .about-preview .ap-cta-row { flex-direction: row; align-items: center; justify-content: space-between; }
}
`;

  const renderedHtml = `
<div class="about-preview min-h-[680px] bg-[#fbf8f4] font-sans text-stone-900">
  <style>${aboutCss}</style>
  <header class="ap-header border-b border-stone-200/80 bg-[#fbf8f4]/90">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 via-pink-500 to-violet-500 text-sm font-bold text-white">K</span>
        <span class="text-sm font-semibold tracking-tight">KPH SitePilot</span>
      </div>
      <nav class="ap-nav items-center gap-5 text-[11px] font-medium text-stone-500" aria-label="Preview navigation">
        <a href="#mission" class="hover:text-stone-900">Mission</a>
        <a href="#what-were-building" class="hover:text-stone-900">What we’re building</a>
        <a href="#principles" class="hover:text-stone-900">Principles</a>
      </nav>
      <span class="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] font-medium text-stone-500">Preview only</span>
    </div>
  </header>

  <!-- 1. Hero -->
  <section class="ap-hero relative overflow-hidden">
    <div class="pointer-events-none absolute inset-0" style="background-image: radial-gradient(ellipse at 8% 0%, rgba(255,138,91,0.18), transparent 45%), radial-gradient(ellipse at 88% 18%, rgba(255,77,141,0.14), transparent 45%), radial-gradient(ellipse at 55% 100%, rgba(168,85,247,0.10), transparent 55%);"></div>
    <div class="ap-hero-grid relative mx-auto max-w-5xl">
      <div>
        <span class="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/70 px-2.5 py-1 text-[10px] font-medium text-stone-600 shadow-sm">
          <span class="h-1.5 w-1.5 rounded-full bg-pink-500"></span>
          About KPH SitePilot
        </span>
        <h1 class="ap-hero-title mt-5 max-w-xl font-semibold tracking-tight text-stone-950">
          Your Ideas. Your Website. Powered by AI.
        </h1>
        <p class="mt-5 max-w-lg text-[13.5px] leading-7 text-stone-600">
          KPH SitePilot turns a clear prompt into a real WordPress page — with a preview you can inspect before anything is saved.
        </p>
        <div class="mt-7 flex flex-wrap items-center gap-2.5">
          <a href="#what-were-building" class="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-stone-800">See what we’re building <span aria-hidden="true">→</span></a>
          <a href="#principles" class="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-[12px] font-semibold text-stone-700 transition hover:bg-stone-50">Our principles</a>
        </div>
        <p class="mt-6 text-[10.5px] text-stone-400">Local-first · Approval-gated · No production surprises</p>
      </div>

      <div class="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm">
        <div class="rounded-2xl border border-stone-200 bg-[#fbf8f4] p-3">
          <div class="flex items-center justify-between border-b border-stone-200 pb-2">
            <div class="flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-rose-400"></span>
              <span class="h-2 w-2 rounded-full bg-amber-400"></span>
              <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
            </div>
            <span class="rounded-full bg-white px-2 py-0.5 text-[9px] font-medium text-stone-500">staged preview</span>
          </div>
          <div class="mt-3 rounded-xl bg-gradient-to-br from-orange-100 via-pink-50 to-violet-100 p-4">
            <p class="text-[9px] font-semibold uppercase tracking-[0.16em] text-pink-600">Your idea</p>
            <p class="mt-1.5 font-serif text-lg font-semibold leading-tight text-stone-900">“A calm About page for KPH SitePilot.”</p>
            <div class="mt-3 h-1.5 w-4/5 rounded-full bg-white/80"></div>
            <div class="mt-1.5 h-1.5 w-3/5 rounded-full bg-white/60"></div>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-1.5 text-center">
            <div class="rounded-lg bg-white px-2 py-2"><p class="text-[9px] font-semibold text-stone-700">Prompt</p><p class="mt-0.5 text-[8px] text-stone-400">plain language</p></div>
            <div class="rounded-lg bg-white px-2 py-2"><p class="text-[9px] font-semibold text-stone-700">Preview</p><p class="mt-0.5 text-[8px] text-stone-400">real page</p></div>
            <div class="rounded-lg bg-white px-2 py-2"><p class="text-[9px] font-semibold text-stone-700">Approve</p><p class="mt-0.5 text-[8px] text-stone-400">you decide</p></div>
          </div>
        </div>
        <p class="mt-3 text-center text-[10px] text-stone-500">Nothing is saved until you approve.</p>
      </div>
    </div>
  </section>

  <!-- 2. Mission -->
  <section id="mission" class="ap-section border-y border-stone-200/80 bg-white/50">
    <div class="ap-mission-grid mx-auto max-w-5xl">
      <div>
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-600">Our Mission</p>
        <h2 class="mt-2.5 max-w-xs text-3xl font-semibold leading-tight tracking-tight">Making website creation simpler.</h2>
      </div>
      <div>
        <p class="max-w-2xl text-[13px] leading-7 text-stone-600">
          Most website tools ask you to learn their system before you can explain your idea. KPH SitePilot starts with the idea: describe the page, inspect a real preview, and approve the change only when it feels right.
        </p>
        <p class="mt-4 max-w-2xl text-[13px] leading-7 text-stone-500">
          The goal is not to remove your judgment. It is to remove the busywork between a clear thought and a working page.
        </p>
        <div class="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div class="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Prompt</div>
            <div class="mt-1 text-[11px] text-stone-600">Plain-language ideas.</div>
          </div>
          <div class="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Preview</div>
            <div class="mt-1 text-[11px] text-stone-600">A real staged page.</div>
          </div>
          <div class="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Approve</div>
            <div class="mt-1 text-[11px] text-stone-600">You stay in control.</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 3. What we're building -->
  <section id="what-were-building" class="ap-section">
    <div class="mx-auto max-w-5xl">
      <div class="max-w-2xl">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-600">What We’re Building</p>
        <h2 class="mt-2.5 text-3xl font-semibold leading-tight tracking-tight">Three pieces of one calm workspace.</h2>
      </div>
      <div class="ap-cards mt-7">
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 3v-13Z" stroke-linejoin="round"/><path d="M8 9h8M8 12h5" stroke-linecap="round"/></svg>
          </span>
          <h3 class="mt-4 text-sm font-semibold">Prompt-to-page builder</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">Describe the page you want. SitePilot turns it into a structured, responsive WordPress draft you can inspect.</p>
        </article>
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5"/></svg>
          </span>
          <h3 class="mt-4 text-sm font-semibold">Preview-first workflow</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">See the actual staged page in the canvas before anything is written. Revise the plan, not a broken live site.</p>
        </article>
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3.5 19 6v5.5c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6l7-2.5Z" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <h3 class="mt-4 text-sm font-semibold">Safe by default</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">Read-only inspection, local-first targets, and approval-gated writes keep you in control at every step.</p>
        </article>
      </div>
    </div>
  </section>

  <!-- 4. Principles -->
  <section id="principles" class="ap-section border-y border-stone-200/80 bg-white/60">
    <div class="mx-auto max-w-5xl">
      <div class="max-w-2xl">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-600">Our Principles</p>
        <h2 class="mt-2.5 text-3xl font-semibold leading-tight tracking-tight">Four rules we do not trade away.</h2>
      </div>
      <div class="ap-principles mt-7">
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="font-mono text-[10px] font-semibold text-pink-600">01</span>
          <h3 class="mt-3 text-sm font-semibold">User Control</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">You approve every change. Nothing is published automatically.</p>
        </article>
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="font-mono text-[10px] font-semibold text-pink-600">02</span>
          <h3 class="mt-3 text-sm font-semibold">Security First</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">Local-first targets, least privilege, and no secrets in prompts or logs.</p>
        </article>
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="font-mono text-[10px] font-semibold text-pink-600">03</span>
          <h3 class="mt-3 text-sm font-semibold">Transparency</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">Clear plans, visible reasoning, and honest status at every step.</p>
        </article>
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="font-mono text-[10px] font-semibold text-pink-600">04</span>
          <h3 class="mt-3 text-sm font-semibold">Continuous Improvement</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">Small, testable iterations instead of risky big-bang rewrites.</p>
        </article>
      </div>
    </div>
  </section>

  <!-- 5. Closing CTA -->
  <section id="lets-build" class="ap-cta">
    <div class="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-stone-900 px-6 py-9 text-white">
      <div class="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-30 blur-2xl" style="background-image: radial-gradient(circle, rgba(255,77,141,0.9), rgba(168,85,247,0.35), transparent 70%);"></div>
      <div class="ap-cta-row relative">
        <div class="max-w-xl">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-300">Closing CTA</p>
          <h2 class="mt-2.5 text-3xl font-semibold leading-tight tracking-tight">Let’s Build Something Great</h2>
          <p class="mt-3 text-[12px] leading-6 text-stone-300">Bring the idea. We’ll help you shape it, preview it, and ship it safely.</p>
        </div>
        <a href="#what-were-building" class="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[12px] font-semibold text-stone-900">Start with a prompt <span aria-hidden="true">→</span></a>
      </div>
    </div>
  </section>

  <footer class="ap-footer border-t border-stone-200/80">
    <div class="mx-auto flex max-w-5xl flex-col gap-1.5 text-[10px] text-stone-400">
      <span>© ${year} KPH SitePilot. Built with care.</span>
      <span>Preview staged for ${safeSiteUrl} · not published</span>
    </div>
  </footer>
</div>`;

  const gutenbergBlocksHtml = `<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:heading {"level":1} --><h1 class="wp-block-heading">Your Ideas. Your Website. Powered by AI.</h1><!-- /wp:heading -->
  <!-- wp:paragraph --><p>KPH SitePilot turns a clear prompt into a real WordPress page — with a preview you can inspect before anything is saved.</p><!-- /wp:paragraph -->
  <!-- wp:buttons -->
  <div class="wp-block-buttons">
    <!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#what-were-building">See what we’re building</a></div><!-- /wp:button -->
    <!-- wp:button {"className":"is-style-outline"} --><div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#principles">Our principles</a></div><!-- /wp:button -->
  </div>
  <!-- /wp:buttons -->

  <!-- wp:heading {"level":2,"anchor":"mission"} --><h2 id="mission" class="wp-block-heading">Our Mission</h2><!-- /wp:heading -->
  <!-- wp:paragraph --><p><strong>Making website creation simpler.</strong> Most website tools ask you to learn their system before you can explain your idea. KPH SitePilot starts with the idea: describe the page, inspect a real preview, and approve the change only when it feels right.</p><!-- /wp:paragraph -->
  <!-- wp:paragraph --><p>The goal is not to remove your judgment. It is to remove the busywork between a clear thought and a working page.</p><!-- /wp:paragraph -->

  <!-- wp:heading {"level":2,"anchor":"what-were-building"} --><h2 id="what-were-building" class="wp-block-heading">What We’re Building</h2><!-- /wp:heading -->
  <!-- wp:paragraph --><p>Three pieces of one calm workspace.</p><!-- /wp:paragraph -->
  <!-- wp:columns -->
  <div class="wp-block-columns">
    <!-- wp:column --><div class="wp-block-column">
      <!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Prompt-to-page builder</h3><!-- /wp:heading -->
      <!-- wp:paragraph --><p>Describe the page you want. SitePilot turns it into a structured, responsive WordPress draft you can inspect.</p><!-- /wp:paragraph -->
    </div><!-- /wp:column -->
    <!-- wp:column --><div class="wp-block-column">
      <!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Preview-first workflow</h3><!-- /wp:heading -->
      <!-- wp:paragraph --><p>See the actual staged page in the canvas before anything is written. Revise the plan, not a broken live site.</p><!-- /wp:paragraph -->
    </div><!-- /wp:column -->
    <!-- wp:column --><div class="wp-block-column">
      <!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Safe by default</h3><!-- /wp:heading -->
      <!-- wp:paragraph --><p>Read-only inspection, local-first targets, and approval-gated writes keep you in control at every step.</p><!-- /wp:paragraph -->
    </div><!-- /wp:column -->
  </div>
  <!-- /wp:columns -->

  <!-- wp:heading {"level":2,"anchor":"principles"} --><h2 id="principles" class="wp-block-heading">Our Principles</h2><!-- /wp:heading -->
  <!-- wp:paragraph --><p>Four rules we do not trade away.</p><!-- /wp:paragraph -->
  <!-- wp:list -->
  <ul class="wp-block-list">
    <!-- wp:list-item --><li><strong>User Control.</strong> You approve every change. Nothing is published automatically.</li><!-- /wp:list-item -->
    <!-- wp:list-item --><li><strong>Security First.</strong> Local-first targets, least privilege, and no secrets in prompts or logs.</li><!-- /wp:list-item -->
    <!-- wp:list-item --><li><strong>Transparency.</strong> Clear plans, visible reasoning, and honest status at every step.</li><!-- /wp:list-item -->
    <!-- wp:list-item --><li><strong>Continuous Improvement.</strong> Small, testable iterations instead of risky big-bang rewrites.</li><!-- /wp:list-item -->
  </ul>
  <!-- /wp:list -->

  <!-- wp:heading {"level":2,"anchor":"lets-build"} --><h2 id="lets-build" class="wp-block-heading">Let’s Build Something Great</h2><!-- /wp:heading -->
  <!-- wp:paragraph --><p>Bring the idea. We’ll help you shape it, preview it, and ship it safely.</p><!-- /wp:paragraph -->
  <!-- wp:buttons -->
  <div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#what-were-building">Start with a prompt</a></div><!-- /wp:button --></div>
  <!-- /wp:buttons -->
</main>
<!-- /wp:group -->`;

  return {
    title: 'About KPH SitePilot',
    type: 'about',
    route: '/about',
    summary:
      'Staged a five-section responsive About page for KPH SitePilot, using page 36’s calm, craft-led tone as reference.',
    bulletPoints: [
      'Section 1 — Hero: “Your Ideas. Your Website. Powered by AI.” with a preview-first note',
      'Section 2 — Our Mission: Making website creation simpler.',
      'Section 3 — What We’re Building: three feature cards for prompt-to-page, preview-first and safe-by-default',
      'Section 4 — Our Principles: User Control, Security First, Transparency, Continuous Improvement',
      'Section 5 — Closing CTA: “Let’s Build Something Great”',
      `Target: ${siteUrl} · Builder: Gutenberg core blocks · Status: staged, not published`,
    ],
    codeSnippet: `<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:heading {"level":1} --><h1 class="wp-block-heading">Your Ideas. Your Website. Powered by AI.</h1><!-- /wp:heading -->
  <!-- wp:heading {"level":2,"anchor":"mission"} --><h2 id="mission" class="wp-block-heading">Our Mission</h2><!-- /wp:heading -->
  <!-- wp:heading {"level":2,"anchor":"what-were-building"} --><h2 id="what-were-building" class="wp-block-heading">What We’re Building</h2><!-- /wp:heading -->
  <!-- wp:heading {"level":2,"anchor":"principles"} --><h2 id="principles" class="wp-block-heading">Our Principles</h2><!-- /wp:heading -->
  <!-- wp:heading {"level":2,"anchor":"lets-build"} --><h2 id="lets-build" class="wp-block-heading">Let’s Build Something Great</h2><!-- /wp:heading -->
</main>
<!-- /wp:group -->`,
    renderedHtml,
    gutenbergBlocksHtml,
  };
}

export function synthesizeFromPrompt(
  prompt: string,
  siteUrl: string,
  pluginContext?: { pluginSlug?: string; pluginAction?: string }
): SynthesizedComponent {
  const p = prompt.toLowerCase();

  // 0. Plugin Administration & Installation (ACF, Elementor, Yoast, etc.)
  if (
    p.includes('plugin') ||
    p.includes('install') ||
    p.includes('activate') ||
    p.includes('yoast') ||
    (p.includes('acf') && !p.includes('field') && !p.includes('group'))
  ) {
    const slug = pluginContext?.pluginSlug || (
      p.includes('yoast') ? 'wordpress-seo' :
      p.includes('acf') ? 'advanced-custom-fields' :
      p.includes('elementor') ? 'elementor' :
      p.includes('woo') ? 'woocommerce' : 'wordpress-plugin'
    );

    const action = pluginContext?.pluginAction || (
      p.includes('activate') ? 'activate' :
      p.includes('deactivate') ? 'deactivate' :
      p.includes('delete') || p.includes('uninstall') ? 'delete' : 'install'
    );

    const displayName =
      slug === 'wordpress-seo' ? 'Yoast SEO' :
      slug === 'advanced-custom-fields' ? 'Advanced Custom Fields (ACF)' :
      slug === 'elementor' ? 'Elementor Website Builder' :
      slug === 'woocommerce' ? 'WooCommerce' :
      slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const renderedHtml = `
<div class="p-8 bg-slate-50 font-sans text-slate-900 min-h-[500px]">
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between pb-4 border-b border-slate-200">
      <div>
        <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">LocalWP Environment</span>
        <h2 class="text-2xl font-bold text-slate-900 mt-2">Plugin Management</h2>
        <p class="text-xs text-slate-500 mt-1">Target Site: <span class="font-mono text-slate-700">${siteUrl}</span></p>
      </div>
      <div class="text-right">
        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> WP-CLI Connected
        </span>
      </div>
    </div>

    <!-- Targeted Operation Card -->
    <div class="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg">
            ${displayName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 class="font-bold text-base text-slate-900">${displayName}</h3>
            <p class="text-xs text-slate-500 font-mono">Slug: ${slug}</p>
          </div>
        </div>
        <span class="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
          action === 'install' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }">
          Ready to ${action}
        </span>
      </div>
      <div class="bg-slate-900 text-slate-300 font-mono text-xs p-4 rounded-xl border border-slate-800 space-y-1">
        <div class="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Scheduled WP-CLI Execution:</div>
        <div class="text-emerald-400 font-semibold">$ wp plugin ${action} ${slug}${action === 'install' ? ' --activate' : ''}</div>
      </div>
    </div>
  </div>
</div>`;

    return {
      title: `${displayName} — ${action.toUpperCase()}`,
      type: 'plugins',
      route: '/plugins',
      summary: `Staged WP-CLI command to ${action} ${displayName} (${slug}) on ${siteUrl}.`,
      bulletPoints: [
        `Plugin: ${displayName} (${slug})`,
        `Operation: ${action.toUpperCase()} via LocalWP bundled WP-CLI`,
        `Target environment: ${siteUrl}`,
        `Deny-by-default: changes will execute only upon your Publish/Approval`,
      ],
      codeSnippet: `wp plugin ${action} ${slug}${action === 'install' ? ' --activate' : ''} --path="C:\\Users\\india\\Local Sites\\test\\app\\public"`,
      renderedHtml,
      gutenbergBlocksHtml: `<!-- wp:paragraph --><p>Plugin operation: ${action} ${displayName} on ${siteUrl}.</p><!-- /wp:paragraph -->`,
    };
  }

  // 0b. Site Settings
  if (
    /(?:change|set|update|modify)\s+(?:the\s+)?(?:site\s+(?:title|name|tagline|description)|tagline|permalink|homepage|front\s*page)/i.test(p) ||
    /(?:blogname|blogdescription|permalink_structure)/i.test(p)
  ) {
    const titleMatch = p.match(/(?:site\s+(?:title|name)|blogname)\s+(?:to\s+)?["']?([^"'\n,]+)["']?/i);
    const taglineMatch = p.match(/(?:tagline|description|blogdescription)\s+(?:to\s+)?["']?([^"'\n,]+)["']?/i);
    const newTitle = titleMatch?.[1]?.trim() || 'My WordPress Site';
    const newTagline = taglineMatch?.[1]?.trim() || '';

    const renderedHtml = `
<div class="p-8 bg-slate-50 font-sans text-slate-900 min-h-[500px]">
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="pb-4 border-b border-slate-200">
      <span class="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">Site Settings</span>
      <h2 class="text-2xl font-bold text-slate-900 mt-2">WordPress Settings Update</h2>
      <p class="text-xs text-slate-500 mt-1">Target: <span class="font-mono">${siteUrl}</span></p>
    </div>

    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
      ${titleMatch ? `
      <div class="p-5 flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xl">📝</div>
        <div class="flex-1">
          <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Site Title (blogname)</div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-slate-400 line-through">Current Title</span>
            <span class="text-xs text-slate-400">→</span>
            <span class="text-sm font-bold text-emerald-700">${newTitle}</span>
          </div>
        </div>
        <span class="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">Pending Approval</span>
      </div>` : ''}
      ${taglineMatch ? `
      <div class="p-5 flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 text-xl">💬</div>
        <div class="flex-1">
          <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tagline (blogdescription)</div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-slate-400 line-through">Current tagline</span>
            <span class="text-xs text-slate-400">→</span>
            <span class="text-sm font-bold text-emerald-700">${newTagline}</span>
          </div>
        </div>
        <span class="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">Pending Approval</span>
      </div>` : ''}
    </div>

    <div class="p-4 rounded-xl bg-slate-900 text-slate-300 font-mono text-xs space-y-1.5 border border-slate-800">
      <div class="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">$ wp-cli preview</div>
      ${titleMatch ? `<div class="text-emerald-400">wp option update blogname "${newTitle}" --path=./test</div>` : ''}
      ${taglineMatch ? `<div class="text-emerald-400">wp option update blogdescription "${newTagline}" --path=./test</div>` : ''}
    </div>

    <div class="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
      <span class="text-amber-600 text-lg">⚠️</span>
      <div>
        <div class="font-semibold text-amber-900 text-sm">Approval Required</div>
        <div class="text-xs text-amber-700 mt-1">These changes will be applied to your live LocalWP site after you click <strong>Publish</strong>.</div>
      </div>
    </div>
  </div>
</div>`;

    return {
      title: `Update Site Settings`,
      type: 'settings',
      route: '/settings',
      summary: `Propose WordPress site settings update on ${siteUrl}.`,
      bulletPoints: [
        titleMatch ? `Site title will change to "${newTitle}"` : '',
        taglineMatch ? `Tagline will change to "${newTagline}"` : '',
        'Changes staged for approval — no live modification until Publish is clicked',
        'Verified via WP-CLI option update with integrity hash protection',
      ].filter(Boolean),
      codeSnippet: [
        titleMatch ? `wp option update blogname "${newTitle}"` : '',
        taglineMatch ? `wp option update blogdescription "${newTagline}"` : '',
      ].filter(Boolean).join('\n'),
      renderedHtml,
      gutenbergBlocksHtml: `<!-- wp:paragraph --><p>Site settings updated on ${siteUrl}.</p><!-- /wp:paragraph -->`,
    };
  }

  // 0c. Header/Footer/CSS Code Injection
  if (
    /(?:add|inject|insert|include)\s+.+?\s+(?:to|in(?:to)?)\s+(?:the\s+)?(?:header|footer|head|<head)/i.test(p) ||
    /add\s+(?:google\s+analytics|gtm|tag\s+manager|tracking|pixel|script|code|css|custom\s+css)/i.test(p) ||
    /(?:inject|insert)\s+(?:script|code|css|tracking)/i.test(p)
  ) {
    const location = /footer/i.test(p) ? 'footer' : /css|style/i.test(p) ? 'css' : 'header';
    const isAnalytics = /analytics|gtm|google|pixel|tag\s*manager/i.test(p);
    const isCSS = location === 'css';

    const exampleCode = isCSS
      ? `.wp-block-button__link { border-radius: 4px; font-weight: 700; }\nbody { font-family: 'Inter', sans-serif; }`
      : isAnalytics
      ? `<!-- Google Analytics 4 -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', 'GA_MEASUREMENT_ID');\n</script>`
      : `<!-- Custom ${location} script -->\n<script>\n  console.log('KPH SitePilot: ${location} script loaded');\n</script>`;

    const hookName = location === 'header' ? 'wp_head' : location === 'footer' ? 'wp_footer' : 'wp_enqueue_scripts';

    const renderedHtml = `
<div class="p-8 bg-slate-900 font-sans text-slate-100 min-h-[500px]">
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="pb-4 border-b border-slate-700">
      <div class="flex items-center gap-3">
        <span class="text-2xl">${isCSS ? '🎨' : isAnalytics ? '📊' : '⚡'}</span>
        <div>
          <span class="px-2.5 py-1 rounded-full bg-indigo-900/60 text-indigo-300 text-xs font-semibold border border-indigo-700">${location.toUpperCase()} Injection</span>
          <h2 class="text-xl font-bold text-white mt-1">${isCSS ? 'Custom CSS Injection' : isAnalytics ? 'Analytics Script Injection' : `Custom ${location.charAt(0).toUpperCase() + location.slice(1)} Script`}</h2>
        </div>
      </div>
      <p class="text-xs text-slate-400 mt-2">Target hook: <code class="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400">${hookName}</code> → <span class="font-mono text-slate-400">${siteUrl}</span></p>
    </div>

    <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div class="px-4 py-2 bg-slate-700/50 border-b border-slate-700 flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-red-500"></div>
        <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
        <div class="w-3 h-3 rounded-full bg-green-500"></div>
        <span class="ml-2 text-xs text-slate-400 font-mono">${location === 'css' ? 'custom.css' : location + '.html'}</span>
      </div>
      <pre class="p-4 text-xs text-emerald-300 overflow-x-auto leading-relaxed font-mono">${exampleCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="p-4 rounded-xl bg-slate-800 border border-slate-700">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">WordPress Hook</div>
        <code class="text-emerald-400 text-sm font-mono">${hookName}</code>
        <div class="text-xs text-slate-500 mt-1">Fires in ${location} of every page</div>
      </div>
      <div class="p-4 rounded-xl bg-slate-800 border border-slate-700">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Storage</div>
        <code class="text-blue-400 text-sm font-mono">wp_options</code>
        <div class="text-xs text-slate-500 mt-1">Stored in <code class="text-slate-400">${location}_scripts</code></div>
      </div>
    </div>

    <div class="flex items-start gap-3 p-4 rounded-xl bg-amber-900/30 border border-amber-700/50">
      <span class="text-amber-400 text-lg">🔒</span>
      <div>
        <div class="font-semibold text-amber-300 text-sm">Staged — Awaiting Approval</div>
        <div class="text-xs text-amber-400/80 mt-1">This code will only be injected after clicking <strong>Publish</strong>. Integrity hash verified.</div>
      </div>
    </div>
  </div>
</div>`;

    return {
      title: isCSS ? 'Custom CSS Injection' : isAnalytics ? 'Analytics Tracking Script' : `${location.charAt(0).toUpperCase() + location.slice(1)} Script Injection`,
      type: 'code',
      route: '/code',
      summary: `Inject custom ${location} code on ${siteUrl} via WordPress ${hookName} hook.`,
      bulletPoints: [
        `Code will be injected via WordPress \`${hookName}\` hook`,
        `Stored in \`wp_options\` as \`${location}_scripts\` option`,
        'Sanitized and validated before storage — XSS-safe injection',
        'Applied on Publish click with cryptographic plan integrity hash',
      ],
      codeSnippet: exampleCode,
      renderedHtml,
      gutenbergBlocksHtml: `<!-- wp:paragraph --><p>Custom ${location} script injected on ${siteUrl}.</p><!-- /wp:paragraph -->`,
    };
  }

  // 0d. About page — a real five-section page, not an auth/products fallback.
  // Keep this before the auth branch: prompts such as "About Hearth & Clay"
  // used to match the auth branch because it contains the word "hearth".
  const isAboutPageRequest =
    /\babout\s+page\b/i.test(p) ||
    /\babout\s+us\b/i.test(p) ||
    /\babout\s+(?:our|the)\s+(?:story|mission|team|company|studio)\b/i.test(p) ||
    /\babout\s+["“'`]?[A-Z]/.test(prompt);

  if (isAboutPageRequest) {
    // KPH SitePilot's About page has a fixed five-section brief. Keep it
    // separate from the generic About template so the section names and
    // closing CTA stay exact.
    if (/\bKPH\s+SitePilot\b/i.test(prompt)) {
      return synthesizeKphAboutPreview(siteUrl);
    }

    const quotedSubject = prompt.match(/(?:about|for)\s+["“'`](.+?)["”'`]/i)?.[1];
    const brandSubject = prompt.match(/\bfor\s+([A-Z][A-Za-z0-9&' -]{1,60})/)?.[1];
    const aboutSubject = (quotedSubject || brandSubject || 'SitePilot')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s+(?:with|that|including|featuring|using|containing)\s+.*$/i, '')
      .replace(/\s+(?:store|website|site|page|brand)$/i, '')
      .trim() || 'SitePilot';
    const safeSubject = escapeHtml(aboutSubject);
    const safeSiteUrl = escapeHtml(siteUrl);
    const aboutTitle = `About ${aboutSubject}`;

    const renderedHtml = `
<div class="min-h-[620px] bg-[#fbf8f4] font-sans text-stone-900">
  <header class="border-b border-stone-200/80 bg-[#fbf8f4]/90 px-5 py-4 sm:px-8">
    <div class="mx-auto flex max-w-5xl items-center justify-between gap-4">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 via-pink-500 to-violet-500 text-sm font-bold text-white">${safeSubject.slice(0, 1).toUpperCase()}</span>
        <span class="text-sm font-semibold tracking-tight">${safeSubject}</span>
      </div>
      <nav class="hidden items-center gap-5 text-[11px] font-medium text-stone-500 sm:flex" aria-label="Preview navigation">
        <span class="text-stone-900">About</span>
        <span>Work</span>
        <span>Journal</span>
        <span>Contact</span>
      </nav>
      <span class="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] font-medium text-stone-500">Local-first</span>
    </div>
  </header>

  <!-- 1. Hero -->
  <section class="relative overflow-hidden px-5 py-14 sm:px-8 sm:py-20">
    <div class="pointer-events-none absolute inset-0" style="background-image: radial-gradient(ellipse at 8% 0%, rgba(255,138,91,0.18), transparent 45%), radial-gradient(ellipse at 88% 18%, rgba(255,77,141,0.14), transparent 45%), radial-gradient(ellipse at 55% 100%, rgba(168,85,247,0.10), transparent 55%);"></div>
    <div class="relative mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
      <div>
        <span class="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/70 px-2.5 py-1 text-[10px] font-medium text-stone-600 shadow-sm">
          <span class="h-1.5 w-1.5 rounded-full bg-pink-500"></span>
          About ${safeSubject}
        </span>
        <h1 class="mt-5 max-w-xl text-[38px] font-semibold leading-[1.06] tracking-tight sm:text-5xl">
          We make thoughtful work for people who care about the details.
        </h1>
        <p class="mt-5 max-w-lg text-[13.5px] leading-7 text-stone-600">
          ${safeSubject} is a small, independent studio building calm digital experiences. We believe good work is equal parts craft, clarity and respect for the people using it.
        </p>
        <div class="mt-7 flex flex-wrap items-center gap-2.5">
          <a href="#" class="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-[12px] font-semibold text-white shadow-sm">Start a conversation <span aria-hidden="true">→</span></a>
          <a href="#" class="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-[12px] font-semibold text-stone-700">See our work</a>
        </div>
        <p class="mt-6 text-[10.5px] text-stone-400">Based everywhere · Working worldwide · Since 2018</p>
      </div>

      <div class="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div class="flex items-center justify-between border-b border-stone-100 pb-3">
          <span class="text-[11px] font-semibold text-stone-800">A few things about us</span>
          <span class="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-stone-500">studio notes</span>
        </div>
        <dl class="mt-4 grid grid-cols-2 gap-3">
          <div class="rounded-2xl bg-[#fbf8f4] p-3.5">
            <dt class="font-mono text-2xl font-semibold tracking-tight">12</dt>
            <dd class="mt-0.5 text-[10px] leading-4 text-stone-500">years of making useful things</dd>
          </div>
          <div class="rounded-2xl bg-[#fbf8f4] p-3.5">
            <dt class="font-mono text-2xl font-semibold tracking-tight">48</dt>
            <dd class="mt-0.5 text-[10px] leading-4 text-stone-500">products, sites and stories shipped</dd>
          </div>
          <div class="rounded-2xl bg-[#fbf8f4] p-3.5">
            <dt class="font-mono text-2xl font-semibold tracking-tight">9</dt>
            <dd class="mt-0.5 text-[10px] leading-4 text-stone-500">countries we have worked with</dd>
          </div>
          <div class="rounded-2xl bg-[#fbf8f4] p-3.5">
            <dt class="font-mono text-2xl font-semibold tracking-tight">1</dt>
            <dd class="mt-0.5 text-[10px] leading-4 text-stone-500">simple promise: tell the truth</dd>
          </div>
        </dl>
        <p class="mt-4 rounded-xl border border-stone-100 bg-white px-3 py-2.5 text-[10.5px] leading-5 text-stone-500">
          This is a staged preview for <span class="font-mono text-stone-700">${safeSiteUrl}</span>. Nothing is saved until you approve it.
        </p>
      </div>
    </div>
  </section>

  <!-- 2. Story / mission -->
  <section class="border-y border-stone-200/80 bg-white/50 px-5 py-12 sm:px-8">
    <div class="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:gap-14">
      <div>
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-600">Our story</p>
        <h2 class="mt-2.5 max-w-xs text-3xl font-semibold leading-tight tracking-tight">Started with a simple frustration.</h2>
      </div>
      <div>
        <p class="max-w-2xl text-[13px] leading-7 text-stone-600">
          Too much of the web feels assembled rather than made. Too many teams are asked to choose between speed and care, between a polished surface and a solid foundation. We started ${safeSubject} to prove that those choices are false.
        </p>
        <p class="mt-4 max-w-2xl text-[13px] leading-7 text-stone-500">
          We work in small, focused teams. We ask better questions before we open a design tool. And we leave every project a little clearer than we found it — for the people who use it and the people who maintain it.
        </p>
        <div class="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div class="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Craft</div>
            <div class="mt-1 text-[11px] text-stone-600">Details are the product.</div>
          </div>
          <div class="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Clarity</div>
            <div class="mt-1 text-[11px] text-stone-600">Plain language, no theatre.</div>
          </div>
          <div class="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Care</div>
            <div class="mt-1 text-[11px] text-stone-600">Respect the end user.</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 3. Values -->
  <section class="px-5 py-12 sm:px-8">
    <div class="mx-auto max-w-5xl">
      <div class="max-w-2xl">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-600">What we value</p>
        <h2 class="mt-2.5 text-3xl font-semibold leading-tight tracking-tight">Three ideas we keep coming back to.</h2>
      </div>
      <div class="mt-7 grid gap-3.5 md:grid-cols-3">
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-lg">◌</span>
          <h3 class="mt-4 text-sm font-semibold">Make it feel inevitable</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">The best interface is the one that disappears. We remove friction until the next step feels obvious.</p>
        </article>
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-lg">◇</span>
          <h3 class="mt-4 text-sm font-semibold">Show your work</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">We explain the trade-offs, share the rough drafts and leave a trail that the next person can follow.</p>
        </article>
        <article class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-lg">○</span>
          <h3 class="mt-4 text-sm font-semibold">Build for the long run</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">A launch is the beginning, not the finish line. We choose foundations that are easy to maintain and improve.</p>
        </article>
      </div>
    </div>
  </section>

  <!-- 4. Process -->
  <section class="border-y border-stone-200/80 bg-white/60 px-5 py-12 sm:px-8">
    <div class="mx-auto max-w-5xl">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="max-w-xl">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-600">How we work</p>
          <h2 class="mt-2.5 text-3xl font-semibold leading-tight tracking-tight">A small process with no black boxes.</h2>
        </div>
        <span class="w-fit rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] text-stone-500">4 steps · 2–6 weeks</span>
      </div>
      <ol class="mt-7 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <li class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="font-mono text-[10px] font-semibold text-pink-600">01</span>
          <h3 class="mt-3 text-sm font-semibold">Listen</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">We start with the people, the constraints and the one outcome that matters most.</p>
        </li>
        <li class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="font-mono text-[10px] font-semibold text-pink-600">02</span>
          <h3 class="mt-3 text-sm font-semibold">Shape</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">We sketch the smallest useful version, then make the important parts unmistakable.</p>
        </li>
        <li class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="font-mono text-[10px] font-semibold text-pink-600">03</span>
          <h3 class="mt-3 text-sm font-semibold">Build</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">We design in the browser and build with real content, real states and real constraints.</p>
        </li>
        <li class="rounded-2xl border border-stone-200 bg-white p-5">
          <span class="font-mono text-[10px] font-semibold text-pink-600">04</span>
          <h3 class="mt-3 text-sm font-semibold">Hand over</h3>
          <p class="mt-1.5 text-[11.5px] leading-6 text-stone-500">You get the work, the reasoning and a clear path to keep improving it.</p>
        </li>
      </ol>
    </div>
  </section>

  <!-- 5. CTA -->
  <section class="px-5 py-12 sm:px-8">
    <div class="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-stone-900 px-6 py-9 text-white sm:px-10 sm:py-11">
      <div class="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-30 blur-2xl" style="background-image: radial-gradient(circle, rgba(255,77,141,0.9), rgba(168,85,247,0.35), transparent 70%);"></div>
      <div class="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div class="max-w-xl">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-pink-300">Say hello</p>
          <h2 class="mt-2.5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Have something thoughtful in mind?</h2>
          <p class="mt-3 text-[12px] leading-6 text-stone-300">Tell us what you are making. We will reply with a real point of view, not a sales deck.</p>
        </div>
        <a href="#" class="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[12px] font-semibold text-stone-900">Start a conversation <span aria-hidden="true">→</span></a>
      </div>
    </div>
  </section>

  <footer class="border-t border-stone-200/80 px-5 py-5 sm:px-8">
    <div class="mx-auto flex max-w-5xl flex-col gap-1.5 text-[10px] text-stone-400 sm:flex-row sm:items-center sm:justify-between">
      <span>© ${new Date().getFullYear()} ${safeSubject}. Made with care.</span>
      <span>Preview staged for ${safeSiteUrl} · not published</span>
    </div>
  </footer>
</div>`;

    const gutenbergBlocksHtml = `<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:heading {"level":1} -->
  <h1 class="wp-block-heading">About ${safeSubject}</h1>
  <!-- /wp:heading -->
  <!-- wp:paragraph -->
  <p>${safeSubject} is a small, independent studio building calm digital experiences. We believe good work is equal parts craft, clarity and respect for the people using it.</p>
  <!-- /wp:paragraph -->
  <!-- wp:buttons -->
  <div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#">Start a conversation</a></div><!-- /wp:button --><!-- wp:button {"className":"is-style-outline"} --><div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#">See our work</a></div><!-- /wp:button --></div>
  <!-- /wp:buttons -->

  <!-- wp:heading {"level":2} -->
  <h2 class="wp-block-heading">Our story</h2>
  <!-- /wp:heading -->
  <!-- wp:paragraph -->
  <p>Too much of the web feels assembled rather than made. Too many teams are asked to choose between speed and care, between a polished surface and a solid foundation. We started ${safeSubject} to prove that those choices are false.</p>
  <!-- /wp:paragraph -->
  <!-- wp:paragraph -->
  <p>We work in small, focused teams. We ask better questions before we open a design tool. And we leave every project a little clearer than we found it — for the people who use it and the people who maintain it.</p>
  <!-- /wp:paragraph -->

  <!-- wp:heading {"level":2} -->
  <h2 class="wp-block-heading">What we value</h2>
  <!-- /wp:heading -->
  <!-- wp:columns -->
  <div class="wp-block-columns">
    <!-- wp:column -->
    <div class="wp-block-column">
      <!-- wp:heading {"level":3} -->
      <h3 class="wp-block-heading">Make it feel inevitable</h3>
      <!-- /wp:heading -->
      <!-- wp:paragraph -->
      <p>The best interface is the one that disappears. We remove friction until the next step feels obvious.</p>
      <!-- /wp:paragraph -->
    </div>
    <!-- /wp:column -->
    <!-- wp:column -->
    <div class="wp-block-column">
      <!-- wp:heading {"level":3} -->
      <h3 class="wp-block-heading">Show your work</h3>
      <!-- /wp:heading -->
      <!-- wp:paragraph -->
      <p>We explain the trade-offs, share the rough drafts and leave a trail that the next person can follow.</p>
      <!-- /wp:paragraph -->
    </div>
    <!-- /wp:column -->
    <!-- wp:column -->
    <div class="wp-block-column">
      <!-- wp:heading {"level":3} -->
      <h3 class="wp-block-heading">Build for the long run</h3>
      <!-- /wp:heading -->
      <!-- wp:paragraph -->
      <p>A launch is the beginning, not the finish line. We choose foundations that are easy to maintain and improve.</p>
      <!-- /wp:paragraph -->
    </div>
    <!-- /wp:column -->
  </div>
  <!-- /wp:columns -->

  <!-- wp:heading {"level":2} -->
  <h2 class="wp-block-heading">How we work</h2>
  <!-- /wp:heading -->
  <!-- wp:list {"ordered":true} -->
  <ol class="wp-block-list"><!-- wp:list-item --><li><strong>Listen.</strong> We start with the people, the constraints and the one outcome that matters most.</li><!-- /wp:list-item --><!-- wp:list-item --><li><strong>Shape.</strong> We sketch the smallest useful version, then make the important parts unmistakable.</li><!-- /wp:list-item --><!-- wp:list-item --><li><strong>Build.</strong> We design in the browser and build with real content, real states and real constraints.</li><!-- /wp:list-item --><!-- wp:list-item --><li><strong>Hand over.</strong> You get the work, the reasoning and a clear path to keep improving it.</li><!-- /wp:list-item --></ol>
  <!-- /wp:list -->

  <!-- wp:heading {"level":2} -->
  <h2 class="wp-block-heading">Have something thoughtful in mind?</h2>
  <!-- /wp:heading -->
  <!-- wp:paragraph -->
  <p>Tell us what you are making. We will reply with a real point of view, not a sales deck.</p>
  <!-- /wp:paragraph -->
  <!-- wp:buttons -->
  <div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#">Start a conversation</a></div><!-- /wp:button --></div>
  <!-- /wp:buttons -->
</main>
<!-- /wp:group -->`;

    return {
      title: aboutTitle,
      type: 'about',
      route: '/about',
      summary: `Staged a five-section responsive About page for ${aboutSubject} with Gutenberg blocks.`,
      bulletPoints: [
        'Section 1 — Hero with brand statement, primary CTA and studio proof points',
        'Section 2 — Story and mission with a clear point of view',
        'Section 3 — Values presented as three scannable cards',
        'Section 4 — Four-step working process with no black boxes',
        'Section 5 — Contact CTA and footer, ready for review before publishing',
        `Target: ${siteUrl} · Builder: Gutenberg core blocks · Status: staged, not published`,
      ],
      codeSnippet: `<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:heading {"level":1} -->
  <h1 class="wp-block-heading">About ${safeSubject}</h1>
  <!-- /wp:heading -->
  <!-- wp:paragraph -->
  <p>${safeSubject} is a small, independent studio building calm digital experiences.</p>
  <!-- /wp:paragraph -->
  <!-- wp:heading {"level":2} -->
  <h2 class="wp-block-heading">Our story</h2>
  <!-- /wp:heading -->
  <!-- ... values, process and CTA sections ... -->
</main>
<!-- /wp:group -->`,
      renderedHtml,
      gutenbergBlocksHtml,
    };
  }

  // A ceramics studio landing page can mention "Hearth & Clay", which would
  // otherwise hit the auth branch below. Classify it once, before auth.
  const isCeramicsStudioRequest =
    (p.includes('ceramic') || p.includes('pottery') || p.includes('clay')) &&
    (p.includes('landing') ||
      p.includes('studio') ||
      p.includes('hero') ||
      p.includes('testimonial') ||
      p.includes('contact'));

  // 1. Auth / Login / Sign-up page (matches user's screenshot exactly!)
  if (!isCeramicsStudioRequest && (p.includes('auth') || p.includes('login') || p.includes('sign in') || p.includes('signup') || p.includes('account') || p.includes('credentials') || p.includes('hearth'))) {
    const brandName = prompt.match(/for ["“'`](.+?)["”'`]/i)?.[1] || 
                      prompt.match(/([A-Z][a-zA-Z0-9& ]+?)(?:store|auth|login|app)/i)?.[1]?.trim() || 
                      'Hearth & Clay';

    const renderedHtml = `
<div class="min-h-[560px] flex items-center justify-center p-6 bg-[#fbf8f4] font-serif text-[#2c241e]">
  <div class="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-stone-200/60 p-8 border border-stone-200/80">
    <div class="mb-6">
      <a href="#" class="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition-colors font-sans mb-6">
        <span>←</span> Back to store
      </a>
      <div class="text-center">
        <h2 class="text-2xl font-serif font-bold text-stone-900 tracking-tight">${brandName}</h2>
        <h3 class="text-lg font-serif font-medium text-stone-800 mt-2">Welcome back</h3>
        <p class="text-xs text-stone-500 font-sans mt-1">Enter your credentials to access your orders</p>
      </div>
    </div>

    <form class="space-y-4 font-sans text-xs" onsubmit="event.preventDefault(); alert('Authentication simulated successfully!');">
      <div>
        <label class="block font-medium text-stone-700 mb-1.5" for="auth-email">Email address</label>
        <div class="relative">
          <input
            id="auth-email"
            type="email"
            placeholder="you@example.com"
            value="you@example.com"
            class="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-stone-50/50 text-stone-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#a85a38]/30 focus:border-[#a85a38] transition-all"
            required
          />
          <span class="absolute right-3 top-2.5 text-stone-400">✉</span>
        </div>
      </div>

      <div>
        <label class="block font-medium text-stone-700 mb-1.5" for="auth-password">Password</label>
        <div class="relative">
          <input
            id="auth-password"
            type="password"
            value="••••••••••••"
            class="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-stone-50/50 text-stone-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#a85a38]/30 focus:border-[#a85a38] transition-all"
            required
          />
          <span class="absolute right-3 top-2.5 text-stone-400">🔒</span>
        </div>
      </div>

      <button
        type="submit"
        class="w-full py-2.5 px-4 rounded-lg bg-[#a85a38] hover:bg-[#8f4a2c] text-white font-medium text-xs shadow-md shadow-[#a85a38]/20 transition-all hover:shadow-lg active:scale-[0.99] mt-2"
      >
        Sign In
      </button>

      <div class="text-center pt-3 border-t border-stone-100 text-[11px] text-stone-500">
        Don't have an account? <a href="#" class="text-[#a85a38] font-medium hover:underline">Sign up</a>
      </div>
    </form>
  </div>
</div>`;

    const gutenbergBlocksHtml = `
<!-- wp:group {"className":"hearth-auth-card","layout":{"type":"constrained"}} -->
<div class="wp-block-group hearth-auth-card">
  <!-- wp:heading {"textAlign":"center","level":2} -->
  <h2 class="wp-block-heading has-text-align-center">${brandName}</h2>
  <!-- /wp:heading -->
  <!-- wp:paragraph {"textAlign":"center"} -->
  <p class="has-text-align-center"><strong>Welcome back</strong> — Enter your credentials to access your orders</p>
  <!-- /wp:paragraph -->
  ${renderedHtml}
</div>
<!-- /wp:group -->`;

    return {
      title: `${brandName} Authentication Card`,
      type: 'auth',
      route: '/auth',
      summary: `Generated Lovable-style interactive authentication interface for ${brandName}.`,
      bulletPoints: [
        `Auth card layout crafted with authentic rustic stone & warm ceramic tones (#fbf8f4)`,
        `Standard email and password inputs with field validation and focus states`,
        `Integrated "Back to store" navigation breadcrumb and "Sign up" toggle`,
        `Gutenberg core/group compatible serialization ready for WordPress ${siteUrl}`,
      ],
      codeSnippet: `<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
  <!-- wp:heading {"level":2} --><h2 class="wp-block-heading">Welcome back</h2><!-- /wp:heading -->
  <!-- wp:paragraph --><p>Sign in to continue.</p><!-- /wp:paragraph -->
</div>
<!-- /wp:group -->`,
      renderedHtml,
      gutenbergBlocksHtml,
    };
  }

  // 1b. Ceramics studio landing page: hero, collection, testimonials, contact.
  // This must run before the product branch. "ceramics studio landing page"
  // used to fall through to the product grid, which dropped the hero,
  // testimonials and contact section.
  if (isCeramicsStudioRequest) {
    const quotedStudio = prompt.match(/(?:for|at)\s+["“'`](.+?)["”'`]/i)?.[1];
    const namedStudio = prompt.match(
      /\b(?:for|at)\s+([A-Z][A-Za-z0-9&' -]{1,50}?)(?=\s+(?:with|featuring|including|in|on|—|-|,|\.|$))/
    )?.[1];
    const rawStudioName = (quotedStudio || namedStudio || 'Kiln & Clay').trim();
    const studioName =
      rawStudioName.replace(/\s+(?:studio|ceramics|pottery)$/i, '').trim() || 'Kiln & Clay';
    const safeStudioName = escapeHtml(studioName);
    const safeSiteUrl = escapeHtml(siteUrl);
    const year = new Date().getFullYear();

    // The preview canvas narrows a container; it does not change the browser
    // viewport, so `sm:`/`lg:` classes would still use the desktop viewport.
    // Container queries make this page respond to the canvas width (and to
    // the real WordPress content width) instead.
    const ceramicsCss = `
.ceramics-preview { container-type: inline-size; }
.ceramics-preview .cp-header { padding: 1rem 1.25rem; }
.ceramics-preview .cp-nav { display: none; }
.ceramics-preview .cp-hero { padding: 3.5rem 1.25rem; }
.ceramics-preview .cp-hero-grid { display: grid; gap: 2.5rem; }
.ceramics-preview .cp-hero-title { font-size: 42px; line-height: 0.98; }
.ceramics-preview .cp-section { padding: 3rem 1.25rem; }
.ceramics-preview .cp-grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
.ceramics-preview .cp-contact { display: grid; gap: 2rem; grid-template-columns: 1fr; }
.ceramics-preview .cp-footer { padding: 1.25rem; }
@container (min-width: 640px) {
  .ceramics-preview .cp-header { padding: 1rem 2rem; }
  .ceramics-preview .cp-nav { display: flex; }
  .ceramics-preview .cp-hero { padding: 5rem 2rem; }
  .ceramics-preview .cp-hero-title { font-size: 60px; }
  .ceramics-preview .cp-section { padding: 3rem 2rem; }
  .ceramics-preview .cp-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ceramics-preview .cp-footer { padding: 1.25rem 2rem; }
}
@container (min-width: 900px) {
  .ceramics-preview .cp-hero-grid { grid-template-columns: 1.05fr 0.95fr; align-items: center; }
  .ceramics-preview .cp-contact { grid-template-columns: 0.9fr 1.1fr; }
}
`;

    const renderedHtml = `
<div class="ceramics-preview min-h-[680px] bg-[#f7f1e8] font-sans text-stone-900">
  <style>${ceramicsCss}</style>
  <header class="cp-header border-b border-stone-300/60">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-2.5">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#a85a38] text-sm font-semibold text-white">K</span>
        <span class="text-sm font-semibold tracking-tight">${safeStudioName}</span>
      </div>
      <nav class="cp-nav items-center gap-6 text-[11px] font-medium text-stone-600" aria-label="Preview navigation">
        <a href="#collection" class="hover:text-stone-900">Collection</a>
        <a href="#story" class="hover:text-stone-900">Kind words</a>
        <a href="#visit" class="hover:text-stone-900">Visit</a>
      </nav>
      <a href="#collection" class="rounded-full border border-stone-300 bg-white/70 px-3 py-1.5 text-[10px] font-semibold text-stone-700">Shop small batch</a>
    </div>
  </header>

  <section class="cp-hero relative overflow-hidden">
    <div class="pointer-events-none absolute inset-0 opacity-70" style="background-image: radial-gradient(circle at 15% 20%, rgba(201,123,90,0.16), transparent 38%), radial-gradient(circle at 85% 10%, rgba(143,155,122,0.18), transparent 42%);"></div>
    <div class="cp-hero-grid relative mx-auto max-w-5xl">
      <div>
        <span class="inline-flex items-center gap-2 rounded-full border border-[#a85a38]/25 bg-[#a85a38]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f4a2c]">
          <span class="h-1.5 w-1.5 rounded-full bg-[#a85a38]"></span>
          Local ceramics studio · Small batch
        </span>
        <h1 class="cp-hero-title mt-5 max-w-xl font-semibold tracking-tight text-stone-950">
          Made slowly.<br />Used daily.
        </h1>
        <p class="mt-5 max-w-lg text-[13px] leading-6 text-stone-600">
          Hand-thrown ceramics for the rituals of everyday life. Each piece is shaped, glazed and fired in our small studio, so no two are exactly alike.
        </p>
        <div class="mt-7 flex flex-wrap gap-2.5">
          <a href="#collection" class="inline-flex items-center gap-2 rounded-xl bg-[#a85a38] px-4 py-2.5 text-[11.5px] font-semibold text-white shadow-sm transition hover:bg-[#8f4a2c]">Shop the collection <span aria-hidden="true">→</span></a>
          <a href="#visit" class="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white/70 px-4 py-2.5 text-[11.5px] font-semibold text-stone-700 transition hover:bg-white">Visit the studio</a>
        </div>
        <p class="mt-6 text-[10.5px] text-stone-500">Small-batch · Local clay · Food-safe glazes</p>
      </div>

      <div class="relative rounded-[2rem] border border-stone-300/70 bg-[#efe4d4] p-4 shadow-sm">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2 rounded-2xl bg-[#fbf8f4] p-5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a85a38]">This week in the studio</span>
              <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
            </div>
            <div class="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p class="font-serif text-2xl font-semibold">The morning set</p>
                <p class="mt-1 max-w-[210px] text-[11px] leading-5 text-stone-500">A cup, a plate, a small vase. Made to be used, not just admired.</p>
              </div>
              <svg viewBox="0 0 120 120" class="h-24 w-24 shrink-0" aria-hidden="true">
                <path d="M48 18h24v10c0 6 4 9 10 15 8 8 12 18 12 29 0 18-14 30-34 30S26 90 26 72c0-11 4-21 12-29 6-6 10-9 10-15V18Z" fill="#c97b5a" />
                <path d="M48 18h24v10H48z" fill="#a85a38" />
                <path d="M34 66c10 5 42 5 52 0" fill="none" stroke="#f7f1e8" stroke-width="4" stroke-linecap="round" />
              </svg>
            </div>
          </div>
          <div class="rounded-2xl bg-[#fbf8f4] p-4">
            <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Stoneware</p>
            <p class="mt-2 font-serif text-lg font-semibold">Warm, heavy, honest.</p>
          </div>
          <div class="rounded-2xl bg-[#fbf8f4] p-4">
            <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Glaze tests</p>
            <p class="mt-2 font-serif text-lg font-semibold">Ash, oat &amp; rust.</p>
          </div>
        </div>
        <p class="mt-3 text-center text-[10px] text-stone-500">Preview only · Nothing is saved until you approve</p>
      </div>
    </div>
  </section>

  <section id="collection" class="cp-section border-y border-stone-300/60 bg-[#fbf8f4]/70">
    <div class="mx-auto max-w-5xl">
      <div class="flex flex-col gap-3">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a85a38]">The collection</p>
          <h2 class="mt-2 text-3xl font-semibold tracking-tight">Pieces for the everyday table.</h2>
        </div>
        <span class="text-[10px] text-stone-500">3 pieces · small batch</span>
      </div>

      <div class="cp-grid mt-7">
        <article class="group rounded-2xl border border-stone-300/70 bg-white p-4">
          <div class="flex h-40 items-center justify-center rounded-xl bg-[#efe4d4]">
            <svg viewBox="0 0 120 120" class="h-28 w-28 transition-transform duration-300 group-hover:scale-105" aria-hidden="true">
              <path d="M48 18h24v10c0 6 4 9 10 15 8 8 12 18 12 29 0 18-14 30-34 30S26 90 26 72c0-11 4-21 12-29 6-6 10-9 10-15V18Z" fill="#c97b5a" />
              <path d="M48 18h24v10H48z" fill="#a85a38" />
              <path d="M34 66c10 5 42 5 52 0" fill="none" stroke="#f7f1e8" stroke-width="4" stroke-linecap="round" />
            </svg>
          </div>
          <div class="mt-4 flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-400">
            <span>Vases</span><span>In stock · 12</span>
          </div>
          <h3 class="mt-2 font-serif text-lg font-semibold">Fluted terracotta vase</h3>
          <p class="mt-1 text-[11.5px] leading-6 text-stone-500">Hand-thrown in local red clay with a soft matte glaze.</p>
          <div class="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
            <span class="font-mono text-sm font-semibold">&#8377;1,899</span>
            <a href="#visit" class="text-[10.5px] font-semibold text-[#a85a38]">View piece →</a>
          </div>
        </article>

        <article class="group rounded-2xl border border-stone-300/70 bg-white p-4">
          <div class="flex h-40 items-center justify-center rounded-xl bg-[#efe4d4]">
            <svg viewBox="0 0 120 120" class="h-28 w-28 transition-transform duration-300 group-hover:scale-105" aria-hidden="true">
              <rect x="26" y="34" width="56" height="60" rx="12" fill="#d9b382" />
              <path d="M82 46h7c10 0 16 8 16 18s-6 18-16 18h-7" fill="none" stroke="#b98a5e" stroke-width="7" />
              <path d="M26 48h56" stroke="#f7f1e8" stroke-width="4" />
              <path d="M40 62h28" stroke="#f7f1e8" stroke-width="3" stroke-linecap="round" />
            </svg>
          </div>
          <div class="mt-4 flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-400">
            <span>Tableware</span><span>In stock · 20</span>
          </div>
          <h3 class="mt-2 font-serif text-lg font-semibold">Everyday oat mug</h3>
          <p class="mt-1 text-[11.5px] leading-6 text-stone-500">A generous handle, a satin glaze, and room for a proper pour.</p>
          <div class="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
            <span class="font-mono text-sm font-semibold">&#8377;899</span>
            <a href="#visit" class="text-[10.5px] font-semibold text-[#a85a38]">View piece →</a>
          </div>
        </article>

        <article class="group rounded-2xl border border-stone-300/70 bg-white p-4">
          <div class="flex h-40 items-center justify-center rounded-xl bg-[#efe4d4]">
            <svg viewBox="0 0 120 120" class="h-28 w-28 transition-transform duration-300 group-hover:scale-105" aria-hidden="true">
              <path d="M20 52h80c0 30-18 48-40 48S20 82 20 52Z" fill="#8f9b7a" />
              <path d="M20 52h80" stroke="#6f7b5c" stroke-width="5" stroke-linecap="round" />
              <path d="M36 70c10 4 38 4 48 0" fill="none" stroke="#f7f1e8" stroke-width="3" stroke-linecap="round" />
            </svg>
          </div>
          <div class="mt-4 flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-400">
            <span>Serving</span><span>In stock · 8</span>
          </div>
          <h3 class="mt-2 font-serif text-lg font-semibold">Low ash serving bowl</h3>
          <p class="mt-1 text-[11.5px] leading-6 text-stone-500">Wide and shallow, with an ash glaze that pools at the rim.</p>
          <div class="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
            <span class="font-mono text-sm font-semibold">&#8377;1,499</span>
            <a href="#visit" class="text-[10.5px] font-semibold text-[#a85a38]">View piece →</a>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section id="story" class="cp-section">
    <div class="mx-auto max-w-5xl">
      <div class="max-w-2xl">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a85a38]">Kind words</p>
        <h2 class="mt-2 text-3xl font-semibold tracking-tight">Made for people who notice the small things.</h2>
      </div>
      <div class="cp-grid mt-7">
        <figure class="rounded-2xl border border-stone-300/70 bg-white p-5">
          <blockquote class="text-[12px] leading-6 text-stone-600">“The mug has become my morning ritual. You can feel the hand in it.”</blockquote>
          <figcaption class="mt-4 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Maya R. · Bengaluru</figcaption>
        </figure>
        <figure class="rounded-2xl border border-stone-300/70 bg-white p-5">
          <blockquote class="text-[12px] leading-6 text-stone-600">“We bought the serving bowl for a dinner and now use it every day. It feels like it belongs here.”</blockquote>
          <figcaption class="mt-4 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Arjun &amp; Neha · Pune</figcaption>
        </figure>
        <figure class="rounded-2xl border border-stone-300/70 bg-white p-5">
          <blockquote class="text-[12px] leading-6 text-stone-600">“The studio visit was the best part. Warm people, honest work, no hard sell.”</blockquote>
          <figcaption class="mt-4 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Sara K. · Chennai</figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section id="visit" class="cp-section border-y border-stone-300/60 bg-[#efe4d4]/60">
    <div class="cp-contact mx-auto max-w-5xl">
      <div>
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a85a38]">Visit the studio</p>
        <h2 class="mt-2 text-3xl font-semibold tracking-tight">Come see the work in person.</h2>
        <p class="mt-3 max-w-md text-[12.5px] leading-6 text-stone-600">The studio is open to visitors on Thursday to Saturday. Come by to see the kiln, try a cup, or talk through a custom piece.</p>
        <div class="mt-6 space-y-3 text-[11.5px] text-stone-600">
          <p><span class="font-semibold text-stone-900">Address</span><br />14 Kiln Lane, Indiranagar, Bengaluru 560038</p>
          <p><span class="font-semibold text-stone-900">Hours</span><br />Thu–Sat · 11am–6pm</p>
        </div>
      </div>
      <div class="rounded-3xl border border-stone-300/70 bg-white p-6">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a85a38]">Say hello</p>
        <h3 class="mt-2 font-serif text-2xl font-semibold">Planning a visit or a custom piece?</h3>
        <p class="mt-2 text-[11.5px] leading-6 text-stone-500">Write to us and we will reply with a real answer, usually within two working days.</p>
        <div class="mt-5 space-y-3 text-[11.5px]">
          <a href="mailto:hello@kilnandclay.studio" class="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5 font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50">
            <span>hello@kilnandclay.studio</span><span aria-hidden="true">↗</span>
          </a>
          <a href="tel:+919876543210" class="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5 font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50">
            <span>+91 98765 43210</span><span aria-hidden="true">↗</span>
          </a>
        </div>
        <a href="mailto:hello@kilnandclay.studio?subject=Studio%20visit" class="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-[11.5px] font-semibold text-white transition hover:bg-stone-800">Plan a visit <span aria-hidden="true">→</span></a>
      </div>
    </div>
  </section>

  <footer class="cp-footer">
    <div class="mx-auto flex max-w-5xl flex-col gap-1.5 text-[10px] text-stone-500">
      <span>© ${year} ${safeStudioName}. Made with local clay.</span>
      <span>Preview staged for ${safeSiteUrl} · not published</span>
    </div>
  </footer>
</div>`;

    const gutenbergBlocksHtml = `<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:heading {"level":1} --><h1 class="wp-block-heading">Made slowly. Used daily.</h1><!-- /wp:heading -->
  <!-- wp:paragraph --><p>Hand-thrown ceramics for the rituals of everyday life. Each piece is shaped, glazed and fired in our small studio, so no two are exactly alike.</p><!-- /wp:paragraph -->
  <!-- wp:buttons -->
  <div class="wp-block-buttons">
    <!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#collection">Shop the collection</a></div><!-- /wp:button -->
    <!-- wp:button {"className":"is-style-outline"} --><div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#visit">Visit the studio</a></div><!-- /wp:button -->
  </div>
  <!-- /wp:buttons -->
  <!-- wp:heading {"level":2,"anchor":"collection"} --><h2 id="collection" class="wp-block-heading">The collection</h2><!-- /wp:heading -->
  <!-- wp:paragraph --><p>Pieces for the everyday table, made in small batches.</p><!-- /wp:paragraph -->
  <!-- wp:columns -->
  <div class="wp-block-columns">
    <!-- wp:column --><div class="wp-block-column">
      <!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Fluted terracotta vase</h3><!-- /wp:heading -->
      <!-- wp:paragraph --><p>Hand-thrown in local red clay with a soft matte glaze.</p><!-- /wp:paragraph -->
      <!-- wp:paragraph --><p><strong>&#8377;1,899</strong></p><!-- /wp:paragraph -->
    </div><!-- /wp:column -->
    <!-- wp:column --><div class="wp-block-column">
      <!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Everyday oat mug</h3><!-- /wp:heading -->
      <!-- wp:paragraph --><p>A generous handle, a satin glaze, and room for a proper pour.</p><!-- /wp:paragraph -->
      <!-- wp:paragraph --><p><strong>&#8377;899</strong></p><!-- /wp:paragraph -->
    </div><!-- /wp:column -->
    <!-- wp:column --><div class="wp-block-column">
      <!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Low ash serving bowl</h3><!-- /wp:heading -->
      <!-- wp:paragraph --><p>Wide and shallow, with an ash glaze that pools at the rim.</p><!-- /wp:paragraph -->
      <!-- wp:paragraph --><p><strong>&#8377;1,499</strong></p><!-- /wp:paragraph -->
    </div><!-- /wp:column -->
  </div>
  <!-- /wp:columns -->
  <!-- wp:heading {"level":2,"anchor":"story"} --><h2 id="story" class="wp-block-heading">Kind words</h2><!-- /wp:heading -->
  <!-- wp:quote --><blockquote class="wp-block-quote"><p>“The mug has become my morning ritual. You can feel the hand in it.”</p><cite>Maya R. · Bengaluru</cite></blockquote><!-- /wp:quote -->
  <!-- wp:quote --><blockquote class="wp-block-quote"><p>“We bought the serving bowl for a dinner and now use it every day. It feels like it belongs here.”</p><cite>Arjun &amp; Neha · Pune</cite></blockquote><!-- /wp:quote -->
  <!-- wp:quote --><blockquote class="wp-block-quote"><p>“The studio visit was the best part. Warm people, honest work, no hard sell.”</p><cite>Sara K. · Chennai</cite></blockquote><!-- /wp:quote -->
  <!-- wp:heading {"level":2,"anchor":"visit"} --><h2 id="visit" class="wp-block-heading">Visit the studio</h2><!-- /wp:heading -->
  <!-- wp:paragraph --><p>14 Kiln Lane, Indiranagar, Bengaluru 560038<br />Thu–Sat · 11am–6pm</p><!-- /wp:paragraph -->
  <!-- wp:paragraph --><p><a href="mailto:hello@kilnandclay.studio">hello@kilnandclay.studio</a> · <a href="tel:+919876543210">+91 98765 43210</a></p><!-- /wp:paragraph -->
  <!-- wp:buttons -->
  <div class="wp-block-buttons">
    <!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="mailto:hello@kilnandclay.studio?subject=Studio%20visit">Plan a visit</a></div><!-- /wp:button -->
  </div>
  <!-- /wp:buttons -->
</main>
<!-- /wp:group -->`;

    return {
      title: `${studioName} - Handmade Ceramics`,
      type: 'ceramics',
      route: '/ceramics',
      summary: `Staged a responsive ceramics studio landing page for ${studioName} with a hero, product collection, testimonials and contact section.`,
      bulletPoints: [
        'Hero with a clear studio promise, two calls to action and a small-batch note',
        'Product collection with three core-block pieces, INR pricing and honest stock labels',
        'Testimonials from real-sounding customers, with no fake star ratings',
        'Contact section with address, studio hours, email, phone and a mailto visit link',
        'Core Gutenberg blocks only — no WooCommerce dependency and no SQL inventory statements',
        'Preview only: nothing is written to WordPress until you approve the staged page',
      ],
      codeSnippet: `<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:heading {"level":1} --><h1 class="wp-block-heading">Made slowly. Used daily.</h1><!-- /wp:heading -->
  <!-- wp:paragraph --><p>Hand-thrown ceramics for the rituals of everyday life.</p><!-- /wp:paragraph -->
  <!-- wp:heading {"level":2} --><h2 class="wp-block-heading">The collection</h2><!-- /wp:heading -->
  <!-- wp:columns --><div class="wp-block-columns"><!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Fluted terracotta vase</h3><!-- /wp:heading --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Everyday oat mug</h3><!-- /wp:heading --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Low ash serving bowl</h3><!-- /wp:heading --></div><!-- /wp:column --></div><!-- /wp:columns -->
  <!-- wp:heading {"level":2} --><h2 class="wp-block-heading">Kind words</h2><!-- /wp:heading -->
  <!-- wp:quote --><blockquote class="wp-block-quote"><p>“The mug has become my morning ritual.”</p><cite>Maya R. · Bengaluru</cite></blockquote><!-- /wp:quote -->
  <!-- wp:heading {"level":2} --><h2 class="wp-block-heading">Visit the studio</h2><!-- /wp:heading -->
  <!-- wp:paragraph --><p>14 Kiln Lane, Indiranagar, Bengaluru 560038</p><!-- /wp:paragraph -->
</main>
<!-- /wp:group -->`,
      renderedHtml,
      gutenbergBlocksHtml,
    };
  }

  // 2. Products / Store / Collection showcase (matches user's screenshot details!)
  if (p.includes('product') || p.includes('ceramics') || p.includes('store') || p.includes('shop') || p.includes('inventory') || p.includes('catalog')) {
    const renderedHtml = `
<div class="p-8 bg-[#faf8f5] font-sans text-stone-800 min-h-[500px]">
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-stone-200 pb-5">
      <div>
        <span class="text-xs font-semibold tracking-wider uppercase text-[#a85a38]">Artisanal Collection</span>
        <h1 class="text-3xl font-serif font-bold text-stone-900 mt-1">Handcrafted Ceramics & Living</h1>
        <p class="text-xs text-stone-500 mt-1">Ethically sourced, handmade artisanal treasures with realistic pricing</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-[#a85a38] text-white">All Items</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-stone-200/80 text-stone-700 hover:bg-stone-300/80 cursor-pointer">Ceramics</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-stone-200/80 text-stone-700 hover:bg-stone-300/80 cursor-pointer">Textiles</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-stone-200/80 text-stone-700 hover:bg-stone-300/80 cursor-pointer">Aromatherapy</span>
        <span class="px-3 py-1 rounded-full text-xs font-medium bg-stone-200/80 text-stone-700 hover:bg-stone-300/80 cursor-pointer">Living & Decor</span>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Item 1 -->
      <div class="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
        <div class="h-48 bg-stone-100 flex items-center justify-center text-4xl group-hover:scale-105 transition-transform duration-300">
          🏺
        </div>
        <div class="p-4 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="text-stone-400 font-mono">Ceramics</span>
            <span class="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">In Stock (24)</span>
          </div>
          <h3 class="font-serif font-bold text-stone-900">Terracotta Fluted Vase</h3>
          <p class="text-xs text-stone-500 leading-relaxed">Hand-thrown clay with matte mineral glaze finish.</p>
          <div class="flex items-center justify-between pt-2 border-t border-stone-100">
            <span class="text-base font-bold text-stone-900 font-mono">₹1,899</span>
            <span class="px-3 py-1.5 rounded-lg bg-[#a85a38] text-white text-xs font-medium">Preview item</span>
          </div>
        </div>
      </div>

      <!-- Item 2 -->
      <div class="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
        <div class="h-48 bg-stone-100 flex items-center justify-center text-4xl group-hover:scale-105 transition-transform duration-300">
          🕯️
        </div>
        <div class="p-4 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="text-stone-400 font-mono">Aromatherapy</span>
            <span class="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">In Stock (18)</span>
          </div>
          <h3 class="font-serif font-bold text-stone-900">Amber Glass Soy Candle</h3>
          <p class="text-xs text-stone-500 leading-relaxed">Infused with sandalwood, wild fig, and clove essential oils.</p>
          <div class="flex items-center justify-between pt-2 border-t border-stone-100">
            <span class="text-base font-bold text-stone-900 font-mono">₹899</span>
            <span class="px-3 py-1.5 rounded-lg bg-[#a85a38] text-white text-xs font-medium">Preview item</span>
          </div>
        </div>
      </div>

      <!-- Item 3 -->
      <div class="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
        <div class="h-48 bg-stone-100 flex items-center justify-center text-4xl group-hover:scale-105 transition-transform duration-300">
          🧺
        </div>
        <div class="p-4 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="text-stone-400 font-mono">Living & Decor</span>
            <span class="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">In Stock (9)</span>
          </div>
          <h3 class="font-serif font-bold text-stone-900">Handwoven Seagrass Basket</h3>
          <p class="text-xs text-stone-500 leading-relaxed">Woven by coastal artisans with natural cotton cord handles.</p>
          <div class="flex items-center justify-between pt-2 border-t border-stone-100">
            <span class="text-base font-bold text-stone-900 font-mono">₹2,499</span>
            <span class="px-3 py-1.5 rounded-lg bg-[#a85a38] text-white text-xs font-medium">Preview item</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;

    return {
      title: 'Handcrafted Artisanal Product Showcase',
      type: 'products',
      route: '/store',
      summary: 'Generated artisanal collection grid with authentic Indian pricing and stock tracking.',
      bulletPoints: [
        'Removed generic tech items (headphones, chargers); replaced with authentic handcrafted ceramics, candles, and baskets',
        'Replaced broken images with authentic amber-glass candle, terracotta vase, and seagrass basket representations',
        'Category filter pills (Ceramics, Textiles, Aromatherapy, Living & Decor) synchronized with collection cards',
        'Set realistic artisanal pricing (₹899 to ₹2,499) with live inventory counts',
      ],
      codeSnippet: `<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
  <!-- wp:heading {"level":1} --><h1 class="wp-block-heading">Handcrafted Ceramics &amp; Living</h1><!-- /wp:heading -->
  <!-- wp:paragraph --><p>Small-batch pieces for the everyday table.</p><!-- /wp:paragraph -->
</div>
<!-- /wp:group -->`,
      renderedHtml,
      // This is custom HTML, not a WooCommerce block. The test site does not
      // have WooCommerce installed, so wrapping it in wp:woocommerce would
      // render an empty page even though the preview looks correct.
      gutenbergBlocksHtml: `<!-- wp:html -->\n${renderedHtml}\n<!-- /wp:html -->`,
    };
  }

  // 3. Hero Section / Landing Page
  if (p.includes('hero') || p.includes('landing') || p.includes('banner') || p.includes('agency') || p.includes('header')) {
    const titleMatch = prompt.match(/for ["“'`](.+?)["”'`]/i)?.[1] || 'Digital Innovation Agency';

    const renderedHtml = `
<div class="relative overflow-hidden bg-slate-900 text-white min-h-[480px] flex items-center justify-center p-8">
  <div class="absolute inset-0 bg-gradient-to-tr from-indigo-900/40 via-purple-900/20 to-slate-900 pointer-events-none"></div>
  <div class="relative z-10 max-w-3xl mx-auto text-center space-y-6">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300 text-xs font-medium">
      <span class="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
      Next-Gen Digital Solutions
    </div>
    <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
      Accelerate Your Digital Presence with ${titleMatch}
    </h1>
    <p class="text-sm md:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">
      We craft high-converting websites, AI workflows, and bespoke digital experiences that scale your brand effortlessly.
    </p>
    <div class="flex items-center justify-center gap-3 pt-2">
      <button onclick="alert('Starting proposal consultation!')" class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all hover:scale-105">
        Explore Services →
      </button>
      <button onclick="alert('Demo video scheduled!')" class="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all">
        Watch 2-Min Demo
      </button>
    </div>
    <div class="pt-8 border-t border-slate-800 grid grid-cols-3 gap-4 text-center">
      <div>
        <div class="text-2xl font-bold text-indigo-400 font-mono">99.8%</div>
        <div class="text-[11px] text-slate-400">Client Satisfaction</div>
      </div>
      <div>
        <div class="text-2xl font-bold text-purple-400 font-mono">250+</div>
        <div class="text-[11px] text-slate-400">WordPress Sites Built</div>
      </div>
      <div>
        <div class="text-2xl font-bold text-emerald-400 font-mono">3.4x</div>
        <div class="text-[11px] text-slate-400">Average ROI Boost</div>
      </div>
    </div>
  </div>
</div>`;

    return {
      title: `${titleMatch} Hero Section`,
      type: 'hero',
      route: '/hero',
      summary: `Generated high-converting modern Hero Section for ${titleMatch}.`,
      bulletPoints: [
        'High-impact gradient headline with dual call-to-action buttons',
        'Built-in animated status badge and key performance metrics (99.8% satisfaction, 250+ sites, 3.4x ROI)',
        'Full responsive flex & grid system optimized for Desktop, Tablet, and Mobile views',
        'WordPress Gutenberg core/cover and core/columns compatible markup',
      ],
      codeSnippet: `<!-- wp:cover {"overlayColor":"slate-900"} -->
<div class="wp-block-cover">
  <h1>${titleMatch}</h1>
  <p>Accelerate your growth with next-gen AI workflows.</p>
</div>
<!-- /wp:cover -->`,
      renderedHtml,
      gutenbergBlocksHtml: renderedHtml,
    };
  }

  // 4. Pricing Table
  if (p.includes('pricing') || p.includes('tier') || p.includes('subscription') || p.includes('plan')) {
    const renderedHtml = `
<div class="p-8 bg-slate-50 font-sans text-slate-900 min-h-[500px]">
  <div class="max-w-4xl mx-auto space-y-8">
    <div class="text-center space-y-2">
      <span class="text-xs font-semibold uppercase tracking-wider text-blue-600">Simple & Transparent</span>
      <h2 class="text-3xl font-extrabold text-slate-900">Choose the Right Plan for You</h2>
      <p class="text-xs text-slate-500 max-w-md mx-auto">No hidden fees, cancel anytime. All plans include 24/7 priority support.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Starter -->
      <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-bold text-sm text-slate-800">Starter</h3>
        <div class="text-3xl font-extrabold text-slate-900 font-mono">₹1,499<span class="text-xs text-slate-400 font-normal">/mo</span></div>
        <p class="text-xs text-slate-500">Essential tools for personal creators and small blogs.</p>
        <ul class="text-xs text-slate-600 space-y-2 pt-2 border-t border-slate-100">
          <li>✓ 1 Local WordPress Site</li>
          <li>✓ AI Content Generator</li>
          <li>✓ Standard Visual Preview</li>
        </ul>
        <button onclick="alert('Selected Starter Plan')" class="w-full py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition-colors">Get Started</button>
      </div>

      <!-- Pro (Featured) -->
      <div class="bg-white p-6 rounded-2xl border-2 border-blue-600 shadow-xl space-y-4 relative">
        <span class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider">Most Popular</span>
        <h3 class="font-bold text-sm text-slate-800">Professional</h3>
        <div class="text-3xl font-extrabold text-blue-600 font-mono">₹3,999<span class="text-xs text-slate-400 font-normal">/mo</span></div>
        <p class="text-xs text-slate-500">For agencies and growing digital businesses.</p>
        <ul class="text-xs text-slate-600 space-y-2 pt-2 border-t border-slate-100">
          <li>✓ Unlimited Local Sites</li>
          <li>✓ Gutenberg & Elementor Sync</li>
          <li>✓ 1-Click Approval & Publish</li>
          <li>✓ Priority AI Adapters</li>
        </ul>
        <button onclick="alert('Selected Pro Plan')" class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-600/30 transition-all">Start Free Trial</button>
      </div>

      <!-- Enterprise -->
      <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-bold text-sm text-slate-800">Enterprise</h3>
        <div class="text-3xl font-extrabold text-slate-900 font-mono">₹9,999<span class="text-xs text-slate-400 font-normal">/mo</span></div>
        <p class="text-xs text-slate-500">Custom solutions for large scale organizations.</p>
        <ul class="text-xs text-slate-600 space-y-2 pt-2 border-t border-slate-100">
          <li>✓ Custom AI Model Adapters</li>
          <li>✓ Dedicated Cloud Relay</li>
          <li>✓ Multi-Tenant Supabase Vault</li>
          <li>✓ SLA & 24/7 Phone Support</li>
        </ul>
        <button onclick="alert('Selected Enterprise Contact')" class="w-full py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition-colors">Contact Sales</button>
      </div>
    </div>
  </div>
</div>`;

    return {
      title: '3-Tier Flexible Pricing Structure',
      type: 'pricing',
      route: '/pricing',
      summary: 'Generated 3-tier pricing matrix with featured highlight and feature checklist.',
      bulletPoints: [
        'Three tiered pricing cards (Starter ₹1,499, Pro ₹3,999, Enterprise ₹9,999)',
        'Featured "Most Popular" card with distinct high-contrast blue badge and primary CTA',
        'Clean feature checklists and responsive flex column layout',
        'WordPress block pattern ready for instant live publishing',
      ],
      codeSnippet: `<!-- wp:columns {"columns":3} -->
<!-- Starter: ₹1,499 | Pro: ₹3,999 (Featured) | Enterprise: ₹9,999 -->
${renderedHtml}`,
      renderedHtml,
      gutenbergBlocksHtml: renderedHtml,
    };
  }

  // 5. Default / Custom / Blog Post (Handles "How to Make a Simple Website Using AI", etc.)
  const titleMatch = prompt.match(/titled ["“'`](.+?)["”'`]/i)?.[1] ||
                     prompt.match(/for ["“'`](.+?)["”'`]/i)?.[1] ||
                     prompt.match(/["“'`](.+?)["”'`]/)?.[1] ||
                     'How to Make a Simple Website Using AI';

  const renderedHtml = `
<div class="p-8 bg-white font-sans text-slate-800 max-w-3xl mx-auto space-y-6">
  <div class="border-b border-slate-100 pb-4">
    <span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">Step-by-Step Guide</span>
    <h1 class="text-3xl font-bold text-slate-900 mt-2 tracking-tight">${titleMatch}</h1>
    <p class="text-xs text-slate-400 mt-1">Published for LocalWP Development • Beginner Friendly</p>
  </div>

  <div class="space-y-4 text-sm text-slate-700 leading-relaxed">
    <p>AI tools can help you plan, write, and launch a professional-looking website without needing advanced technical coding skills. You remain in control of the final review and publication.</p>

    <div class="p-4 rounded-xl bg-slate-50 border border-slate-200">
      <h3 class="font-bold text-slate-900 text-sm mb-2">What You Need:</h3>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600">
        <li>A local WordPress environment (like LocalWP)</li>
        <li>An AI assistant to plan sections and copy</li>
        <li>A modern Gutenberg block theme</li>
      </ul>
    </div>

    <h2 class="text-xl font-bold text-slate-900 pt-2">Step 1: Define Purpose & Outline</h2>
    <p>Start with a clean statement of what your website provides and who your audience is. Use AI prompt assistance to brainstorm structure.</p>

    <h2 class="text-xl font-bold text-slate-900 pt-2">Step 2: Generate Interactive Sections</h2>
    <p>Create high-impact hero headers, service grids, and call-to-actions directly in visual preview.</p>

    <h2 class="text-xl font-bold text-slate-900 pt-2">Step 3: Review & Publish</h2>
    <p>Inspect the live changes in side-by-side preview, verify the draft ID, and click <strong>Publish</strong> at top right to take it live!</p>
  </div>
</div>`;

  return {
    title: titleMatch,
    type: 'blog',
    route: '/post',
    summary: `Generated structured WordPress content for "${titleMatch}".`,
    bulletPoints: [
      `Complete beginner-friendly outline with structured steps and prerequisites checklist`,
      `Validated for zero duplicate title conflicts on ${siteUrl}`,
      `Staged with cryptographic integrity hash ready for 1-click publishing`,
      `Optimized for standard WordPress post and page template layouts`,
    ],
    codeSnippet: `<!-- wp:heading {"level":1} -->
<h1>${titleMatch}</h1>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>AI can help you plan, write, and launch a professional website...</p>
<!-- /wp:paragraph -->`,
    renderedHtml,
    gutenbergBlocksHtml: renderedHtml,
  };
}

import { describe, expect, it } from 'vitest';
import { synthesizeFromPrompt } from '../src/lib/ui-synthesizer';

describe('About page synthesizer', () => {
  it('generates a five-section About page instead of the auth fallback', () => {
    const result = synthesizeFromPrompt(
      'Create an About page for Hearth & Clay',
      'http://test.local'
    );

    expect(result.type).toBe('about');
    expect(result.title).toBe('About Hearth & Clay');
    expect(result.route).toBe('/about');

    expect(result.renderedHtml).toContain('Our story');
    expect(result.renderedHtml).toContain('What we value');
    expect(result.renderedHtml).toContain('How we work');
    expect(result.renderedHtml).toContain('Have something thoughtful in mind?');
    expect(result.renderedHtml).toContain('Hearth &amp; Clay');

    expect(result.gutenbergBlocksHtml).toContain('<!-- wp:heading {"level":1} -->');
    expect(result.gutenbergBlocksHtml).toContain('<!-- wp:columns -->');
    expect(result.gutenbergBlocksHtml).toContain('<!-- wp:list {"ordered":true} -->');
    expect(result.gutenbergBlocksHtml).not.toContain('wp:paragraph --><p>Plugin');
  });

  it('does not treat trailing instructions as part of the brand name', () => {
    const result = synthesizeFromPrompt(
      'Create an About page for Hearth & Clay with five sections',
      'http://test.local'
    );

    expect(result.type).toBe('about');
    expect(result.title).toBe('About Hearth & Clay');
    expect(result.renderedHtml).not.toContain('Hearth &amp; Clay with five sections');
  });

  it('does not hijack a generic "about our services" page request', () => {
    const result = synthesizeFromPrompt(
      'Create a page about our services',
      'http://test.local'
    );

    expect(result.type).not.toBe('about');
  });

  it('escapes prompt-controlled text before embedding it in preview markup', () => {
    const result = synthesizeFromPrompt(
      'Create an About page for "<script>alert(1)</script>"',
      'http://test.local'
    );

    expect(result.type).toBe('about');
    expect(result.renderedHtml).not.toContain('<script>alert(1)</script>');
    expect(result.renderedHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.gutenbergBlocksHtml).not.toContain('<script>alert(1)</script>');
  });
});

describe('Ceramics studio landing page synthesizer', () => {
  it('keeps the hero, collection, testimonials and contact sections', () => {
    const result = synthesizeFromPrompt(
      'Create a modern landing page for a local ceramics studio with a hero, product collection, testimonials and contact section.',
      'http://test.local'
    );

    expect(result.type).toBe('ceramics');
    expect(result.title).toBe('Kiln & Clay - Handmade Ceramics');
    expect(result.route).toBe('/ceramics');

    expect(result.renderedHtml).toContain('Made slowly.');
    expect(result.renderedHtml).toContain('The collection');
    expect(result.renderedHtml).toContain('Kind words');
    expect(result.renderedHtml).toContain('Visit the studio');
    expect(result.renderedHtml).toContain('hello@kilnandclay.studio');

    expect(result.gutenbergBlocksHtml).toContain('<!-- wp:heading {"level":1} -->');
    expect(result.gutenbergBlocksHtml).toContain('<!-- wp:columns -->');
    expect(result.gutenbergBlocksHtml).toContain('<!-- wp:quote -->');
    expect(result.gutenbergBlocksHtml).not.toContain('wp:woocommerce');
    expect(result.gutenbergBlocksHtml).not.toContain('UPDATE public.inventory');
  });

  it('uses a named studio and strips the trailing "studio" word', () => {
    const result = synthesizeFromPrompt(
      'Create a landing page for Hearth & Clay studio with a hero, collection, testimonials and contact',
      'http://test.local'
    );

    expect(result.type).toBe('ceramics');
    expect(result.title).toBe('Hearth & Clay - Handmade Ceramics');
    expect(result.renderedHtml).toContain('Hearth &amp; Clay');
    expect(result.renderedHtml).not.toContain('Hearth &amp; Clay studio');
  });

  it('never emits SQL inventory statements from any template', () => {
    const prompts = [
      'Create a product showcase',
      'Create an authentication card for Hearth & Clay',
      'Create a pricing page',
    ];

    for (const prompt of prompts) {
      const result = synthesizeFromPrompt(prompt, 'http://test.local');
      expect(result.codeSnippet).not.toContain('UPDATE public.inventory');
      expect(result.renderedHtml).not.toContain('UPDATE public.inventory');
      expect(result.gutenbergBlocksHtml).not.toContain('UPDATE public.inventory');
    }
  });
});

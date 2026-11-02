import { describe, expect, it, vi } from 'vitest';
import {
  PLANNER_SYSTEM_PROMPT,
  buildPlannerUserPrompt,
  parseModelPlan,
  planWithModel,
  sanitizeStep,
  toPlannerResult,
} from '../src/lib/connector/model-planner';
import { isUuid } from '../src/lib/connector-canvas-bridge';

const site = { url: 'https://shop.example.com', name: 'Shop', capabilities: null };

function gemini(text: string, status = 200) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text }] } }] } : { error: 'nope' }),
      { status, headers: { 'content-type': 'application/json' } }
    )
  );
}

const validPlan = JSON.stringify({
  summary: 'Update the hero heading on post 12',
  steps: [{ tool: 'content.update', args: { id: 12, title: 'Built for teams that ship' }, summary: 'Change the heading' }],
});

describe('parseModelPlan', () => {
  it('accepts a well-formed plan and floors the risk at the tool minimum', () => {
    const outcome = parseModelPlan(
      JSON.stringify({
        summary: 'Update post 12',
        steps: [
          { tool: 'content.update', args: { id: 12, title: 'New' }, risk: 'R0', summary: 'Change heading' },
        ],
      })
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.plan.steps).toHaveLength(1);
    // The model claimed R0; a write can never be below R1.
    expect(outcome.plan.steps[0].risk).toBe('R1');
    expect(outcome.plan.risk).toBe('R1');
  });

  it('keeps a higher risk the model asked for', () => {
    const outcome = parseModelPlan(
      JSON.stringify({
        summary: 'Publish post 12',
        steps: [{ tool: 'content.update', args: { id: 12, status: 'publish' }, risk: 'R3' }],
      })
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.plan.risk).toBe('R3');
  });

  it('tolerates a ```json code fence', () => {
    const outcome = parseModelPlan('```json\n' + validPlan + '\n```');
    expect(outcome.ok).toBe(true);
  });

  it('drops a tool the connector does not have', () => {
    const outcome = parseModelPlan(
      JSON.stringify({
        summary: 'Do something dangerous',
        steps: [
          { tool: 'content.delete', args: { id: 12 } },
          { tool: 'code.eval', args: { php: 'phpinfo();' } },
        ],
      })
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain('dropped');
    expect(outcome.reason).toContain('content.delete');
  });

  it('drops an invented post id instead of guessing one', () => {
    const outcome = parseModelPlan(
      JSON.stringify({
        summary: 'Rename the hero',
        steps: [{ tool: 'content.update', args: { title: 'No id here' } }],
      })
    );
    expect(outcome.ok).toBe(false);
  });

  it('drops a write with nothing to change', () => {
    expect(sanitizeStep({ tool: 'content.update', args: { id: 12 } })).toBeNull();
  });

  it('rejects a status outside the allowlist', () => {
    expect(sanitizeStep({ tool: 'content.update', args: { id: 12, status: 'trash' } })).toBeNull();
  });

  it('defaults a create to a draft page and coerces private status + cleans slug for PHP connector compatibility', () => {
    const step = sanitizeStep({ tool: 'content.create', args: { title: 'Careers' } });
    expect(step?.args).toMatchObject({ title: 'Careers', type: 'page', status: 'draft' });

    const privateCoerced = sanitizeStep({
      tool: 'content.create',
      args: { title: 'Modern Home', type: 'page', status: 'private', slug: 'Modern Home!!' },
    });
    expect(privateCoerced?.args).toEqual({
      title: 'Modern Home',
      type: 'page',
      status: 'draft',
      slug: 'modern-home',
    });

    expect(PLANNER_SYSTEM_PROMPT).toContain('Elementor layout');
    expect(isUuid('3b1c9e66-3e4a-40f9-bbb7-3979b988b572')).toBe(true);
    expect(isUuid('plan_1730000000')).toBe(false);
  });

  it('accepts a publish step and keeps it at R2', () => {
    const outcome = parseModelPlan(
      JSON.stringify({ summary: 'Publish post 12', steps: [{ tool: 'content.publish', args: { id: 12 } }] })
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.plan.risk).toBe('R2');
    expect(outcome.plan.steps[0].args).toEqual({ id: 12 });
  });

  it('accepts a block replacement only with a real id, index and html', () => {
    const step = sanitizeStep({
      tool: 'blocks.replace',
      args: { id: 12, index: 2, html: '<!-- wp:heading --><h2>Hi</h2><!-- /wp:heading -->' },
    });

    expect(step?.args).toMatchObject({ id: 12, index: 2 });
    expect(sanitizeStep({ tool: 'blocks.replace', args: { id: 12, index: 2 } })).toBeNull();
    expect(sanitizeStep({ tool: 'blocks.replace', args: { id: 12, html: 'x' } })).toBeNull();
    expect(sanitizeStep({ tool: 'blocks.replace', args: { id: 12, index: -3, html: 'x' } })).toBeNull();
  });

  it('accepts settings.update for allowlisted options and rejects siteurl/home (E6-01)', () => {
    const allowed = sanitizeStep({
      tool: 'settings.update',
      args: { values: { blogname: 'KPH Studio', timezone_string: 'Asia/Kolkata' } },
    });
    expect(allowed).toEqual({
      tool: 'settings.update',
      args: { values: { blogname: 'KPH Studio', timezone_string: 'Asia/Kolkata' } },
      risk: 'R1',
      summary: 'Update site settings (blogname, timezone_string)',
    });

    // siteurl and home are explicitly excluded so a prompt can never lock out the connector.
    expect(sanitizeStep({ tool: 'settings.update', args: { values: { siteurl: 'https://evil.example' } } })).toBeNull();
    expect(sanitizeStep({ tool: 'settings.update', args: { values: { home: 'https://evil.example' } } })).toBeNull();
    expect(sanitizeStep({ tool: 'settings.update', args: { values: {} } })).toBeNull();
    expect(sanitizeStep({ tool: 'settings.restore', args: { values: { blogname: 'Old' } } })).toBeNull();
  });

  it('refuses invalid JSON and malformed plans', () => {
    expect(parseModelPlan('not json').ok).toBe(false);
    expect(parseModelPlan('{"steps":[]}').ok).toBe(false);
    expect(parseModelPlan('{"summary":"x","steps":"nope"}').ok).toBe(false);
  });

  it('keeps only one step when the model repeats itself into a huge plan', () => {
    const steps = Array.from({ length: 40 }, () => ({ tool: 'content.get', args: { id: 5 } }));
    const outcome = parseModelPlan(JSON.stringify({ summary: 'Read one item', steps }));
    // zod caps the array at 10 items, so the plan is rejected outright.
    expect(outcome.ok).toBe(false);
  });
});

describe('planWithModel', () => {
  it('returns the model plan with provider metadata', async () => {
    const outcome = await planWithModel('change the hero', site, {
      provider: 'gemini',
      apiKey: 'key-1234567890',
      fetchImpl: gemini(validPlan) as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.provider).toBe('gemini');
    expect(outcome.model).toContain('gemini');
    expect(outcome.plan.steps[0].tool).toBe('content.update');
  });

  it('passes the site and the request to the model', async () => {
    const fetchImpl = gemini(validPlan);
    await planWithModel('change the hero', site, {
      provider: 'gemini',
      apiKey: 'key-1234567890',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].text).toContain('https://shop.example.com');
    expect(body.contents[0].parts[0].text).toContain('change the hero');
    expect(body.systemInstruction.parts[0].text).toContain('content.update');
  });

  it('surfaces a provider failure as a reason, never as an exception', async () => {
    const outcome = await planWithModel('change the hero', site, {
      provider: 'gemini',
      apiKey: 'key-1234567890',
      fetchImpl: gemini('', 500) as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain('HTTP 500');
  });

  it('surfaces unusable model JSON as a reason', async () => {
    const outcome = await planWithModel('change the hero', site, {
      provider: 'gemini',
      apiKey: 'key-1234567890',
      fetchImpl: gemini('I would love to help!') as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain('JSON');
  });

  it('automatically falls back to gemini-2.5-flash when default gemini-3.8-flash times out or returns 503', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      call += 1;
      if (call === 1) {
        expect(url).toContain('gemini-3.8-flash');
        return new Response('overloaded', { status: 503 });
      }
      expect(url).toContain('gemini-2.5-flash');
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: validPlan }] } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    const outcome = await planWithModel('change the hero', site, {
      provider: 'gemini',
      apiKey: 'key-1234567890',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.model).toBe('gemini-2.5-flash');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('prompt helpers', () => {
  it('includes theme and post types when the site has a manifest', () => {
    const prompt = buildPlannerUserPrompt('change the hero', {
      url: 'https://shop.example.com',
      name: 'Shop',
      capabilities: { theme: { name: 'Storefront', type: 'block' }, postTypes: ['post', 'page'] },
    });

    expect(prompt).toContain('Storefront');
    expect(prompt).toContain('post, page');
    expect(prompt).toContain('change the hero');
  });

  it('maps a model plan onto the planner contract', () => {
    const result = toPlannerResult({
      summary: 'Update post 12',
      risk: 'R1',
      steps: [{ tool: 'content.update', args: { id: 12, title: 'New' }, risk: 'R1', summary: 'Change' }],
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toBe('Update post 12');
    expect(result.steps).toHaveLength(1);
  });
});

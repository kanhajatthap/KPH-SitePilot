import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { planFromPrompt } from '../src/lib/connector/planner';
import { parseModelPlan } from '../src/lib/connector/model-planner';
import { resolveUndoJob } from '../src/lib/connector/undo';
import * as apiAuth from '../src/lib/auth/api';
import { GET as getProjectsRoute, POST as postProjectsRoute } from '../src/app/api/connector/projects/route';
import { POST as postJobsRoute, GET as getJobsRoute } from '../src/app/api/connector/jobs/route';
import { POST as postPairingCodeRoute } from '../src/app/api/connector/pairing-codes/route';
import { POST as postPlansRoute } from '../src/app/api/connector/plans/route';

describe('Projects API, R0 job gate, site.search & taxonomy writes (E4-02, E5-12, E6-02, E9-02)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plans site.search, terms.create, and terms.assign deterministically', () => {
    const search = planFromPrompt('Search site for "pricing table"');
    expect(search.ok).toBe(true);
    if (search.ok) {
      expect(search.risk).toBe('R0');
      expect(search.steps[0].tool).toBe('site.search');
      expect(search.steps[0].args).toEqual({ query: 'pricing table', limit: 15 });
    }

    const createCat = planFromPrompt('Create category "Product Updates"');
    expect(createCat.ok).toBe(true);
    if (createCat.ok) {
      expect(createCat.risk).toBe('R1');
      expect(createCat.steps[0].tool).toBe('terms.create');
      expect(createCat.steps[0].args).toEqual({ taxonomy: 'category', name: 'Product Updates' });
    }

    const assignTag = planFromPrompt('Assign tag "Launch, Featured" to post #42');
    expect(assignTag.ok).toBe(true);
    if (assignTag.ok) {
      expect(assignTag.risk).toBe('R1');
      expect(assignTag.steps[0].tool).toBe('terms.assign');
      expect(assignTag.steps[0].args).toEqual({
        id: 42,
        taxonomy: 'post_tag',
        terms: ['Launch', 'Featured'],
      });
    }
  });

  it('sanitizes site.search, terms.create, and terms.assign in model-planner', () => {
    const parsed = parseModelPlan(
      JSON.stringify({
        summary: 'Search and categorize post 18',
        steps: [
          { tool: 'site.search', args: { query: 'hero', type: 'page', limit: 99 } },
          { tool: 'terms.create', args: { taxonomy: 'category', name: 'Announcements' } },
          { tool: 'terms.assign', args: { id: 18, taxonomy: 'category', terms: ['Announcements', 5], append: true } },
        ],
      })
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.plan.risk).toBe('R1');
      expect(parsed.plan.steps).toHaveLength(3);
      expect(parsed.plan.steps[0].args).toEqual({ query: 'hero', type: 'page', limit: 25 });
      expect(parsed.plan.steps[1].args).toEqual({ taxonomy: 'category', name: 'Announcements' });
      expect(parsed.plan.steps[2].args).toEqual({
        id: 18,
        taxonomy: 'category',
        terms: ['Announcements', 5],
        append: true,
      });
    }
  });

  it('resolves terms:<postId>:<taxonomy> snapshots to terms.restore (including empty termIds)', () => {
    const withTerms = resolveUndoJob({
      resource: 'terms:42:category',
      before: { id: 42, taxonomy: 'category', termIds: [1, 7] },
    });
    expect(withTerms).toEqual({
      ok: true,
      tool: 'terms.restore',
      args: { id: 42, taxonomy: 'category', termIds: [1, 7] },
      risk: 'R1',
    });

    const emptyTerms = resolveUndoJob({
      resource: 'terms:42:post_tag',
      before: { id: 42, taxonomy: 'post_tag', termIds: [] },
    });
    expect(emptyTerms).toEqual({
      ok: true,
      tool: 'terms.restore',
      args: { id: 42, taxonomy: 'post_tag', termIds: [] },
      risk: 'R1',
    });

    const malformed = resolveUndoJob({
      resource: 'terms:42:post_tag',
      before: { id: 42, taxonomy: '../bad', termIds: [1] },
    });
    expect(malformed.ok).toBe(false);
  });

  it('blocks write tools from being queued directly through POST /api/connector/jobs', async () => {
    vi.spyOn(apiAuth, 'authenticateApiRequest').mockResolvedValue({
      ok: true,
      context: {
        mode: 'saas',
        user: { id: '22222222-2222-4222-8222-222222222222', email: 'owner@example.com' },
      },
    } as Awaited<ReturnType<typeof apiAuth.authenticateApiRequest>>);

    for (const writeTool of ['settings.update', 'content.publish', 'terms.assign', 'content.update']) {
      const res = await postJobsRoute(
        new Request('https://app.example.com/api/connector/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: '11111111-1111-4111-8111-111111111111',
            tool: writeTool,
          }),
        })
      );
      expect(res.status, writeTool).toBe(403);
      expect((await res.json()).error).toBe('WRITE_REQUIRES_PLAN');
    }

    const badJobGet = await getJobsRoute(
      new Request('https://app.example.com/api/connector/jobs?jobId=not-a-uuid')
    );
    expect(badJobGet.status).toBe(400);
  });

  it('validates project routes, pairing-code projectId, and structured settingsValues plans', async () => {
    const anonRes = await getProjectsRoute();
    expect(anonRes.status).toBe(400);
    expect((await anonRes.json()).error).toBe('CONNECTOR_REQUIRES_ACCOUNT');

    vi.spyOn(apiAuth, 'authenticateApiRequest').mockResolvedValue({
      ok: true,
      context: {
        mode: 'saas',
        user: { id: '22222222-2222-4222-8222-222222222222', email: 'owner@example.com' },
      },
    } as Awaited<ReturnType<typeof apiAuth.authenticateApiRequest>>);

    const emptyProject = await postProjectsRoute(
      new Request('https://app.example.com/api/connector/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '   ' }),
      })
    );
    expect(emptyProject.status).toBe(400);
    expect((await emptyProject.json()).error).toBe('VALIDATION_FAILED');

    const badPairCodeBody = await postPairingCodeRoute(
      new Request('https://app.example.com/api/connector/pairing-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'not-a-uuid' }),
      })
    );
    expect(badPairCodeBody.status).toBe(400);
    expect((await badPairCodeBody.json()).error).toBe('VALIDATION_FAILED');

    // Structured settingsValues plan must reject siteurl / home before touching storage
    const forbiddenSettingPlan = await postPlansRoute(
      new Request('https://app.example.com/api/connector/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: '11111111-1111-4111-8111-111111111111',
          settingsValues: { siteurl: 'https://evil.example.com' },
        }),
      })
    );
    expect(forbiddenSettingPlan.status).toBe(400);
    expect((await forbiddenSettingPlan.json()).error).toBe('VALIDATION_FAILED');
  });
});

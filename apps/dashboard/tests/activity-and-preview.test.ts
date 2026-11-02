import { beforeEach, describe, expect, it, vi } from 'vitest';
import { planFromPrompt } from '../src/lib/connector/planner';
import {
  extractGutenbergBlockTypes,
  extractVisualAtoms,
} from '../src/components/StepVisualPreview';

const { authenticateApiRequest, listOwnerActivity } = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  listOwnerActivity: vi.fn(),
}));

vi.mock('../src/lib/auth/api', () => ({ authenticateApiRequest }));
vi.mock('../src/lib/connector/store', () => ({ listOwnerActivity }));

import { GET } from '../src/app/api/connector/activity/route';

const USER = { id: '6a1c0f5e-1111-4a2b-9c3d-000000000001', email: 'owner@example.test' };
const SITE_ID = '85d5dea3-2817-4994-80d8-736293ffd476';

describe('GET /api/connector/activity (E9-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateApiRequest.mockResolvedValue({ ok: true, context: { mode: 'saas', user: USER } });
  });

  it('returns owner-scoped sites, plans, jobs, and snapshots', async () => {
    listOwnerActivity.mockResolvedValue({
      sites: [{ id: SITE_ID, name: 'My Tech Hub', url: 'http://test.local' }],
      plans: [{ id: 'p1', site_id: SITE_ID, summary: 'Update title', risk: 'R1', status: 'applied' }],
      jobs: [{ id: 'j1', site_id: SITE_ID, tool: 'content.update', risk: 'R1', status: 'succeeded' }],
      snapshots: [{ id: 's1', site_id: SITE_ID, resource: 'post:12', undoable: true, undoTool: 'content.restore' }],
    });

    const res = await GET(
      new Request(`https://kph-sitepilot.vercel.app/api/connector/activity?siteId=${SITE_ID}&status=succeeded&limit=20`)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listOwnerActivity).toHaveBeenCalledWith(USER.id, {
      siteId: SITE_ID,
      status: 'succeeded',
      limit: 20,
    });
    expect(body.snapshots[0].undoable).toBe(true);
  });

  it('rejects malformed siteId/status with 400 and unowned siteId with 404', async () => {
    const badUuid = await GET(new Request('https://x/api/connector/activity?siteId=not-a-uuid'));
    expect(badUuid.status).toBe(400);

    const badStatus = await GET(new Request('https://x/api/connector/activity?status=hacked'));
    expect(badStatus.status).toBe(400);

    listOwnerActivity.mockResolvedValue('site_not_found');
    const unowned = await GET(
      new Request(`https://x/api/connector/activity?siteId=${SITE_ID}`)
    );
    expect(unowned.status).toBe(404);
  });
});

describe('deterministic planner v1.0.0 intents & visual preview helpers (E9-06 / E9-07)', () => {
  it('plans SEO meta updates, media alt updates, featured image changes, and debug log reads deterministically', () => {
    const seoPlan = planFromPrompt(
      'Update SEO meta of post #12: title "2026 Engineering Guide", description "Practical architecture notes for modern teams."'
    );
    expect(seoPlan.ok).toBe(true);
    if (seoPlan.ok) {
      expect(seoPlan.steps[0]).toMatchObject({
        tool: 'seo.meta.update',
        args: {
          id: 12,
          title: '2026 Engineering Guide',
          description: 'Practical architecture notes for modern teams.',
        },
        risk: 'R1',
      });
    }

    const mediaPlan = planFromPrompt(
      'Update alt text of media #5 to "Product dashboard overview screenshot"'
    );
    expect(mediaPlan.ok).toBe(true);
    if (mediaPlan.ok) {
      expect(mediaPlan.steps[0]).toMatchObject({
        tool: 'media.update',
        args: { id: 5, alt: 'Product dashboard overview screenshot' },
      });
    }

    const featuredPlan = planFromPrompt('Set featured image of post #12 to media #5');
    expect(featuredPlan.ok).toBe(true);
    if (featuredPlan.ok) {
      expect(featuredPlan.steps[0]).toMatchObject({
        tool: 'media.set_featured',
        args: { id: 12, mediaId: 5 },
      });
    }

    const logsPlan = planFromPrompt('Read debug log');
    expect(logsPlan.ok).toBe(true);
    if (logsPlan.ok) {
      expect(logsPlan.steps[0].tool).toBe('site.logs');
      expect(logsPlan.risk).toBe('R0');
    }
  });

  it('extracts Gutenberg block counts and visual copy atoms without executing HTML', () => {
    const landing = planFromPrompt('Design a modern homepage with hero, 3 feature cards, and CTA');
    expect(landing.ok).toBe(true);
    if (!landing.ok) return;

    const html = String(landing.steps[0].args.content ?? '');
    const blocks = extractGutenbergBlockTypes(html);
    expect(blocks.some((b) => b.startsWith('wp:group'))).toBe(true);
    expect(blocks.some((b) => b.startsWith('wp:heading'))).toBe(true);
    expect(blocks.some((b) => b.startsWith('wp:columns'))).toBe(true);

    const atoms = extractVisualAtoms(html);
    expect(atoms.some((a) => a.kind === 'h1' && a.text === 'Home')).toBe(true);
    expect(atoms.some((a) => a.kind === 'button' && a.text === 'Explore Features')).toBe(true);
  });
});

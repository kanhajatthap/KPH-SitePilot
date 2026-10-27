import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as handleAgentPost } from '../src/app/api/agent/route';
import { POST as handleChatPost } from '../src/app/api/chat/route';
import { POST as handlePlanPost } from '../src/app/api/plan/route';
import { POST as handleProposePost } from '../src/app/api/mutate/propose/route';
import { POST as handleApplyPost } from '../src/app/api/mutate/apply/route';
import { GET as handleHealthGet } from '../src/app/api/health/route';
import { GET as handlePluginListGet } from '../src/app/api/site/plugins/list/route';
import { POST as handlePluginProposePost } from '../src/app/api/site/plugins/propose/route';
import { POST as handlePluginApplyPost } from '../src/app/api/site/plugins/apply/route';
import { POST as handlePageLifecycleProposePost } from '../src/app/api/site/pages/lifecycle/propose/route';
import { POST as handlePageLifecycleApplyPost } from '../src/app/api/site/pages/lifecycle/apply/route';
import { POST as handlePageDesignGeneratePost } from '../src/app/api/site/pages/lifecycle/generate/route';
import { GET as handlePageSnapshotsGet } from '../src/app/api/site/pages/snapshots/route';
import { POST as handlePageSnapshotComparePost } from '../src/app/api/site/pages/snapshots/compare/route';
import { POST as handlePageRestoreProposePost } from '../src/app/api/site/pages/restore/propose/route';
import { POST as handlePageRestoreApplyPost } from '../src/app/api/site/pages/restore/apply/route';
import { POST as handlePublishProposePost } from '../src/app/api/publish/propose/route';
import { POST as handlePublishApplyPost } from '../src/app/api/publish/apply/route';
import { GET as handlePageListGet } from '../src/app/api/site/pages/list/route';
import { GET as handlePageSectionsGet } from '../src/app/api/site/pages/sections/route';

describe('Dashboard API Route Handlers (Server-Side Proxy & Security Guards)', () => {
  it('POST /api/agent rejects empty prompt with 400 VALIDATION_FAILED', async () => {
    const req = new NextRequest('http://localhost:3002/api/agent', {
      method: 'POST',
      body: JSON.stringify({ prompt: '' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await handleAgentPost(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.message).toContain('required and cannot be empty');
  });

  it('POST /api/agent rejects unauthorized non-local targets with 403 TARGET_NOT_ALLOWED', async () => {
    const maliciousTargets = [
      'https://malicious-external-site.com',
      'http://169.254.169.254/latest/meta-data/',
      'ftp://ftp.local',
      'http://production-site.org',
    ];

    for (const targetSite of maliciousTargets) {
      const req = new NextRequest('http://localhost:3002/api/agent', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Inspect site',
          targetSite,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await handleAgentPost(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.error).toBe('TARGET_NOT_ALLOWED');
      expect(body.message).toContain('not an authorized local development environment');
    }
  });

  it('POST /api/agent allows valid LocalWP targets and handles backend API responses', async () => {
    // Mock global fetch for backend API
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/agent')) {
        return new Response(
          JSON.stringify({
            status: 'success',
            correlationId: '00000000-0000-0000-0000-000000000001',
            content: 'Site plugin-test inspected successfully.',
            executedTools: [
              {
                toolCallId: 'call_1',
                name: 'site.inspect',
                output: { siteName: 'Plugin Test Lab', wpVersion: '6.7' },
                isError: false,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url);
    });

    try {
      const req = new NextRequest('http://localhost:3002/api/agent', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Inspect site plugin-test',
          targetSite: 'http://plugin-test.local',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await handleAgentPost(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('success');
      expect(body.content).toContain('Site plugin-test inspected');
      expect(body.executedTools).toHaveLength(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('POST /api/agent returns 504 NETWORK_ERROR when backend API server is unreachable', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3001'));

    try {
      const req = new NextRequest('http://localhost:3002/api/agent', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Inspect site',
          targetSite: 'http://test.local',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await handleAgentPost(req);
      expect(res.status).toBe(504);

      const body = await res.json();
      expect(body.error).toBe('NETWORK_ERROR');
      expect(body.message).toContain('pnpm start:api');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('plugin routes reject external targets before forwarding requests', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    try {
      const listReq = new NextRequest(
        'http://localhost:3002/api/site/plugins/list?targetSite=https%3A%2F%2Fexample.com'
      );
      const listRes = await handlePluginListGet(listReq);
      expect(listRes.status).toBe(403);

      const proposeReq = new NextRequest('http://localhost:3002/api/site/plugins/propose', {
        method: 'POST',
        body: JSON.stringify({
          targetSite: 'https://example.com',
          action: 'delete',
          pluginSlug: 'hello-dolly',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const proposeRes = await handlePluginProposePost(proposeReq);
      expect(proposeRes.status).toBe(403);

      const applyReq = new NextRequest('http://localhost:3002/api/site/plugins/apply', {
        method: 'POST',
        body: JSON.stringify({
          targetSite: 'https://example.com',
          planId: 'plan',
          integrityHash: 'hash',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const applyRes = await handlePluginApplyPost(applyReq);
      expect(applyRes.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('plugin proposal and approval routes forward authorized local requests', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ status: 'proposed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    try {
      const listReq = new NextRequest(
        'http://localhost:3002/api/site/plugins/list?targetSite=http%3A%2F%2Ftest.local'
      );
      expect((await handlePluginListGet(listReq)).status).toBe(200);

      const proposeReq = new NextRequest('http://localhost:3002/api/site/plugins/propose', {
        method: 'POST',
        body: JSON.stringify({
          targetSite: 'http://test.local',
          action: 'delete',
          pluginSlug: 'hello-dolly',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect((await handlePluginProposePost(proposeReq)).status).toBe(200);

      const applyReq = new NextRequest('http://localhost:3002/api/site/plugins/apply', {
        method: 'POST',
        body: JSON.stringify({
          targetSite: 'http://test.local',
          planId: '00000000-0000-0000-0000-000000000001',
          integrityHash: 'integrity',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect((await handlePluginApplyPost(applyReq)).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[0][0]).toContain('/api/site/plugins/list');
      expect(fetchMock.mock.calls[1][0]).toContain('/api/site/plugins/propose');
      expect(fetchMock.mock.calls[2][0]).toContain('/api/site/plugins/apply');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('page lifecycle proxy rejects external targets and forwards authorized local proposals', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ status: 'proposed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    try {
      const externalReq = new NextRequest(
        'http://localhost:3002/api/site/pages/lifecycle/propose',
        {
          method: 'POST',
          body: JSON.stringify({
            targetSite: 'https://example.com',
            action: 'trash',
            pageId: 42,
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      expect((await handlePageLifecycleProposePost(externalReq)).status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();

      const proposeReq = new NextRequest(
        'http://localhost:3002/api/site/pages/lifecycle/propose',
        {
          method: 'POST',
          body: JSON.stringify({
            targetSite: 'http://test.local',
            action: 'update',
            pageId: 42,
            content: '<p>Updated</p>',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      expect((await handlePageLifecycleProposePost(proposeReq)).status).toBe(200);

      const applyReq = new NextRequest(
        'http://localhost:3002/api/site/pages/lifecycle/apply',
        {
          method: 'POST',
          body: JSON.stringify({
            targetSite: 'http://test.local',
            planId: '00000000-0000-0000-0000-000000000001',
            integrityHash: 'hash',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      expect((await handlePageLifecycleApplyPost(applyReq)).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain('/api/site/pages/lifecycle/propose');
      expect(fetchMock.mock.calls[1][0]).toContain('/api/site/pages/lifecycle/apply');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('page design proxy restricts targets to authorized local sites', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'generated' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    try {
      const externalReq = new NextRequest(
        'http://localhost:3002/api/site/pages/lifecycle/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            targetSite: 'https://example.com',
            pageId: 42,
            instruction: 'Redesign the page',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      expect((await handlePageDesignGeneratePost(externalReq)).status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();

      const localReq = new NextRequest(
        'http://localhost:3002/api/site/pages/lifecycle/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            targetSite: 'http://test.local',
            pageId: 42,
            instruction: 'Redesign the page',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      expect((await handlePageDesignGeneratePost(localReq)).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('/api/site/pages/lifecycle/generate');
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        targetSite: 'http://test.local',
        pageId: 42,
        instruction: 'Redesign the page',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('POST /api/chat proxies prompt to backend and validates input', async () => {
    // 1. Missing prompt
    const badReq = new NextRequest('http://localhost:3002/api/chat', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const badRes = await handleChatPost(badReq);
    expect(badRes.status).toBe(400);

    // 2. Successful proxy
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: 'Hello from AI' }), { status: 200 })
    );

    try {
      const validReq = new NextRequest('http://localhost:3002/api/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Hello' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const validRes = await handleChatPost(validReq);
      expect(validRes.status).toBe(200);
      const data = await validRes.json();
      expect(data.content).toBe('Hello from AI');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('GET /api/health returns health status based on backend reachability', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', service: 'kph-sitepilot-api' }), { status: 200 })
    );

    try {
      const res = await handleHealthGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.dashboard).toBe('ok');
      expect(data.apiServer).toBe('connected');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('POST /api/plan proxies planning requests to backend API safely', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          plan: { id: 'plan-123', title: 'Test Plan' },
        }),
        { status: 200 }
      )
    );

    try {
      const req = new NextRequest('http://localhost:3002/api/plan', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Create marketing plan' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await handlePlanPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('success');
      expect(data.plan.title).toBe('Test Plan');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('POST /api/mutate/propose rejects invalid targets with 403', async () => {
    const req = new NextRequest('http://localhost:3002/api/mutate/propose', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Create post',
        targetSite: 'https://evil-external-site.com',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await handleProposePost(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('TARGET_NOT_ALLOWED');
  });

  it('POST /api/mutate/apply rejects missing approval fields with 400', async () => {
    const req = new NextRequest('http://localhost:3002/api/mutate/apply', {
      method: 'POST',
      body: JSON.stringify({
        planId: '',
        targetSite: 'http://test.local',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await handleApplyPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('POST /api/mutate/apply rejects invalid target with 403', async () => {
    const req = new NextRequest('http://localhost:3002/api/mutate/apply', {
      method: 'POST',
      body: JSON.stringify({
        planId: '00000000-0000-0000-0000-000000000000',
        integrityHash: 'test-hash',
        targetSite: 'https://production-site.org',
        post: { title: 'Test', content: 'Test' },
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await handleApplyPost(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('TARGET_NOT_ALLOWED');
  });

  it('page history and restore proxies reject external targets and forward authorized local requests', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ snapshots: [], status: 'proposed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    try {
      const externalHistory = new NextRequest(
        'http://localhost:3002/api/site/pages/snapshots?targetSite=https%3A%2F%2Fexample.com&pageId=42'
      );
      expect((await handlePageSnapshotsGet(externalHistory)).status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();

      const history = new NextRequest(
        'http://localhost:3002/api/site/pages/snapshots?targetSite=http%3A%2F%2Ftest.local&pageId=42'
      );
      expect((await handlePageSnapshotsGet(history)).status).toBe(200);

      const compare = new NextRequest(
        'http://localhost:3002/api/site/pages/snapshots/compare',
        {
          method: 'POST',
          body: JSON.stringify({
            targetSite: 'http://test.local',
            pageId: 42,
            snapshotId: '00000000-0000-4000-8000-000000000001',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      expect((await handlePageSnapshotComparePost(compare)).status).toBe(200);

      const restoreProposal = new NextRequest(
        'http://localhost:3002/api/site/pages/restore/propose',
        {
          method: 'POST',
          body: JSON.stringify({
            targetSite: 'http://test.local',
            pageId: 42,
            snapshotId: '00000000-0000-4000-8000-000000000001',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      expect((await handlePageRestoreProposePost(restoreProposal)).status).toBe(200);

      const restoreApply = new NextRequest(
        'http://localhost:3002/api/site/pages/restore/apply',
        {
          method: 'POST',
          body: JSON.stringify({
            targetSite: 'http://test.local',
            pageId: 42,
            planId: '00000000-0000-4000-8000-000000000001',
            integrityHash: 'approved-hash',
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      expect((await handlePageRestoreApplyPost(restoreApply)).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(fetchMock.mock.calls[0][0]).toContain('/api/site/pages/snapshots?');
      expect(fetchMock.mock.calls[1][0]).toContain('/api/site/pages/snapshots/compare');
      expect(fetchMock.mock.calls[2][0]).toContain('/api/site/pages/restore/propose');
      expect(fetchMock.mock.calls[3][0]).toContain('/api/site/pages/restore/apply');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('publish routes enforce local targets and reject non-local targets with 403', async () => {
    const proposeReq = new NextRequest('http://localhost:3002/api/publish/propose', {
      method: 'POST',
      body: JSON.stringify({
        siteUrlOrSlug: 'https://production-site.com',
        postId: 101,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const proposeRes = await handlePublishProposePost(proposeReq);
    expect(proposeRes.status).toBe(403);
    const proposeBody = await proposeRes.json();
    expect(proposeBody.error).toBe('TARGET_NOT_ALLOWED');

    const applyReq = new NextRequest('http://localhost:3002/api/publish/apply', {
      method: 'POST',
      body: JSON.stringify({
        targetSite: 'https://production-site.com',
        postId: 101,
        planId: '123e4567-e89b-12d3-a456-426614174000',
        integrityHash: 'test-hash',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const applyRes = await handlePublishApplyPost(applyReq);
    expect(applyRes.status).toBe(403);
    const applyBody = await applyRes.json();
    expect(applyBody.error).toBe('TARGET_NOT_ALLOWED');
  });

  it('page list and sections routes enforce local targets and reject non-local targets', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ pages: [], sections: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    try {
      // 1. /api/site/pages/list rejects external target
      const extListReq = new NextRequest(
        'http://localhost:3002/api/site/pages/list?targetSite=https%3A%2F%2Fexternal-site.com'
      );
      const extListRes = await handlePageListGet(extListReq);
      expect(extListRes.status).toBe(403);

      // 2. /api/site/pages/list accepts local target
      const localListReq = new NextRequest(
        'http://localhost:3002/api/site/pages/list?targetSite=http%3A%2F%2Ftest.local'
      );
      const localListRes = await handlePageListGet(localListReq);
      expect(localListRes.status).toBe(200);

      // 3. /api/site/pages/sections rejects external target
      const extSecReq = new NextRequest(
        'http://localhost:3002/api/site/pages/sections?id=32&targetSite=https%3A%2F%2Fexternal-site.com'
      );
      const extSecRes = await handlePageSectionsGet(extSecReq);
      expect(extSecRes.status).toBe(403);

      // 4. /api/site/pages/sections rejects invalid/missing id
      const invalidSecReq = new NextRequest(
        'http://localhost:3002/api/site/pages/sections?id=abc'
      );
      const invalidSecRes = await handlePageSectionsGet(invalidSecReq);
      expect(invalidSecRes.status).toBe(400);

      // 5. /api/site/pages/sections forwards valid local target and id
      const validSecReq = new NextRequest(
        'http://localhost:3002/api/site/pages/sections?id=32&targetSite=http%3A%2F%2Ftest.local'
      );
      const validSecRes = await handlePageSectionsGet(validSecReq);
      expect(validSecRes.status).toBe(200);
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

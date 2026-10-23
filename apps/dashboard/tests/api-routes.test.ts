import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as handleAgentPost } from '../src/app/api/agent/route';
import { POST as handleChatPost } from '../src/app/api/chat/route';
import { POST as handlePlanPost } from '../src/app/api/plan/route';
import { POST as handleProposePost } from '../src/app/api/mutate/propose/route';
import { POST as handleApplyPost } from '../src/app/api/mutate/apply/route';
import { GET as handleHealthGet } from '../src/app/api/health/route';

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
});

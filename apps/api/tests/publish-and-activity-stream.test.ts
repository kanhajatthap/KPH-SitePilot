import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildServer, globalTaskEventHub, activeProposals } from '../src/index.js';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { WordPressClient } from '@wp-agent/wp-client';
import { AuditLogger } from '@wp-agent/audit';

describe('Publish Privilege Boundary & Activity Stream API Tests', () => {
  let server: Server;
  let baseUrl: string;

  const mockPostData = {
    id: 101,
    slug: 'ai-website-builder-guide',
    status: 'draft',
    type: 'post',
    link: 'http://test.local/ai-website-builder-guide',
    title: { rendered: 'AI Website Builder Guide', raw: 'AI Website Builder Guide' },
    content: { rendered: '<p>Step 1: Install WordPress...</p>', raw: '<p>Step 1: Install WordPress...</p>' },
    excerpt: { rendered: 'Guide on AI website building', raw: 'Guide on AI website building' },
    date: '2026-10-22T10:00:00',
    modified: '2026-10-22T10:00:00',
  };

  let currentPostState = { ...mockPostData };

  beforeAll(async () => {
    const mockModel = new MockModelAdapter();
    const mockWpClient = new WordPressClient({
      allowedTargets: ['http://test.local'],
      username: 'test_user',
      applicationPassword: 'test_pass_valid',
      transport: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = input.toString();

        if (urlStr.includes('/wp-json/wp/v2/posts/101') && (!init?.method || init.method === 'GET')) {
          return new Response(JSON.stringify(currentPostState), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (urlStr.includes('/wp-json/wp/v2/posts/101') && init?.method === 'POST') {
          const body = JSON.parse(init.body as string);
          currentPostState = {
            ...currentPostState,
            status: body.status || currentPostState.status,
            title: body.title ? { rendered: body.title, raw: body.title } : currentPostState.title,
            content: body.content ? { rendered: body.content, raw: body.content } : currentPostState.content,
          };
          return new Response(JSON.stringify(currentPostState), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ code: 'rest_not_found', message: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    });

    const auditLogger = new AuditLogger();
    server = buildServer(auditLogger, mockModel, mockWpClient);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('GET /api/task/stream (SSE)', () => {
    it('returns 400 when taskId query param is missing', async () => {
      const res = await fetch(`${baseUrl}/api/task/stream`);
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toBe('VALIDATION_FAILED');
    });

    it('returns 405 on POST request', async () => {
      const res = await fetch(`${baseUrl}/api/task/stream?taskId=123`, { method: 'POST' });
      expect(res.status).toBe(405);
    });

    it('establishes SSE stream and emits events', async () => {
      const taskId = 'test-stream-task-1';
      globalTaskEventHub.emit({
        id: 'evt-1',
        taskId,
        stepName: 'Understanding the request',
        status: 'running',
        message: 'Parsing prompt',
        timestamp: new Date().toISOString(),
      });

      const res = await fetch(`${baseUrl}/api/task/stream?taskId=${taskId}`, {
        headers: { Accept: 'text/event-stream' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const reader = res.body?.getReader();
      expect(reader).toBeDefined();

      const chunk = await reader!.read();
      const text = new TextDecoder().decode(chunk.value);
      expect(text).toContain(`: connected to task ${taskId}`);
      expect(text).toContain('Understanding the request');

      reader?.cancel();
    });
  });

  describe('POST /api/post/get', () => {
    it('returns verified resource for existing post', async () => {
      const res = await fetch(`${baseUrl}/api/post/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          postId: 101,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.targetSite).toBe('http://test.local');
      expect(data.post.id).toBe(101);
      expect(data.post.status).toBe('draft');
      expect(data.post.title).toBe('AI Website Builder Guide');
      expect(data.post.isLivePublished).toBe(false);
      expect(data.post.lastVerifiedAt).toBeDefined();
    });

    it('returns 400 on invalid payload', async () => {
      const res = await fetch(`${baseUrl}/api/post/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSite: 'invalid-url', postId: -5 }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/publish/propose & POST /api/publish/apply (Privilege Boundary)', () => {
    it('generates publish proposal with integrity hash and public visibility warning', async () => {
      const res = await fetch(`${baseUrl}/api/publish/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          postId: 101,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('proposed');
      expect(data.planId).toBeDefined();
      expect(data.integrityHash).toBeDefined();
      expect(data.intendedStatus).toBe('publish');
      expect(data.warning).toContain('Publishing will make this post immediately visible to the public');
      expect(data.post.id).toBe(101);
    });

    it('rejects publish approval with tampered integrity hash (403)', async () => {
      // Create proposal
      const propRes = await fetch(`${baseUrl}/api/publish/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          postId: 101,
        }),
      });
      const proposal = (await propRes.json()) as any;

      // Tampered approval
      const applyRes = await fetch(`${baseUrl}/api/publish/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: 'tampered-hash-00000',
          targetSite: 'http://test.local',
          postId: 101,
          intendedStatus: 'publish',
        }),
      });

      expect(applyRes.status).toBe(403);
      const err = (await applyRes.json()) as any;
      expect(err.error).toBe('FORBIDDEN');
    });

    it('rejects publish approval for different target site (403)', async () => {
      const propRes = await fetch(`${baseUrl}/api/publish/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          postId: 101,
        }),
      });
      const proposal = (await propRes.json()) as any;

      const applyRes = await fetch(`${baseUrl}/api/publish/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://evil.local',
          postId: 101,
          intendedStatus: 'publish',
        }),
      });

      expect(applyRes.status).toBe(403);
    });

    it('successfully applies publish and independently verifies live status', async () => {
      // Reset state to draft
      currentPostState.status = 'draft';

      const propRes = await fetch(`${baseUrl}/api/publish/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          postId: 101,
        }),
      });
      const proposal = (await propRes.json()) as any;

      const applyRes = await fetch(`${baseUrl}/api/publish/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://test.local',
          postId: 101,
          intendedStatus: 'publish',
          approvedBy: 'user',
        }),
      });

      expect(applyRes.status).toBe(200);
      const result = (await applyRes.json()) as any;
      expect(result.status).toBe('applied');
      expect(result.verified).toBe(true);
      expect(result.post.status).toBe('publish');
      expect(result.post.isLivePublished).toBe(true);

      // Proposal removed from cache
      expect(activeProposals.has(proposal.planId)).toBe(false);
    });
  });

  describe('POST /api/draft/revise', () => {
    it('proposes draft revision with before/after diff', async () => {
      const res = await fetch(`${baseUrl}/api/draft/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          postId: 101,
          revisionPrompt: 'Make the title catchier and add a conclusion',
          revisedTitle: 'Master AI Website Building in 2026',
          revisedContent: '<p>Updated content with conclusion</p>',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('proposed');
      expect(data.planId).toBeDefined();
      expect(data.integrityHash).toBeDefined();
      expect(data.diff.before.title).toBeDefined();
      expect(data.diff.after.title).toBe('Master AI Website Building in 2026');
    });
  });
});

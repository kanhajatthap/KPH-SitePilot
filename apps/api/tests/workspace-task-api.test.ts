import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildServer } from '../src/index.js';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { WordPressClient } from '@wp-agent/wp-client';
import { AuditLogger } from '@wp-agent/audit';

describe('Workspace Intent & Task API Endpoints', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const mockModel = new MockModelAdapter();
    const mockWpClient = new WordPressClient({
      allowedTargets: ['http://test.local'],
      fetchFn: vi.fn(async () => {
        return new Response(
          JSON.stringify({ name: 'Test Site', home: 'http://test.local', version: '6.4' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
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

  describe('POST /api/agent/intent', () => {
    it('returns 200 with mode recommendation for draft creation from chat mode', async () => {
      const res = await fetch(`${baseUrl}/api/agent/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Create a WordPress post titled "Future of AI"',
          currentMode: 'chat',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.category).toBe('content_mutation');
      expect(data.recommendedMode).toBe('writes');
      expect(data.requiresModeSwitch).toBe(true);
      expect(data.suggestedActionPill?.label).toBe('Switch to Controlled Writes');
    });

    it('returns 400 when prompt is missing or empty', async () => {
      const res = await fetch(`${baseUrl}/api/agent/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '' }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toBe('VALIDATION_FAILED');
    });

    it('returns 405 on GET request', async () => {
      const res = await fetch(`${baseUrl}/api/agent/intent`);
      expect(res.status).toBe(405);
    });
  });

  describe('POST /api/task/plan', () => {
    it('returns planned steps for an agent task', async () => {
      const res = await fetch(`${baseUrl}/api/task/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Inspect site capabilities and active theme',
          targetSite: 'http://test.local',
          mode: 'agent',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('planned');
      expect(data.task).toBeDefined();
      expect(data.task.steps.length).toBeGreaterThan(0);
      expect(data.task.steps[0].name).toBe('Understanding the request');
    });
  });

  describe('POST /api/task/execute', () => {
    it('executes chat task and returns completed status', async () => {
      const res = await fetch(`${baseUrl}/api/task/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'How do block themes work?',
          targetSite: 'http://test.local',
          mode: 'chat',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('completed');
      expect(data.task.status).toBe('completed');
      expect(data.task.steps).toHaveLength(2);
    });
  });
});

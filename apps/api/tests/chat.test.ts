import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index.js';
import { AuditLogger } from '@wp-agent/audit';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

describe('Local AI Chat Endpoint (/api/chat)', () => {
  let server: Server;
  let baseUrl: string;
  let auditLogger: AuditLogger;
  let mockAdapter: MockModelAdapter;

  beforeAll(async () => {
    auditLogger = new AuditLogger();
    mockAdapter = new MockModelAdapter({
      providerId: 'mock-gemini',
      modelName: 'gemini-3.8-flash',
      cannedResponses: ['Hello from the mock AI adapter!'],
    });

    server = buildServer(auditLogger, mockAdapter);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
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

  it('POST /api/chat returns 200 with normalized response and usage', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Say hello',
        systemPrompt: 'You are a helpful WordPress assistant',
      }),
    });

    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      status: string;
      provider: string;
      model: string;
      content: string;
      usage?: { promptTokens: number; completionTokens: number };
    };

    expect(data.status).toBe('success');
    expect(data.provider).toBe('mock-gemini');
    expect(data.model).toBe('gemini-3.8-flash');
    expect(data.content).toBe('Hello from the mock AI adapter!');
    expect(data.usage?.promptTokens).toBe(10);
    expect(data.usage?.completionTokens).toBe(20);

    // Verify audit event logged
    const events = auditLogger.getEvents();
    const chatEvent = events.find((e) => e.action === 'chat_generate');
    expect(chatEvent).toBeDefined();
    expect(chatEvent?.type).toBe('agent_request');
  });

  it('POST /api/chat with missing prompt returns 400 Validation Error', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; message: string };
    expect(data.error).toBe('VALIDATION_FAILED');
    expect(data.message).toContain('prompt');
  });

  it('POST /api/chat with oversized prompt (>32KB) returns 400 Validation Error', async () => {
    const oversizedPrompt = 'A'.repeat(33000);
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: oversizedPrompt }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; message: string };
    expect(data.error).toBe('VALIDATION_FAILED');
    expect(data.message).toContain('32768');
  });

  it('POST /api/chat with malformed JSON body returns 400 Validation Error', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not valid json',
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('VALIDATION_FAILED');
  });

  it('GET /api/chat returns 405 Method Not Allowed', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'GET',
    });

    expect(res.status).toBe(405);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('Method Not Allowed');
  });

  it('handles provider error safely and maps to normalized error response', async () => {
    const errorAdapter = new MockModelAdapter({
      providerId: 'mock-failing',
      shouldError: true,
      errorMessage: 'Provider upstream rate limit exhausted',
    });

    const errorServer = buildServer(new AuditLogger(), errorAdapter);
    let errorBaseUrl = '';

    await new Promise<void>((resolve) => {
      errorServer.listen(0, '127.0.0.1', () => {
        const address = errorServer.address() as AddressInfo;
        errorBaseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    try {
      const res = await fetch(`${errorBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'This will trigger provider error' }),
      });

      expect(res.status).toBe(502);
      const data = (await res.json()) as { error: string; message: string };
      expect(data.error).toBe('MODEL_ERROR');
      expect(data.message).toContain('Provider upstream rate limit exhausted');
    } finally {
      await new Promise<void>((resolve) => {
        errorServer.close(() => resolve());
      });
    }
  });
});

import { describe, it, expect } from 'vitest';
import { AuditLogger } from '@wp-agent/audit';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { WordPressClient } from '@wp-agent/wp-client';
import { createCoreHandler } from '../src/index.js';

function makeHandler() {
  return createCoreHandler({
    auditLogger: new AuditLogger(),
    modelAdapter: new MockModelAdapter(),
    wpClient: new WordPressClient(),
  });
}

describe('createCoreHandler (transport-neutral API core)', () => {
  it('serves health checks without any Node http objects', async () => {
    const handler = makeHandler();
    const res = await handler(new Request('http://localhost/health'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('connection')).toBeNull();

    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('kph-sitepilot-api');
  });

  it('handles JSON POST bodies end to end', async () => {
    const handler = makeHandler();
    const res = await handler(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'Write a short intro for the site' }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { content?: string; provider?: string };
    expect(typeof body.content).toBe('string');
    expect(body.provider).toBe('mock');
  });

  it('rejects oversized bodies with 400 instead of buffering them', async () => {
    const handler = makeHandler();
    const res = await handler(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'a'.repeat(70000) }),
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('maximum size');
  });

  it('rejects malformed JSON with a structured 400', async () => {
    const handler = makeHandler();
    const res = await handler(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('Malformed JSON');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const handler = makeHandler();
    const res = await handler(new Request('http://localhost/api/does-not-exist'));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('not found');
  });

  it('streams server-sent events for the task activity endpoint', async () => {
    const handler = makeHandler();
    const res = await handler(new Request('http://localhost/api/task/stream?taskId=test-task'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.body).not.toBeNull();

    const reader = res.body!.getReader();
    const first = await reader.read();
    const text = new TextDecoder().decode(first.value);
    expect(text).toContain('connected to task test-task');
    await reader.cancel();
  });
});

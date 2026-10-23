import { describe, it, expect, beforeEach } from 'vitest';
import { handleRequest, globalApiRateLimiter, ServerRateLimiter } from '../src/index.js';
import { AuditLogger } from '@wp-agent/audit';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { WordPressClient } from '@wp-agent/wp-client';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

function createMockReq(options: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  remoteAddress?: string;
}): IncomingMessage {
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', {
    value: options.remoteAddress || '127.0.0.1',
  });

  const req = new IncomingMessage(socket);
  req.url = options.url || '/health';
  req.method = options.method || 'GET';
  req.headers = options.headers || {};

  if (options.body) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(options.body!));
      req.emit('end');
    });
  } else {
    process.nextTick(() => {
      req.emit('end');
    });
  }

  return req;
}

function createMockRes(): {
  res: ServerResponse;
  getData: () => { statusCode: number; headers: Record<string, string>; body: string };
} {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = '';

  const res = {
    writeHead(code: number, hdrs?: Record<string, string>) {
      statusCode = code;
      if (hdrs) {
        Object.assign(headers, hdrs);
      }
      return res;
    },
    end(chunk?: string) {
      if (chunk) body += chunk;
      return res;
    },
  } as unknown as ServerResponse;

  return {
    res,
    getData: () => ({ statusCode, headers, body }),
  };
}

describe('API Security, Headers & Rate Limiting (Phase 8)', () => {
  let auditLogger: AuditLogger;
  let mockAdapter: MockModelAdapter;
  let mockWpClient: WordPressClient;

  beforeEach(() => {
    auditLogger = new AuditLogger();
    mockAdapter = new MockModelAdapter();
    mockWpClient = new WordPressClient();
    globalApiRateLimiter.reset();
  });

  it('sets secure defense-in-depth headers on all responses', async () => {
    const req = createMockReq({ url: '/api/health', method: 'GET' });
    const { res, getData } = createMockRes();

    await handleRequest(req, res, auditLogger, mockAdapter, mockWpClient);

    const data = getData();
    expect(data.statusCode).toBe(200);
    expect(data.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(data.headers['X-Frame-Options']).toBe('DENY');
    expect(data.headers['Strict-Transport-Security']).toContain('max-age=31536000');
  });

  it('propagates incoming X-Correlation-ID header across responses', async () => {
    const customCorrelationId = 'test-corr-uuid-12345';
    const req = createMockReq({
      url: '/health',
      method: 'GET',
      headers: { 'x-correlation-id': customCorrelationId },
    });
    const { res, getData } = createMockRes();

    await handleRequest(req, res, auditLogger, mockAdapter, mockWpClient);

    const data = getData();
    expect(data.headers['X-Correlation-ID']).toBe(customCorrelationId);
  });

  it('generates a fresh correlation ID if header is absent', async () => {
    const req = createMockReq({ url: '/health', method: 'GET' });
    const { res, getData } = createMockRes();

    await handleRequest(req, res, auditLogger, mockAdapter, mockWpClient);

    const data = getData();
    expect(data.headers['X-Correlation-ID']).toBeDefined();
    expect(data.headers['X-Correlation-ID'].length).toBeGreaterThan(10);
  });

  it('enforces rate limiting when requests exceed threshold', async () => {
    const testLimiter = new ServerRateLimiter(60000, 3);
    const clientKey = '192.168.1.100';

    expect(testLimiter.isAllowed(clientKey)).toBe(true);
    expect(testLimiter.isAllowed(clientKey)).toBe(true);
    expect(testLimiter.isAllowed(clientKey)).toBe(true);
    expect(testLimiter.isAllowed(clientKey)).toBe(false); // 4th request blocked
  });

  it('returns HTTP 429 when global API rate limit is exceeded', async () => {
    const spammerIp = '10.0.0.99';
    // Exhaust the rate limit
    for (let i = 0; i < 120; i++) {
      globalApiRateLimiter.isAllowed(spammerIp);
    }

    const req = createMockReq({
      url: '/api/chat',
      method: 'POST',
      body: JSON.stringify({ prompt: 'hello' }),
      remoteAddress: spammerIp,
    });
    const { res, getData } = createMockRes();

    await handleRequest(req, res, auditLogger, mockAdapter, mockWpClient);

    const data = getData();
    expect(data.statusCode).toBe(429);
    const parsed = JSON.parse(data.body);
    expect(parsed.error).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('rejects oversized request bodies (>64KB) safely without memory exhaustion', async () => {
    const hugePayload = 'a'.repeat(70000);
    const req = createMockReq({
      url: '/api/chat',
      method: 'POST',
      body: JSON.stringify({ prompt: hugePayload }),
    });
    const { res, getData } = createMockRes();

    await handleRequest(req, res, auditLogger, mockAdapter, mockWpClient);

    const data = getData();
    expect(data.statusCode).toBe(400);
    expect(data.body).toContain('maximum size');
  });
});

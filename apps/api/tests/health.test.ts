import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index.js';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

describe('API Server & Health Endpoint', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = buildServer();
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

  it('GET /health returns 200 with status ok and timestamp', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      status: string;
      service: string;
      version: string;
      timestamp: string;
    };

    expect(data.status).toBe('ok');
    expect(data.service).toBe('kph-sitepilot-api');
    expect(data.version).toBe('0.1.0');
    expect(data.timestamp).toBeDefined();
  });

  it('GET /unknown-path returns 404 Not Found', async () => {
    const res = await fetch(`${baseUrl}/unregistered-route`);
    expect(res.status).toBe(404);

    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('Not Found');
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index.js';
import { AuditLogger } from '@wp-agent/audit';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { SitePlan } from '@wp-agent/contracts';

describe('Website Planning Endpoint (/api/plan)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const auditLogger = new AuditLogger();
    const mockAdapter = new MockModelAdapter({
      cannedResponses: ['Here is a planned architecture for your agency.'],
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

  it('POST /api/plan generates a structured website plan from a prompt', async () => {
    const res = await fetch(`${baseUrl}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Build a modern digital marketing agency site with emerald branding',
        siteTitle: 'MarketPulse Agency',
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; plan: SitePlan };

    expect(data.status).toBe('success');
    expect(data.plan).toBeDefined();
    expect(data.plan.title).toBe('MarketPulse Agency');
    expect(data.plan.designSystem).toBeDefined();
    expect(data.plan.designSystem.palette.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(data.plan.pages.length).toBeGreaterThanOrEqual(2);
    expect(data.plan.version).toBe(1);
  });

  it('POST /api/plan revises an existing plan when existingPlan is supplied', async () => {
    // 1. Generate initial plan
    const initialRes = await fetch(`${baseUrl}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Software development shop',
        siteTitle: 'CodeCraft',
      }),
    });
    const initialData = (await initialRes.json()) as { plan: SitePlan };

    // 2. Revise plan to blue palette
    const reviseRes = await fetch(`${baseUrl}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        existingPlan: initialData.plan,
        revisionPrompt: 'Change the color palette to ocean blue and add a pricing section',
      }),
    });

    expect(reviseRes.status).toBe(200);
    const revisedData = (await reviseRes.json()) as { status: string; plan: SitePlan };

    expect(revisedData.status).toBe('success');
    expect(revisedData.plan.version).toBe(2);
    expect(revisedData.plan.designSystem.palette.primary).toBe('#2563eb');
    expect(revisedData.plan.pages[0].sections.some((s) => s.type === 'pricing')).toBe(true);
  });

  it('POST /api/plan rejects missing or empty prompt with 400', async () => {
    const res = await fetch(`${baseUrl}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('VALIDATION_FAILED');
  });

  it('GET /api/plan returns 405 Method Not Allowed', async () => {
    const res = await fetch(`${baseUrl}/api/plan`, {
      method: 'GET',
    });

    expect(res.status).toBe(405);
  });
});

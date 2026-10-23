import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildServer } from '../src/index.js';
import { AuditLogger } from '@wp-agent/audit';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { WordPressClient } from '@wp-agent/wp-client';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

describe('Phase 5: Mutate Endpoints (/api/mutate/propose and /api/mutate/apply)', () => {
  let server: Server;
  let baseUrl: string;
  let mockWpClient: WordPressClient;

  beforeAll(async () => {
    const auditLogger = new AuditLogger();
    const mockAdapter = new MockModelAdapter({
      cannedResponses: [
        '# Introduction\n\nAI and WordPress make website creation easy and fast.',
      ],
    });

    mockWpClient = {
      checkForDuplicatePost: vi.fn().mockImplementation(async (_site, title: string) => {
        if (title.toLowerCase().includes('duplicate')) {
          return {
            isDuplicate: true,
            warning: 'Possible duplicate post detected on test.local: "Duplicate Guide" (ID: 99).',
          };
        }
        return { isDuplicate: false };
      }),
      createDraftPost: vi.fn().mockImplementation(async (targetSite, params) => {
        return {
          id: 303,
          slug: 'how-to-make-a-simple-website-using-ai',
          title: params.title,
          status: 'draft',
          editLink: `${targetSite}/wp-admin/post.php?post=303&action=edit`,
          verified: true,
        };
      }),
    } as unknown as WordPressClient;

    server = buildServer(auditLogger, mockAdapter, mockWpClient);

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

  it('POST /api/mutate/propose stages a post proposal and checks for duplicates', async () => {
    const res = await fetch(`${baseUrl}/api/mutate/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Create a WordPress post on test.local titled "How to Make a Simple Website Using AI".',
        targetSite: 'http://test.local',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('proposed');
    expect(data.planId).toBeDefined();
    expect(data.integrityHash).toBeDefined();
    expect(data.post.title).toBe('How to Make a Simple Website Using AI');
    expect(data.post.status).toBe('draft');
    expect(data.post.content).toContain('AI and WordPress');
    expect(data.targetSite).toBe('http://test.local');
    expect(data.duplicateWarning).toBeUndefined();
  });

  it('POST /api/mutate/propose warns about duplicate title when found', async () => {
    const res = await fetch(`${baseUrl}/api/mutate/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Create post titled "Duplicate Guide" on test.local',
        targetSite: 'http://test.local',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('proposed');
    expect(data.duplicateWarning).toContain('Possible duplicate post detected');
    expect(data.duplicateWarning).toContain('ID: 99');
  });

  it('POST /api/mutate/propose rejects missing prompt or targetSite', async () => {
    const res = await fetch(`${baseUrl}/api/mutate/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '',
        targetSite: 'http://test.local',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /api/mutate/apply creates draft post after approval and verifies integrity hash', async () => {
    // 1. Propose draft
    const proposeRes = await fetch(`${baseUrl}/api/mutate/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Create a post titled "Approved Article" on test.local',
        targetSite: 'http://test.local',
      }),
    });
    const proposal = await proposeRes.json();

    // 2. Apply approval
    const applyRes = await fetch(`${baseUrl}/api/mutate/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: proposal.planId,
        integrityHash: proposal.integrityHash,
        targetSite: proposal.targetSite,
        post: proposal.post,
        approvedBy: 'admin-user',
      }),
    });

    expect(applyRes.status).toBe(200);
    const appliedData = await applyRes.json();

    expect(appliedData.status).toBe('applied');
    expect(appliedData.post.id).toBe(303);
    expect(appliedData.post.status).toBe('draft');
    expect(appliedData.post.verified).toBe(true);
    expect(appliedData.post.editLink).toContain('post.php?post=303&action=edit');
  });

  it('POST /api/mutate/apply rejects tampered content (Integrity Hash Mismatch)', async () => {
    // 1. Propose draft
    const proposeRes = await fetch(`${baseUrl}/api/mutate/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Create a post titled "Integrity Check" on test.local',
        targetSite: 'http://test.local',
      }),
    });
    const proposal = await proposeRes.json();

    // 2. Attempt to apply with invalid/modified integrity hash
    const applyRes = await fetch(`${baseUrl}/api/mutate/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: proposal.planId,
        integrityHash: 'invalid-or-tampered-hash-value-0000000000000000000000000000000',
        targetSite: proposal.targetSite,
        post: proposal.post,
      }),
    });

    expect(applyRes.status).toBe(403);
    const errData = await applyRes.json();
    expect(errData.message).toContain('Integrity hash mismatch');
  });

  it('POST /api/mutate/apply rejects unknown or expired planId', async () => {
    const applyRes = await fetch(`${baseUrl}/api/mutate/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: '00000000-0000-0000-0000-000000000000',
        integrityHash: 'somehash',
        targetSite: 'http://test.local',
        post: {
          title: 'Unstaged Post',
          content: 'Unapproved content',
        },
      }),
    });

    expect(applyRes.status).toBe(400);
    const errData = await applyRes.json();
    expect(errData.message).toContain('not found or expired');
  });

  it('POST /api/mutate/apply prevents replay attacks by consuming the proposal', async () => {
    // 1. Propose draft
    const proposeRes = await fetch(`${baseUrl}/api/mutate/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Create a post titled "Single Use Proposal" on test.local',
        targetSite: 'http://test.local',
      }),
    });
    const proposal = await proposeRes.json();

    // 2. Apply proposal first time -> succeeds
    const firstApply = await fetch(`${baseUrl}/api/mutate/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: proposal.planId,
        integrityHash: proposal.integrityHash,
        targetSite: proposal.targetSite,
        post: proposal.post,
      }),
    });
    expect(firstApply.status).toBe(200);

    // 3. Apply proposal second time (replay) -> fails because proposal was consumed
    const replayApply = await fetch(`${baseUrl}/api/mutate/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: proposal.planId,
        integrityHash: proposal.integrityHash,
        targetSite: proposal.targetSite,
        post: proposal.post,
      }),
    });
    expect(replayApply.status).toBe(400);
    const replayErr = await replayApply.json();
    expect(replayErr.message).toContain('not found or expired');
  });
});

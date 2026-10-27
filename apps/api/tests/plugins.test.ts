import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/index.js';
import { AuditLogger } from '@wp-agent/audit';
import { LocalWpSiteManager } from '@wp-agent/wp-client';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = buildServer(new AuditLogger());
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Plugin proposal and apply endpoints', () => {
  it('proposes uninstall for approval, then applies only to the same target and verifies it', async () => {
    const uninstall = vi
      .spyOn(LocalWpSiteManager.prototype, 'uninstallPlugin')
      .mockResolvedValue({
        success: true,
        verified: true,
        message: 'Uninstalled and verified removal of hello-dolly.',
      });
    const { server, baseUrl } = await startServer();

    try {
      const proposalResponse = await fetch(`${baseUrl}/api/site/plugins/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          action: 'delete',
          pluginSlug: 'hello-dolly',
        }),
      });
      expect(proposalResponse.status).toBe(200);
      const proposal = await proposalResponse.json();
      expect(proposal.cliCommand).toBe('wp plugin uninstall hello-dolly --deactivate');

      const mismatchedApproval = await fetch(`${baseUrl}/api/site/plugins/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://other.local',
        }),
      });
      expect(mismatchedApproval.status).toBe(403);
      expect(uninstall).not.toHaveBeenCalled();

      const approval = await fetch(`${baseUrl}/api/site/plugins/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://test.local',
        }),
      });

      expect(approval.status).toBe(200);
      await expect(approval.json()).resolves.toMatchObject({
        status: 'applied',
        action: 'delete',
        pluginSlug: 'hello-dolly',
        resultMessage: 'Uninstalled and verified removal of hello-dolly.',
        verified: true,
      });
      expect(uninstall).toHaveBeenCalledWith('hello-dolly');
    } finally {
      await closeServer(server);
    }
  });

  it('rejects list as a mutation proposal and malformed plugin slugs', async () => {
    const { server, baseUrl } = await startServer();
    try {
      const listResponse = await fetch(`${baseUrl}/api/site/plugins/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          action: 'list',
          pluginSlug: 'hello-dolly',
        }),
      });
      expect(listResponse.status).toBe(400);

      const invalidSlugResponse = await fetch(`${baseUrl}/api/site/plugins/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          action: 'delete',
          pluginSlug: '../hello-dolly',
        }),
      });
      expect(invalidSlugResponse.status).toBe(400);
    } finally {
      await closeServer(server);
    }
  });
});

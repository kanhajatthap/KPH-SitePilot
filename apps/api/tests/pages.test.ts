import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/index.js';
import { AuditLogger } from '@wp-agent/audit';
import { LocalWpSiteManager } from '@wp-agent/wp-client';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { PageSnapshotStore } from '../src/page-snapshot-store.js';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

import type { ModelAdapter } from '@wp-agent/model-adapters';
const originalPage = {
  id: 42,
  title: 'About',
  slug: 'about',
  status: 'publish',
  content: [
    '<!-- wp:group -->',
    '<div><p>Original hero</p></div>',
    '<!-- /wp:group -->',
    '\n\n',
    '<!-- wp:cover -->',
    '<div><p>Original features</p></div>',
    '<!-- /wp:cover -->',
  ].join(''),
  url: 'http://test.local/about/',
};

let snapshotStore: PageSnapshotStore;
let snapshotDirectory: string;

async function startServer(adapter?: ModelAdapter): Promise<{ server: Server; baseUrl: string }> {
  const server = buildServer(new AuditLogger(), adapter, undefined, snapshotStore);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

beforeEach(async () => {
  snapshotDirectory = await mkdtemp(join(tmpdir(), 'sitepilot-page-api-'));
  snapshotStore = new PageSnapshotStore(snapshotDirectory);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(snapshotDirectory, { recursive: true, force: true });
});

describe('Page lifecycle proposal and approval endpoints', () => {
  it('generates validated Gutenberg content from the page and user request without applying it', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails').mockResolvedValue(originalPage);
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage');
    const adapter = new MockModelAdapter({
      cannedResponses: [JSON.stringify({
        sections: [
          { type: 'hero', heading: 'A better About page', body: 'Clear, welcoming information.' },
          { type: 'features', heading: 'Our values', items: ['Clarity', 'Care'] },
          { type: 'cta', heading: 'Start a conversation' },
        ],
      })],
    });
    const { server, baseUrl } = await startServer(adapter);

    try {
      const response = await fetch(`${baseUrl}/api/site/pages/lifecycle/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          pageId: 42,
          instruction: 'Redesign the About page to feel warmer.',
        }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: 'generated',
        pageId: 42,
        title: 'About',
        design: { sections: [{ type: 'hero' }, { type: 'features' }, { type: 'cta' }] },
        gutenbergBlocksHtml: expect.stringContaining('<!-- wp:group'),
        previewHtml: expect.stringContaining('<main>'),
      });
      expect(updatePage).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it('rejects invalid model output without returning a fallback design', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails').mockResolvedValue(originalPage);
    const adapter = new MockModelAdapter({ cannedResponses: ['{"sections":[]}'] });
    const { server, baseUrl } = await startServer(adapter);

    try {
      const response = await fetch(`${baseUrl}/api/site/pages/lifecycle/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          pageId: 42,
          instruction: 'Redesign this page.',
        }),
      });
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        error: 'MODEL_ERROR',
        message: expect.stringContaining('No proposal was created'),
      });
    } finally {
      await closeServer(server);
    }
  });

  it('refuses non-local targets and trashed pages before calling the model', async () => {
    const readPage = vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValue({ ...originalPage, status: 'trash' });
    const adapter = new MockModelAdapter({
      cannedResponses: [JSON.stringify({ sections: [] })],
    });
    const { server, baseUrl } = await startServer(adapter);

    try {
      const external = await fetch(`${baseUrl}/api/site/pages/lifecycle/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'https://example.com',
          pageId: 42,
          instruction: 'Redesign this page.',
        }),
      });
      expect(external.status).toBe(403);
      expect(readPage).not.toHaveBeenCalled();

      const trashed = await fetch(`${baseUrl}/api/site/pages/lifecycle/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          pageId: 42,
          instruction: 'Redesign this page.',
        }),
      });
      expect(trashed.status).toBe(409);
      expect(readPage).toHaveBeenCalledOnce();
    } finally {
      await closeServer(server);
    }
  });

  it('stages a page update and applies it only after approval with read-back verification', async () => {
    const readPage = vi
      .spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValueOnce(originalPage)
      .mockResolvedValueOnce(originalPage)
      .mockResolvedValueOnce({
        ...originalPage,
        content: '<!-- wp:heading --><h1>Updated</h1><!-- /wp:heading -->',
      });
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage').mockResolvedValue({
      id: 42,
      title: 'About',
      status: 'publish',
      url: originalPage.url,
    });
    const { server, baseUrl } = await startServer();

    try {
      const proposed = await fetch(`${baseUrl}/api/site/pages/lifecycle/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          action: 'update',
          pageId: 42,
          content: '<!-- wp:heading --><h1>Updated</h1><!-- /wp:heading -->',
        }),
      });
      expect(proposed.status).toBe(200);
      const proposal = await proposed.json();
      expect(proposal.before).toBe(originalPage.content);
      expect(proposal.after).toContain('Updated');

      const applied = await fetch(`${baseUrl}/api/site/pages/lifecycle/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://test.local',
        }),
      });
      expect(applied.status).toBe(200);
      await expect(applied.json()).resolves.toMatchObject({
        status: 'applied',
        action: 'update',
        pageId: 42,
        pageStatus: 'publish',
        verified: true,
      });
      expect(updatePage).toHaveBeenCalledWith({
        id: 42,
        title: 'About',
        content: '<!-- wp:heading --><h1>Updated</h1><!-- /wp:heading -->',
      });
      expect(readPage).toHaveBeenCalledTimes(3);
      await expect(snapshotStore.list('http://test.local', 42)).resolves.toMatchObject([
        {
          title: 'About',
          status: 'publish',
          content: originalPage.content,
          sourceOperation: 'page_update',
        },
      ]);
    } finally {
      await closeServer(server);
    }
  });

  it('refuses stale page proposals and external targets', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValueOnce(originalPage)
      .mockResolvedValueOnce({ ...originalPage, content: '<p>Changed elsewhere</p>' });
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage');
    const { server, baseUrl } = await startServer();

    try {
      const proposed = await fetch(`${baseUrl}/api/site/pages/lifecycle/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          action: 'update',
          pageId: 42,
          content: '<p>New</p>',
        }),
      });
      const proposal = await proposed.json();

      const applied = await fetch(`${baseUrl}/api/site/pages/lifecycle/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://test.local',
        }),
      });
      expect(applied.status).toBe(409);
      expect(updatePage).not.toHaveBeenCalled();

      const external = await fetch(`${baseUrl}/api/site/pages/lifecycle/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'https://example.com',
          action: 'trash',
          pageId: 42,
        }),
      });
      expect(external.status).toBe(403);
    } finally {
      await closeServer(server);
    }
  });

  it('stages page Trash and verifies that the page becomes trashed after approval', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValueOnce(originalPage)
      .mockResolvedValueOnce(originalPage);
    vi.spyOn(LocalWpSiteManager.prototype, 'runWpCli').mockResolvedValue({
      stdout: '0',
      stderr: '',
      exitCode: 0,
    });
    const trashPage = vi.spyOn(LocalWpSiteManager.prototype, 'trashPage').mockResolvedValue({
      id: 42,
      title: 'About',
      slug: 'about',
      status: 'trash',
      url: originalPage.url,
      verified: true,
    });
    const { server, baseUrl } = await startServer();

    try {
      const proposed = await fetch(`${baseUrl}/api/site/pages/lifecycle/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          action: 'trash',
          pageId: 42,
        }),
      });
      const proposal = await proposed.json();

      const applied = await fetch(`${baseUrl}/api/site/pages/lifecycle/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://test.local',
        }),
      });
      expect(applied.status).toBe(200);
      await expect(applied.json()).resolves.toMatchObject({
        action: 'trash',
        pageStatus: 'trash',
        verified: true,
      });
      expect(trashPage).toHaveBeenCalledWith(42);
      await expect(snapshotStore.list('http://test.local', 42)).resolves.toMatchObject([
        { content: originalPage.content, sourceOperation: 'page_trash' },
      ]);
    } finally {
      await closeServer(server);
    }
  });

  it('refuses a Trash proposal for the active homepage', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails').mockResolvedValue(originalPage);
    vi.spyOn(LocalWpSiteManager.prototype, 'runWpCli').mockResolvedValue({
      stdout: '42',
      stderr: '',
      exitCode: 0,
    });
    const { server, baseUrl } = await startServer();

    try {
      const proposed = await fetch(`${baseUrl}/api/site/pages/lifecycle/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          action: 'trash',
          pageId: 42,
        }),
      });
      expect(proposed.status).toBe(409);
      await expect(proposed.json()).resolves.toMatchObject({
        message: 'The active homepage cannot be trashed. Set a different homepage first.',
      });
    } finally {
      await closeServer(server);
    }
  });
});

describe('Page section edit proposal and approval endpoints', () => {
  async function proposeSection(baseUrl: string, targetSite = 'http://test.local') {
    return fetch(`${baseUrl}/api/site/pages/section/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSite,
        pageId: 42,
        sectionId: 'hero',
        instruction: 'Change the headline to "Welcome to our team"',
      }),
    });
  }

  async function applySection(baseUrl: string, proposal: any, targetSite = 'http://test.local') {
    return fetch(`${baseUrl}/api/site/pages/section/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: proposal.planId,
        integrityHash: proposal.integrityHash,
        targetSite,
        pageId: 42,
      }),
    });
  }

  it('refuses non-local targets before reading the page', async () => {
    const readPage = vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails');
    const { server, baseUrl } = await startServer();
    try {
      const response = await proposeSection(baseUrl, 'https://example.com');
      expect(response.status).toBe(403);
      expect(readPage).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it('refuses to apply when the page changed after staging', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValueOnce(originalPage)
      .mockResolvedValueOnce({ ...originalPage, content: '<p>Changed elsewhere</p>' });
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage');
    const { server, baseUrl } = await startServer();
    try {
      const proposed = await proposeSection(baseUrl);
      expect(proposed.status).toBe(200);
      const applied = await applySection(baseUrl, await proposed.json());
      expect(applied.status).toBe(409);
      await expect(applied.json()).resolves.toMatchObject({
        message: expect.stringContaining('changed after this section edit was staged'),
      });
      expect(updatePage).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it('refuses to apply to a different target than the proposal', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails').mockResolvedValue(originalPage);
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage');
    const { server, baseUrl } = await startServer();
    try {
      const proposal = await (await proposeSection(baseUrl)).json();
      const applied = await applySection(baseUrl, proposal, 'http://other.local');
      expect(applied.status).toBe(403);
      expect(updatePage).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it('applies after approval only when read-back content matches exactly', async () => {
    const readPage = vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails');
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage').mockResolvedValue({
      id: 42,
      title: 'About',
      status: 'publish',
      url: originalPage.url,
    });
    const { server, baseUrl } = await startServer();
    try {
      readPage.mockResolvedValueOnce(originalPage);
      const proposal = await (await proposeSection(baseUrl)).json();
      readPage
        .mockResolvedValueOnce(originalPage)
        .mockResolvedValueOnce({ ...originalPage, content: String(proposal.updatedFullContent).trim() });

      const applied = await applySection(baseUrl, proposal);
      expect(applied.status).toBe(200);
      await expect(applied.json()).resolves.toMatchObject({ status: 'applied', pageId: 42, verified: true });
      expect(updatePage).toHaveBeenCalledOnce();
      await expect(snapshotStore.list('http://test.local', 42)).resolves.toMatchObject([
        { content: originalPage.content, sourceOperation: 'page_section_edit' },
      ]);
    } finally {
      await closeServer(server);
    }
  });

  it('fails verification when saved content does not match the approved content', async () => {
    const readPage = vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails');
    vi.spyOn(LocalWpSiteManager.prototype, 'updatePage').mockResolvedValue({
      id: 42,
      title: 'About',
      status: 'publish',
      url: originalPage.url,
    });
    const { server, baseUrl } = await startServer();
    try {
      readPage.mockResolvedValueOnce(originalPage);
      const proposal = await (await proposeSection(baseUrl)).json();
      readPage
        .mockResolvedValueOnce(originalPage)
        .mockResolvedValueOnce({ ...originalPage, content: '<p>Something else</p>' });

      const applied = await applySection(baseUrl, proposal);
      expect(applied.status).toBe(500);
      await expect(applied.json()).resolves.toMatchObject({
        message: expect.stringContaining('could not be verified'),
      });
    } finally {
      await closeServer(server);
    }
  });

  it('proposes section edit with propertyPatch without invoking LLM or mutating site', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails').mockResolvedValue(originalPage);
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage');
    const { server, baseUrl } = await startServer();
    try {
      const response = await fetch(`${baseUrl}/api/site/pages/section/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          pageId: 42,
          sectionId: 'hero',
          propertyPatch: {
            align: 'wide',
            backgroundColor: 'contrast',
          },
        }),
      });

      expect(response.status).toBe(200);
      const proposal = await response.json();
      expect(proposal.planId).toBeDefined();
      expect(proposal.integrityHash).toBeDefined();
      expect(proposal.diff.after).toContain('"align":"wide"');
      expect(proposal.diff.after).toContain('"backgroundColor":"contrast"');
      expect(updatePage).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it('rejects proposal with invalid propertyPatch returning HTTP 400', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails').mockResolvedValue(originalPage);
    const { server, baseUrl } = await startServer();
    try {
      const response = await fetch(`${baseUrl}/api/site/pages/section/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          pageId: 42,
          sectionId: 'hero',
          propertyPatch: {
            arbitraryKey: 'malicious',
          },
        }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: 'VALIDATION_FAILED',
      });
    } finally {
      await closeServer(server);
    }
  });
});

describe('Page snapshot history and restore endpoints', () => {
  it('lists summaries without returning stored content and compares a snapshot to the live page', async () => {
    const snapshot = await snapshotStore.create({
      targetSite: 'http://test.local',
      pageId: 42,
      title: 'About',
      slug: 'about',
      status: 'publish',
      content: originalPage.content,
      sourceOperation: 'page_update',
    });
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValue({ ...originalPage, content: '<p>Changed content</p>' });
    const { server, baseUrl } = await startServer();

    try {
      const history = await fetch(
        `${baseUrl}/api/site/pages/snapshots?targetSite=http%3A%2F%2Ftest.local&pageId=42`
      );
      expect(history.status).toBe(200);
      const historyBody = await history.json();
      expect(historyBody.snapshots[0]).toMatchObject({ id: snapshot.id, title: 'About' });
      expect(historyBody.snapshots[0]).not.toHaveProperty('content');

      const compared = await fetch(`${baseUrl}/api/site/pages/snapshots/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          pageId: 42,
          snapshotId: snapshot.id,
        }),
      });
      expect(compared.status).toBe(200);
      await expect(compared.json()).resolves.toMatchObject({
        differences: { titleChanged: false, statusChanged: false, contentChanged: true },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('stages an explicit restore and captures a backup before verified apply', async () => {
    const targetSnapshot = await snapshotStore.create({
      targetSite: 'http://test.local',
      pageId: 42,
      title: 'Earlier About',
      slug: 'about',
      status: 'publish',
      content: '<p>Earlier copy</p>',
      sourceOperation: 'page_update',
    });
    const currentPage = { ...originalPage, content: '<p>Current copy</p>' };
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValueOnce(currentPage)
      .mockResolvedValueOnce(currentPage);
    const restorePage = vi.spyOn(LocalWpSiteManager.prototype, 'restorePage').mockResolvedValue({
      ...currentPage,
      title: targetSnapshot.title,
      content: targetSnapshot.content,
    });
    const { server, baseUrl } = await startServer();

    try {
      const proposed = await fetch(`${baseUrl}/api/site/pages/restore/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          pageId: 42,
          snapshotId: targetSnapshot.id,
        }),
      });
      expect(proposed.status).toBe(200);
      const proposal = await proposed.json();
      expect(proposal.changes).toMatchObject({
        titleChanged: true,
        statusChanged: false,
        contentChanged: true,
      });
      expect(restorePage).not.toHaveBeenCalled();

      const applied = await fetch(`${baseUrl}/api/site/pages/restore/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://test.local',
          pageId: 42,
        }),
      });
      expect(applied.status).toBe(200);
      await expect(applied.json()).resolves.toMatchObject({
        status: 'applied',
        restoredSnapshotId: targetSnapshot.id,
        verified: true,
      });
      expect(restorePage).toHaveBeenCalledWith({
        id: 42,
        title: targetSnapshot.title,
        content: targetSnapshot.content,
        status: 'publish',
      });
      await expect(snapshotStore.list('http://test.local', 42)).resolves.toMatchObject([
        { content: currentPage.content, sourceOperation: 'page_restore' },
        { content: targetSnapshot.content, sourceOperation: 'page_update' },
      ]);
    } finally {
      await closeServer(server);
    }
  });

  it('does not apply an update if its pre-change snapshot cannot be stored', async () => {
    const oversizedPage = {
      ...originalPage,
      content: 'x'.repeat(2 * 1024 * 1024 + 1),
    };
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValueOnce(oversizedPage)
      .mockResolvedValueOnce(oversizedPage);
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage');
    const { server, baseUrl } = await startServer();

    try {
      const proposal = await (await fetch(`${baseUrl}/api/site/pages/lifecycle/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          action: 'update',
          pageId: 42,
          content: '<p>Updated</p>',
        }),
      })).json();
      const applied = await fetch(`${baseUrl}/api/site/pages/lifecycle/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://test.local',
        }),
      });

      expect(applied.status).toBe(500);
      expect(updatePage).not.toHaveBeenCalled();
      await expect(snapshotStore.list('http://test.local', 42)).resolves.toHaveLength(0);
    } finally {
      await closeServer(server);
    }
  });

  it('refuses stale restores and does not mutate or create an apply backup', async () => {
    const targetSnapshot = await snapshotStore.create({
      targetSite: 'http://test.local',
      pageId: 42,
      title: 'About',
      slug: 'about',
      status: 'publish',
      content: '<p>Older</p>',
      sourceOperation: 'page_update',
    });
    const currentPage = { ...originalPage, content: '<p>At staging</p>' };
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValueOnce(currentPage)
      .mockResolvedValueOnce({ ...currentPage, content: '<p>Changed after staging</p>' });
    const restorePage = vi.spyOn(LocalWpSiteManager.prototype, 'restorePage');
    const { server, baseUrl } = await startServer();

    try {
      const proposal = await (await fetch(`${baseUrl}/api/site/pages/restore/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: 'http://test.local',
          pageId: 42,
          snapshotId: targetSnapshot.id,
        }),
      })).json();
      const applied = await fetch(`${baseUrl}/api/site/pages/restore/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: 'http://test.local',
          pageId: 42,
        }),
      });
      expect(applied.status).toBe(409);
      expect(restorePage).not.toHaveBeenCalled();
      await expect(snapshotStore.list('http://test.local', 42)).resolves.toHaveLength(1);
    } finally {
      await closeServer(server);
    }
  });
});

describe('Page section reorder proposal and approval endpoints', () => {
  async function proposeReorder(baseUrl: string, targetSite = 'http://test.local') {
    return fetch(`${baseUrl}/api/site/pages/section/reorder/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSite,
        pageId: 42,
        sectionIds: ['sec_2', 'hero'],
      }),
    });
  }

  async function applyReorder(baseUrl: string, proposal: any, targetSite = 'http://test.local') {
    return fetch(`${baseUrl}/api/site/pages/section/reorder/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: proposal.planId,
        integrityHash: proposal.integrityHash,
        targetSite,
        pageId: 42,
      }),
    });
  }

  it('stages reorder proposal without calling updatePage', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails').mockResolvedValue(originalPage);
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage');
    const { server, baseUrl } = await startServer();
    try {
      const proposed = await proposeReorder(baseUrl);
      expect(proposed.status).toBe(200);
      expect(updatePage).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it('refuses to apply when page changed after staging reorder', async () => {
    vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails')
      .mockResolvedValueOnce(originalPage)
      .mockResolvedValueOnce({ ...originalPage, content: '<p>Changed elsewhere</p>' });
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage');
    const { server, baseUrl } = await startServer();
    try {
      const proposed = await proposeReorder(baseUrl);
      expect(proposed.status).toBe(200);
      const applied = await applyReorder(baseUrl, await proposed.json());
      expect(applied.status).toBe(409);
      expect(updatePage).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it('applies reorder only after approval and verifies read-back', async () => {
    const readPage = vi.spyOn(LocalWpSiteManager.prototype, 'readPageDetails');
    const updatePage = vi.spyOn(LocalWpSiteManager.prototype, 'updatePage').mockResolvedValue({
      id: 42,
      title: 'About',
      status: 'publish',
      url: originalPage.url,
    });
    const { server, baseUrl } = await startServer();
    try {
      readPage.mockResolvedValueOnce(originalPage);
      const proposal = await (await proposeReorder(baseUrl)).json();
      readPage
        .mockResolvedValueOnce(originalPage)
        .mockResolvedValueOnce({ ...originalPage, content: String(proposal.updatedFullContent).trim() });

      const applied = await applyReorder(baseUrl, proposal);
      expect(applied.status).toBe(200);
      await expect(applied.json()).resolves.toMatchObject({ status: 'applied', verified: true });
      expect(updatePage).toHaveBeenCalledOnce();
      await expect(snapshotStore.list('http://test.local', 42)).resolves.toMatchObject([
        { content: originalPage.content, sourceOperation: 'page_section_reorder' },
      ]);
    } finally {
      await closeServer(server);
    }
  });
});

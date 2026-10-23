import { describe, it, expect, beforeAll } from 'vitest';
import { AgentCore } from '../src/index.js';
import { WordPressClient } from '@wp-agent/wp-client';
import { AuditLogger } from '@wp-agent/audit';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { loadConfig } from '@wp-agent/config';

describe('WordPress Live Integration: page.read Read-Only Verification', () => {
  let siteUrl: string;
  let isSiteOnline = false;
  let offlineReason = '';

  beforeAll(async () => {
    try {
      const config = loadConfig();
      siteUrl = process.env.WP_SITE_URL || config.WP_SITE_URL || 'http://plugin-test.local';
    } catch {
      siteUrl = process.env.WP_SITE_URL || 'http://plugin-test.local';
    }

    // Ping /wp-json/ with a short timeout to check if LocalWP site is running
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const probeRes = await fetch(`${siteUrl}/wp-json/`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (probeRes.ok) {
        isSiteOnline = true;
      } else {
        offlineReason = `HTTP ${probeRes.status} (${probeRes.statusText || 'LocalWP router offline or site stopped'})`;
      }
    } catch (err) {
      offlineReason = (err as Error).message || 'Connection refused';
    }
  });

  it('verifies read-only page.read against live LocalWP site if online, or safely skips if stopped', async () => {
    if (!isSiteOnline) {
      console.log(
        `\n[LIVE WP INTEGRATION] Site ${siteUrl} is not currently running (${offlineReason}). Safely skipping live read-only test.\nTo run live test, start site "${siteUrl}" in LocalWP.`
      );
      expect(true).toBe(true);
      return;
    }

    const parsed = new URL(siteUrl);
    const siteSlug = parsed.hostname.replace(/\.local$/, '');

    const auditLogger = new AuditLogger();
    const wpClient = new WordPressClient({
      allowedTargets: [siteUrl],
    });

    const agent = new AgentCore({
      modelAdapter: new MockModelAdapter({
        scriptedToolCalls: [
          [
            {
              id: 'live_call_page_read',
              name: 'page.read',
              arguments: {
                siteSlug,
                pageIdOrSlug: 'sample-page',
              },
            },
          ],
        ],
        cannedResponses: [
          'Reading page from live site...',
          'Summary of live WordPress page completed.',
        ],
      }),
      auditLogger,
      wpClient,
    });

    const response = await agent.processRequest({
      correlationId: '20000000-0000-0000-0000-000000000001',
      prompt: 'Read and summarize the sample page',
      targetSite: siteUrl,
    });

    expect(response.status).toBe('success');
    expect(response.executedTools).toHaveLength(1);
    expect(response.executedTools[0].name).toBe('page.read');

    // Verify zero write operations were executed
    const events = auditLogger.getEvents();
    const writeEvents = events.filter(
      (e) =>
        e.action.includes('create') ||
        e.action.includes('update') ||
        e.action.includes('delete')
    );
    expect(writeEvents).toHaveLength(0);
  });
});

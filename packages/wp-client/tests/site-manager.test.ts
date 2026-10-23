import { afterEach, describe, expect, it, vi } from 'vitest';
import { access, readFile } from 'node:fs/promises';
import { LocalWpSiteManager, type WpCliResult } from '../src/site-manager.js';

function manager(): LocalWpSiteManager {
  return new LocalWpSiteManager({
    phpBinary: 'php',
    wpCliPhar: 'wp-cli.phar',
    sitePath: 'C:\\site',
  });
}

function pageJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ID: 123,
    post_title: 'Ceramics Studio',
    post_status: 'publish',
    post_name: 'ceramics-studio',
    post_content: '<h1>Made slowly. Used daily.</h1>',
    url: 'http://test.local/ceramics-studio/',
    ...overrides,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LocalWpSiteManager page writes', () => {
  it('sends page content through a temp payload file, not argv', async () => {
    const wp = manager();
    const content =
      '<!-- wp:group -->\n<h1>Made slowly. Used daily.</h1>\n<p>Handmade & "quoted" | clay</p>\n<!-- /wp:group -->';

    let createArgs: string[] = [];
    let payload: Record<string, unknown> | null = null;
    let payloadPath = '';

    vi.spyOn(wp, 'runWpCli').mockImplementation(async (args: string[]): Promise<WpCliResult> => {
      if (args[0] === 'post' && args[1] === 'list') {
        return { stdout: '[]', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'eval-file') {
        createArgs = args;
        payloadPath = args[2];
        payload = JSON.parse(await readFile(payloadPath, 'utf8')) as Record<string, unknown>;
        return { stdout: '123', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'post' && args[1] === 'get') {
        return { stdout: pageJson(), stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const result = await wp.createPage({
      title: 'Ceramics Studio',
      content,
      slug: 'ceramics-studio',
      status: 'publish',
    });

    expect(createArgs[0]).toBe('eval-file');
    expect(createArgs.join(' ')).not.toContain('Made slowly');
    expect(createArgs.join(' ')).not.toContain('<h1>');
    expect(payload).toMatchObject({
      action: 'create',
      title: 'Ceramics Studio',
      content,
      status: 'publish',
      slug: 'ceramics-studio',
    });
    expect(result.id).toBe(123);
    expect(result.verified).toBe(true);
    expect(result.source).toBe('created');
    await expect(access(payloadPath)).rejects.toBeTruthy();
  });

  it('returns an existing page instead of inserting a duplicate', async () => {
    const wp = manager();
    let evalFileCalls = 0;

    vi.spyOn(wp, 'runWpCli').mockImplementation(async (args: string[]): Promise<WpCliResult> => {
      if (args[0] === 'post' && args[1] === 'list') {
        return {
          stdout: JSON.stringify([
            {
              ID: 34,
              post_title: 'Ceramics Studio',
              post_status: 'publish',
              post_name: 'ceramics-studio',
              url: 'http://test.local/ceramics-studio/',
            },
          ]),
          stderr: '',
          exitCode: 0,
        };
      }
      if (args[0] === 'eval-file') {
        evalFileCalls += 1;
        return { stdout: '99', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const result = await wp.createPage({
      title: 'Ceramics Studio',
      content: '<h1>New content</h1>',
      slug: 'ceramics-studio',
      status: 'publish',
    });

    expect(result.id).toBe(34);
    expect(result.source).toBe('existing');
    expect(evalFileCalls).toBe(0);
  });

  it('recovers a page that was created before a nonzero CLI exit', async () => {
    const wp = manager();
    let listCalls = 0;

    vi.spyOn(wp, 'runWpCli').mockImplementation(async (args: string[]): Promise<WpCliResult> => {
      if (args[0] === 'post' && args[1] === 'list') {
        listCalls += 1;
        // First call is the pre-create idempotency check. The second call is
        // the post-failure recovery check and finds the inserted page.
        return listCalls === 1
          ? { stdout: '[]', stderr: '', exitCode: 0 }
          : {
              stdout: JSON.stringify([
                {
                  ID: 34,
                  post_title: 'Ceramics Studio',
                  post_status: 'publish',
                  post_name: 'ceramics-studio',
                  url: 'http://test.local/ceramics-studio/',
                },
              ]),
              stderr: '',
              exitCode: 0,
            };
      }
      if (args[0] === 'eval-file') {
        return { stdout: '', stderr: 'Command failed: simulated timeout', exitCode: 1 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const result = await wp.createPage({
      title: 'Ceramics Studio',
      content: '<h1>Made slowly. Used daily.</h1>',
      slug: 'ceramics-studio',
      status: 'publish',
    });

    expect(result.id).toBe(34);
    expect(result.verified).toBe(true);
    expect(result.source).toBe('recovered');
    expect(listCalls).toBe(2);
  });

  it('surfaces the real WP-CLI error when no page was created', async () => {
    const wp = manager();

    vi.spyOn(wp, 'runWpCli').mockImplementation(async (args: string[]): Promise<WpCliResult> => {
      if (args[0] === 'post' && args[1] === 'list') {
        return { stdout: '[]', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'eval-file') {
        return { stdout: '', stderr: 'real WP-CLI error', exitCode: 1 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    await expect(
      wp.createPage({
        title: 'No Slug Page',
        content: '<h1>No slug</h1>',
        status: 'draft',
      })
    ).rejects.toThrow('real WP-CLI error');
  });

  it('sends page updates through the same temp payload path', async () => {
    const wp = manager();
    let updatePayload: Record<string, unknown> | null = null;

    vi.spyOn(wp, 'runWpCli').mockImplementation(async (args: string[]): Promise<WpCliResult> => {
      if (args[0] === 'eval-file') {
        updatePayload = JSON.parse(await readFile(args[2], 'utf8')) as Record<string, unknown>;
        return { stdout: '55', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'post' && args[1] === 'get') {
        return {
          stdout: pageJson({
            ID: 55,
            post_title: 'Updated page',
            post_status: 'draft',
            post_name: 'updated-page',
            url: 'http://test.local/?page_id=55',
          }),
          stderr: '',
          exitCode: 0,
        };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const result = await wp.updatePage({
      id: 55,
      title: 'Updated page',
      content: '<h1>Updated</h1>',
      status: 'draft',
    });

    expect(updatePayload).toMatchObject({
      action: 'update',
      id: 55,
      title: 'Updated page',
      content: '<h1>Updated</h1>',
      status: 'draft',
    });
    expect(result.id).toBe(55);
  });
});

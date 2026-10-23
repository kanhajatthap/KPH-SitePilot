import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AllowedOptionKey } from '@wp-agent/contracts';

const execFileAsync = promisify(execFile);

/**
 * Runs inside `wp eval-file`. The payload travels in a temp JSON file, never
 * as a command-line argument. Large Gutenberg documents contain spaces,
 * quotes, ampersands and block comments; passing them through Windows argv is
 * fragile and can leave a created page behind even when the CLI exits nonzero.
 */
const POST_PAYLOAD_SCRIPT = `<?php
if (!isset($args[0]) || !is_readable($args[0])) {
    fwrite(STDERR, "Missing payload file.\\n");
    exit(1);
}
$payload = json_decode(file_get_contents($args[0]), true);
if (!is_array($payload)) {
    fwrite(STDERR, "Invalid payload JSON.\\n");
    exit(1);
}
$action = isset($payload['action']) ? (string) $payload['action'] : 'create';
$postarr = array();
if ($action === 'update') {
    $postarr['ID'] = isset($payload['id']) ? (int) $payload['id'] : 0;
    if ($postarr['ID'] <= 0) {
        fwrite(STDERR, "Missing post ID.\\n");
        exit(1);
    }
} else {
    $postarr['post_type'] = 'page';
}
$fields = array(
    'post_title' => 'title',
    'post_content' => 'content',
    'post_status' => 'status',
    'post_name' => 'slug',
);
foreach ($fields as $postKey => $payloadKey) {
    if (array_key_exists($payloadKey, $payload)) {
        $postarr[$postKey] = (string) $payload[$payloadKey];
    }
}
if ($action === 'update') {
    $post_id = wp_update_post(wp_slash($postarr), true);
} else {
    $post_id = wp_insert_post(wp_slash($postarr), true);
}
if (is_wp_error($post_id)) {
    fwrite(STDERR, $post_id->get_error_message() . "\\n");
    exit(1);
}
if (!$post_id) {
    fwrite(STDERR, "WordPress did not return a post ID.\\n");
    exit(1);
}
echo (int) $post_id;
`;

export interface WpCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WpPluginInfo {
  name: string;
  status: string;
  version: string;
  update?: string;
}

export interface WpPageSummary {
  id: number;
  title: string;
  slug: string;
  status: string;
  url: string;
}

export class LocalWpSiteManager {
  private phpBinary: string;
  private wpCliPhar: string;
  private sitePath: string;
  private phprcDir: string;

  constructor(options?: {
    phpBinary?: string;
    wpCliPhar?: string;
    sitePath?: string;
    phprcDir?: string;
  }) {
    // Default to LocalWP paths on Windows or fall back to system PATH
    const userProfile = process.env.USERPROFILE || 'C:\\Users\\india';
    const localAppData = process.env.APPDATA || `${userProfile}\\AppData\\Roaming`;

    this.phpBinary =
      options?.phpBinary ||
      `${localAppData}\\Local\\lightning-services\\php-8.2.29+0\\bin\\win64\\php.exe`;

    this.wpCliPhar =
      options?.wpCliPhar ||
      `C:\\Program Files (x86)\\Local\\resources\\extraResources\\bin\\wp-cli\\wp-cli.phar`;

    this.sitePath =
      options?.sitePath ||
      `${userProfile}\\Local Sites\\test\\app\\public`;

    this.phprcDir =
      options?.phprcDir ||
      `${localAppData}\\Local\\run\\ZJliuERXW\\conf\\php`;
  }

  /**
   * Executes a WP-CLI command against the LocalWP instance safely via execFile.
   */
  async runWpCli(args: string[], options?: { timeout?: number }): Promise<WpCliResult> {
    const fullArgs = [
      this.wpCliPhar,
      ...args,
      `--path=${this.sitePath}`,
    ];

    const env = {
      ...process.env,
      PHPRC: this.phprcDir,
      WP_CLI_DISABLE_AUTO_CHECK_UPDATE: '1',
    };

    try {
      const { stdout, stderr } = await execFileAsync(this.phpBinary, fullArgs, {
        env,
        timeout: options?.timeout ?? 30000,
        maxBuffer: 5 * 1024 * 1024,
      });

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (err: any) {
      const stdout = err.stdout?.trim() || '';
      const stderr = err.stderr?.trim() || '';
      return {
        stdout,
        // Keep the real WP-CLI error visible. Falling back to err.message
        // alone hides the useful part behind the full command line.
        stderr: stderr || stdout || err.message,
        exitCode: typeof err.code === 'number' ? err.code : 1,
      };
    }
  }

  /**
   * Creates or updates a page through a temp JSON payload + `wp eval-file`.
   * This avoids putting the entire Gutenberg document on the Windows command
   * line and keeps the write path idempotent when a CLI process exits late.
   */
  private async runWpCliWithPostPayload(
    payload: Record<string, unknown>,
    options?: { timeout?: number }
  ): Promise<WpCliResult> {
    const dir = await mkdtemp(join(tmpdir(), 'sitepilot-wp-'));
    const payloadPath = join(dir, 'payload.json');
    const scriptPath = join(dir, 'apply-post.php');

    try {
      await writeFile(payloadPath, JSON.stringify(payload), 'utf8');
      await writeFile(scriptPath, POST_PAYLOAD_SCRIPT, 'utf8');
      return await this.runWpCli(
        ['eval-file', scriptPath, payloadPath],
        { timeout: options?.timeout ?? 120000 }
      );
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  // --- Plugin Management ---

  async listPlugins(): Promise<WpPluginInfo[]> {
    const res = await this.runWpCli(['plugin', 'list', '--format=json']);
    if (res.exitCode !== 0) {
      throw new Error(`Failed to list plugins: ${res.stderr || res.stdout}`);
    }

    try {
      // Find the JSON array in output (stripping any PHP startup warnings)
      const jsonStart = res.stdout.indexOf('[');
      if (jsonStart === -1) return [];
      const jsonStr = res.stdout.substring(jsonStart);
      return JSON.parse(jsonStr) as WpPluginInfo[];
    } catch (e: any) {
      throw new Error(`Failed to parse plugin list output: ${e.message}`);
    }
  }

  async listPages(): Promise<WpPageSummary[]> {
    const listRes = await this.runWpCli([
      'post',
      'list',
      '--post_type=page',
      '--post_status=any',
      '--format=json',
    ]);
    if (listRes.exitCode !== 0) {
      throw new Error(`Failed to list pages: ${listRes.stderr || listRes.stdout}`);
    }

    const jsonStart = listRes.stdout.indexOf('[');
    if (jsonStart === -1) return [];

    let records: Array<{ ID: number | string }>;
    try {
      records = JSON.parse(listRes.stdout.substring(jsonStart)) as Array<{ ID: number | string }>;
    } catch (error) {
      throw new Error(`Failed to parse page list output: ${(error as Error).message}`);
    }

    return Promise.all(
      records.map(async ({ ID }) => {
        const pageRes = await this.runWpCli(['post', 'get', String(ID), '--format=json']);
        if (pageRes.exitCode !== 0) {
          throw new Error(`Failed to read page #${ID}: ${pageRes.stderr || pageRes.stdout}`);
        }

        const pageJsonStart = pageRes.stdout.indexOf('{');
        if (pageJsonStart === -1) {
          throw new Error(`Failed to parse page #${ID} output.`);
        }

        const page = JSON.parse(pageRes.stdout.substring(pageJsonStart)) as Record<string, unknown>;
        return {
          id: Number(page.ID),
          title: String(page.post_title || '(Untitled page)'),
          slug: String(page.post_name || ''),
          status: String(page.post_status || 'unknown'),
          url: String(page.url || ''),
        };
      })
    );
  }

  async installPlugin(slug: string, activate = true): Promise<{ success: boolean; message: string }> {
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanSlug) {
      throw new Error('Invalid plugin slug provided.');
    }

    const args = ['plugin', 'install', cleanSlug];
    if (activate) {
      args.push('--activate');
    }

    const res = await this.runWpCli(args);
    if (res.exitCode !== 0) {
      throw new Error(`Failed to install plugin ${cleanSlug}: ${res.stderr || res.stdout}`);
    }

    return {
      success: true,
      message: res.stdout,
    };
  }

  async activatePlugin(slug: string): Promise<{ success: boolean; message: string }> {
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const res = await this.runWpCli(['plugin', 'activate', cleanSlug]);
    if (res.exitCode !== 0) {
      throw new Error(`Failed to activate plugin ${cleanSlug}: ${res.stderr || res.stdout}`);
    }

    return {
      success: true,
      message: res.stdout,
    };
  }

  async deactivatePlugin(slug: string): Promise<{ success: boolean; message: string }> {
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const res = await this.runWpCli(['plugin', 'deactivate', cleanSlug]);
    if (res.exitCode !== 0) {
      throw new Error(`Failed to deactivate plugin ${cleanSlug}: ${res.stderr || res.stdout}`);
    }

    return {
      success: true,
      message: res.stdout,
    };
  }

  // --- Site Options & Settings ---

  async getOption(key: AllowedOptionKey): Promise<string> {
    const res = await this.runWpCli(['option', 'get', key]);
    if (res.exitCode !== 0) {
      return '';
    }
    // Filter out PHP startup warnings, notices, and empty lines
    const cleanLines = res.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('Warning:') && !l.startsWith('Notice:') && !l.startsWith('Deprecated:'));
    return cleanLines.length > 0 ? cleanLines[cleanLines.length - 1] : '';
  }

  async updateOption(key: AllowedOptionKey, value: string): Promise<boolean> {
    const res = await this.runWpCli(['option', 'update', key, value]);
    return res.exitCode === 0;
  }

  async getSiteSettings(): Promise<Record<string, string>> {
    const keys: AllowedOptionKey[] = [
      'blogname',
      'blogdescription',
      'permalink_structure',
      'show_on_front',
      'page_on_front',
      'posts_per_page',
    ];

    const settings: Record<string, string> = {};
    for (const key of keys) {
      settings[key] = await this.getOption(key);
    }
    return settings;
  }

  async updateSiteSettings(settings: Record<string, string>): Promise<{ updated: string[] }> {
    const updated: string[] = [];
    for (const [key, value] of Object.entries(settings)) {
      const allowed = key as AllowedOptionKey;
      await this.updateOption(allowed, value);
      updated.push(key);
    }
    return { updated };
  }

  // --- Code Injection (Header/Footer/CSS) ---

  async injectCode(location: 'header' | 'footer' | 'css', code: string): Promise<{ success: boolean }> {
    const optionMap: Record<string, AllowedOptionKey> = {
      header: 'header_scripts',
      footer: 'footer_scripts',
      css: 'custom_css',
    };

    const targetKey = optionMap[location];
    if (!targetKey) {
      throw new Error(`Unsupported code injection location: ${location}`);
    }

    const current = await this.getOption(targetKey);
    const combined = current ? `${current}\n\n${code}` : code;
    const ok = await this.updateOption(targetKey, combined);
    return { success: ok };
  }

  // --- Page Creation & Homepage Management ---

  private async setFrontPage(pageId: number): Promise<void> {
    await this.updateOption('show_on_front', 'page');
    await this.updateOption('page_on_front', String(pageId));
  }

  private async findPageBySlug(slug: string): Promise<Record<string, any> | null> {
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanSlug) return null;

    const res = await this.runWpCli([
      'post',
      'list',
      '--post_type=page',
      '--post_status=any',
      `--name=${cleanSlug}`,
      '--format=json',
    ]);
    if (res.exitCode !== 0) return null;

    const jsonStart = res.stdout.indexOf('[');
    if (jsonStart === -1) return null;

    try {
      const parsed = JSON.parse(res.stdout.substring(jsonStart));
      return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
    } catch {
      return null;
    }
  }

  private pageResultFromData(
    data: Record<string, any>,
    fallback: {
      id: number;
      title: string;
      status: string;
      slug: string;
      isFrontPage: boolean;
      source: 'created' | 'existing' | 'recovered';
    }
  ): {
    id: number;
    title: string;
    status: string;
    slug: string;
    url: string;
    editUrl: string;
    isFrontPage: boolean;
    verified: boolean;
    source: 'created' | 'existing' | 'recovered';
  } {
    const id = Number(data.ID || fallback.id);
    return {
      id,
      title: String(data.post_title || fallback.title),
      status: String(data.post_status || fallback.status),
      slug: String(data.post_name || fallback.slug),
      url: String(data.url || `http://test.local/?page_id=${id}`),
      editUrl: `http://test.local/wp-admin/post.php?post=${id}&action=edit`,
      isFrontPage: fallback.isFrontPage,
      verified: true,
      source: fallback.source,
    };
  }

  async createPage(params: {
    title: string;
    content: string;
    slug?: string;
    status?: 'draft' | 'publish';
    isFrontPage?: boolean;
  }): Promise<{
    id: number;
    title: string;
    status: string;
    slug: string;
    url: string;
    editUrl: string;
    isFrontPage: boolean;
    verified: boolean;
    source: 'created' | 'existing' | 'recovered';
  }> {
    const title = params.title.trim();
    const content = params.content.trim();
    const status = params.status || 'draft';
    const cleanSlug = params.slug
      ? params.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
      : '';

    // Idempotency guard: a retry after a late CLI exit must not create a
    // second page with the same title/slug.
    if (cleanSlug) {
      const existing = await this.findPageBySlug(cleanSlug);
      if (existing && String(existing.post_title || '') === title) {
        const existingId = Number(existing.ID);
        const existingStatus = String(existing.post_status || '');

        // Same slug/title and same status: this is a retry, return the page
        // that already exists instead of creating a duplicate.
        if (existingStatus === status) {
          if (params.isFrontPage) await this.setFrontPage(existingId);
          return this.pageResultFromData(existing, {
            id: existingId,
            title,
            status,
            slug: cleanSlug,
            isFrontPage: Boolean(params.isFrontPage),
            source: 'existing',
          });
        }

        // Same page, different approved status (for example draft -> publish):
        // update it rather than creating a second page with a -2 slug.
        const updateRes = await this.runWpCliWithPostPayload({
          action: 'update',
          id: existingId,
          title,
          content,
          status,
          slug: cleanSlug,
        });
        if (updateRes.exitCode !== 0) {
          throw new Error(
            `Page "${title}" already exists as #${existingId}, but updating it failed: ${
              updateRes.stderr || updateRes.stdout
            }`
          );
        }
        if (params.isFrontPage) await this.setFrontPage(existingId);
        return this.pageResultFromData(
          { ...existing, post_status: status },
          {
            id: existingId,
            title,
            status,
            slug: cleanSlug,
            isFrontPage: Boolean(params.isFrontPage),
            source: 'existing',
          }
        );
      }
    }

    const res = await this.runWpCliWithPostPayload({
      action: 'create',
      title,
      content,
      status,
      ...(cleanSlug ? { slug: cleanSlug } : {}),
    });

    if (res.exitCode !== 0) {
      // WP-CLI can insert the page and still exit nonzero (a timeout or a
      // post-save hook). Recover the created page instead of reporting a
      // failure that invites a duplicate retry.
      if (cleanSlug) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const recovered = await this.findPageBySlug(cleanSlug);
          if (recovered && String(recovered.post_title || '') === title) {
            const recoveredId = Number(recovered.ID);
            if (params.isFrontPage) await this.setFrontPage(recoveredId);
            return this.pageResultFromData(recovered, {
              id: recoveredId,
              title,
              status: String(recovered.post_status || status),
              slug: cleanSlug,
              isFrontPage: Boolean(params.isFrontPage),
              source: 'recovered',
            });
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      throw new Error(`Failed to create page "${title}": ${res.stderr || res.stdout}`);
    }

    // Extract ID (strip any PHP startup warnings)
    const cleanLines = res.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\d+$/.test(l));

    const pageId = cleanLines.length > 0 ? parseInt(cleanLines[0], 10) : 0;
    if (!pageId) {
      throw new Error(`WP-CLI did not return a valid page ID: ${res.stdout}`);
    }

    // Inspect the created page to get URL/slug and verify the write.
    const getRes = await this.runWpCli(['post', 'get', String(pageId), '--format=json']);
    let pageSlug = cleanSlug || `page-${pageId}`;
    let pageUrl = `http://test.local/?page_id=${pageId}`;
    let verified = false;
    if (getRes.exitCode === 0) {
      try {
        const jsonStart = getRes.stdout.indexOf('{');
        if (jsonStart !== -1) {
          const pageData = JSON.parse(getRes.stdout.substring(jsonStart));
          pageSlug = pageData.post_name || pageSlug;
          pageUrl = pageData.url || pageUrl;
          const marker = content
            .match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
            ?.replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          const contentPresent = marker
            ? String(pageData.post_content || '').includes(marker)
            : Boolean(pageData.post_content);
          verified =
            Number(pageData.ID) === pageId &&
            String(pageData.post_status || '') === status &&
            contentPresent;
        }
      } catch {
        // Fallback to defaults; verified stays false.
      }
    }

    // If requested to be front page, set page_on_front and show_on_front = 'page'
    let isFrontPage = false;
    if (params.isFrontPage) {
      await this.setFrontPage(pageId);
      isFrontPage = true;
    }

    return {
      id: pageId,
      title,
      status,
      slug: pageSlug,
      url: pageUrl,
      editUrl: `http://test.local/wp-admin/post.php?post=${pageId}&action=edit`,
      isFrontPage,
      verified,
      source: 'created',
    };
  }

  async updatePage(params: {
    id: number;
    title?: string;
    content?: string;
    status?: 'draft' | 'publish';
  }): Promise<{
    id: number;
    title: string;
    status: string;
    url: string;
  }> {
    const payload: Record<string, unknown> = {
      action: 'update',
      id: params.id,
    };
    if (params.title) payload.title = params.title.trim();
    if (params.content) payload.content = params.content.trim();
    if (params.status) payload.status = params.status;

    const res = await this.runWpCliWithPostPayload(payload);
    if (res.exitCode !== 0) {
      throw new Error(`Failed to update page #${params.id}: ${res.stderr || res.stdout}`);
    }

    const getRes = await this.runWpCli(['post', 'get', String(params.id), '--format=json']);
    let pageTitle = params.title || '';
    let pageStatus = params.status || 'publish';
    let pageUrl = `http://test.local/?page_id=${params.id}`;

    if (getRes.exitCode === 0) {
      try {
        const jsonStart = getRes.stdout.indexOf('{');
        if (jsonStart !== -1) {
          const pageData = JSON.parse(getRes.stdout.substring(jsonStart));
          pageTitle = pageData.post_title || pageTitle;
          pageStatus = pageData.post_status || pageStatus;
          pageUrl = pageData.url || pageUrl;
        }
      } catch {
        // Fallback to defaults
      }
    }

    return {
      id: params.id,
      title: pageTitle,
      status: pageStatus,
      url: pageUrl,
    };
  }
}

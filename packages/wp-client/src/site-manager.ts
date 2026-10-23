import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AllowedOptionKey } from '@wp-agent/contracts';

const execFileAsync = promisify(execFile);

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
  async runWpCli(args: string[]): Promise<WpCliResult> {
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
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024,
      });

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (err: any) {
      return {
        stdout: err.stdout?.trim() || '',
        stderr: err.stderr?.trim() || err.message,
        exitCode: err.code || 1,
      };
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
  }> {
    const title = params.title.trim();
    const content = params.content.trim();
    const status = params.status || 'draft';

    const args = [
      'post',
      'create',
      '--post_type=page',
      `--post_title=${title}`,
      `--post_content=${content}`,
      `--post_status=${status}`,
      '--porcelain',
    ];

    if (params.slug) {
      args.push(`--post_name=${params.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')}`);
    }

    const res = await this.runWpCli(args);
    if (res.exitCode !== 0) {
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

    // Inspect created page to get URL and slug
    const getRes = await this.runWpCli(['post', 'get', String(pageId), '--format=json']);
    let pageSlug = params.slug || `page-${pageId}`;
    let pageUrl = `http://test.local/?page_id=${pageId}`;
    if (getRes.exitCode === 0) {
      try {
        const jsonStart = getRes.stdout.indexOf('{');
        if (jsonStart !== -1) {
          const pageData = JSON.parse(getRes.stdout.substring(jsonStart));
          pageSlug = pageData.post_name || pageSlug;
          pageUrl = pageData.url || pageUrl;
        }
      } catch {
        // Fallback to defaults
      }
    }

    // If requested to be front page, set page_on_front and show_on_front = 'page'
    let isFrontPage = false;
    if (params.isFrontPage) {
      await this.updateOption('show_on_front', 'page');
      await this.updateOption('page_on_front', String(pageId));
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
    };
  }
}

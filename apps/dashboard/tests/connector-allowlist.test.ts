import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHIPPED_TOOL_SPECS } from '@wp-agent/wp-tools';
import { CONNECTOR_TOOL_ALLOWLIST, TOOL_RISK } from '../src/lib/connector/jobs';

const READ_TOOLS = [
  'site.info',
  'site.health',
  'site.logs',
  'site.search',
  'content.list',
  'content.get',
  'plugins.list',
  'theme.info',
  'users.list',
  'media.list',
  'terms.list',
  'menus.list',
  'settings.get',
  'seo.meta.get',
  'blocks.parse',
];

const WRITE_TOOLS = [
  'content.update',
  'content.create',
  'content.restore',
  'content.publish',
  'content.unpublish',
  'blocks.replace',
  'terms.create',
  'terms.assign',
  'terms.restore',
  'settings.update',
  'settings.restore',
  'seo.meta.update',
  'seo.meta.restore',
  'media.update',
  'media.restore',
  'media.set_featured',
  'media.restore_featured',
  'menus.save',
  'menus.restore',
];

describe('connector tool allowlist & PHP plugin parity (v1.0.0 — 34 shipped tools)', () => {
  it('admits all 15 inventory/diagnostic read tools at R0', () => {
    expect(READ_TOOLS).toHaveLength(15);
    for (const tool of READ_TOOLS) {
      expect(CONNECTOR_TOOL_ALLOWLIST.has(tool)).toBe(true);
      expect(TOOL_RISK[tool]).toBe('R0');
    }
  });

  it('admits all 19 reversible write & restore tools with a risk floor above R0', () => {
    expect(WRITE_TOOLS).toHaveLength(19);
    for (const tool of WRITE_TOOLS) {
      expect(CONNECTOR_TOOL_ALLOWLIST.has(tool)).toBe(true);
      expect(['R1', 'R2']).toContain(TOOL_RISK[tool]);
    }
    expect(CONNECTOR_TOOL_ALLOWLIST.size).toBe(34);
  });

  it('has 1-to-1 tool & scope parity between @wp-agent/wp-tools and PHP KPH_SP_Tools', () => {
    const phpPath = path.resolve(
      __dirname,
      '../../../wordpress/kph-sitepilot-connector/includes/class-tools.php'
    );
    const phpSource = fs.readFileSync(phpPath, 'utf8');

    const supportedBlock = phpSource.match(
      /public static function supported\(\)\s*\{[\s\S]*?return array\(([\s\S]*?)\);\s*\}/
    );
    expect(supportedBlock).not.toBeNull();
    const phpSupported = Array.from(
      (supportedBlock?.[1] ?? '').matchAll(/'([a-z0-9_.]+)'/g)
    ).map((m) => m[1]);

    expect(new Set(phpSupported)).toEqual(CONNECTOR_TOOL_ALLOWLIST);
    expect(phpSupported).toHaveLength(34);

    const scopeBlock = phpSource.match(
      /public static function scope_for\(\s*\$tool\s*\)\s*\{[\s\S]*?\$map = array\(([\s\S]*?)\);/
    );
    expect(scopeBlock).not.toBeNull();
    const phpScopes = Object.fromEntries(
      Array.from((scopeBlock?.[1] ?? '').matchAll(/'([a-z0-9_.]+)'\s*=>\s*'([a-z0-9_]+)'/g)).map(
        (m) => [m[1], m[2]]
      )
    );

    for (const spec of SHIPPED_TOOL_SPECS) {
      expect(phpScopes[spec.tool]).toBe(spec.scope);
    }

    // Security invariants mirrored from wordpress/kph-sitepilot-connector/tests/test-plugin.php
    expect(phpSource.split('update_post_meta(').length - 1).toBe(1);
    expect(phpSource).toContain('function update_allowlisted_post_meta');
    expect(phpSource).toContain('function allowed_seo_meta_keys');
    expect(phpSource.split('wp_delete_post(').length - 1).toBe(1);
    expect(phpSource).toContain("'nav_menu_item' === get_post_type");
    expect(phpSource).not.toContain('wp_remote_');
    expect(phpSource).not.toContain('user_email');
    expect(phpSource).not.toContain('user_pass');
    expect(phpSource).not.toContain('unfiltered_html');
  });

  it('has no risk entry without an allowlist entry and vice versa', () => {
    for (const tool of Object.keys(TOOL_RISK)) {
      expect(CONNECTOR_TOOL_ALLOWLIST.has(tool)).toBe(true);
    }
    for (const tool of CONNECTOR_TOOL_ALLOWLIST) {
      expect(TOOL_RISK[tool]).toBeDefined();
    }
  });

  it('refuses anything that is not listed (including unshipped V2 entries)', () => {
    for (const tool of [
      'content.delete',
      'code.eval',
      'files.read',
      'files.write',
      'woo.products.update',
      'plugins.install',
      '',
    ]) {
      expect(CONNECTOR_TOOL_ALLOWLIST.has(tool)).toBe(false);
    }
  });
});

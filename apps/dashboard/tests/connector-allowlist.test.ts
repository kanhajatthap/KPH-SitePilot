import { describe, expect, it } from 'vitest';
import { CONNECTOR_TOOL_ALLOWLIST, TOOL_RISK } from '../src/lib/connector/jobs';

/**
 * The allowlist is the deny-by-default gate between a queue entry and a real
 * WordPress call, so it is pinned here: a tool added to the plugin without a
 * platform entry (or the reverse) is a bug that must show up in CI, not on a
 * customer's site.
 */
const READ_TOOLS = [
  'site.info',
  'site.health',
  'content.list',
  'content.get',
  'plugins.list',
  'theme.info',
  'users.list',
  'media.list',
  'terms.list',
  'menus.list',
  'settings.get',
  'blocks.parse',
];

const WRITE_TOOLS = [
  'content.update',
  'content.create',
  'content.restore',
  'content.publish',
  'content.unpublish',
  'blocks.replace',
  'settings.update',
  'settings.restore',
];

describe('connector tool allowlist', () => {
  it('admits every inventory read tool at R0', () => {
    for (const tool of READ_TOOLS) {
      expect(CONNECTOR_TOOL_ALLOWLIST.has(tool)).toBe(true);
      expect(TOOL_RISK[tool]).toBe('R0');
    }
  });

  it('admits the reversible writes with a risk floor above R0', () => {
    for (const tool of WRITE_TOOLS) {
      expect(CONNECTOR_TOOL_ALLOWLIST.has(tool)).toBe(true);
      expect(['R1', 'R2']).toContain(TOOL_RISK[tool]);
    }
  });

  it('has no risk entry without an allowlist entry', () => {
    for (const tool of Object.keys(TOOL_RISK)) {
      expect(CONNECTOR_TOOL_ALLOWLIST.has(tool)).toBe(true);
    }
  });

  it('has no allowlist entry without a risk floor', () => {
    for (const tool of CONNECTOR_TOOL_ALLOWLIST) {
      expect(TOOL_RISK[tool]).toBeDefined();
    }
  });

  it('refuses anything that is not listed', () => {
    for (const tool of ['content.delete', 'code.eval', 'files.read', 'plugins.install', '']) {
      expect(CONNECTOR_TOOL_ALLOWLIST.has(tool)).toBe(false);
    }
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  KEYBOARD_SHORTCUTS,
  SEQUENCE_SHORTCUTS,
  SINGLE_KEY_SHORTCUTS,
  appendSequenceKey,
  detectPlatform,
  filterCommands,
  isEditableTarget,
  isPaletteDismiss,
  isPaletteShortcut,
  isSequenceMatch,
  matchSequence,
  matchSingleKey,
  moveSelection,
  paletteSelectionKey,
  shortcutLabel,
  type PaletteKeyEvent,
} from '../src/lib/command-palette';
import { DOCS_ENTRIES } from '../src/lib/docs';
import { isPublicPagePath } from '../src/lib/auth/routes';

const APP_DIR = path.resolve(__dirname, '../src/app');

function key(overrides: Partial<PaletteKeyEvent> = {}): PaletteKeyEvent {
  return { key: 'k', ...overrides };
}

describe('E9-15 command palette view model', () => {
  it('has a deduplicated command list with real destinations', () => {
    expect(COMMANDS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(COMMANDS.map((command) => command.id)).size).toBe(COMMANDS.length);
    for (const command of COMMANDS) {
      expect(command.href.startsWith('/'), command.id).toBe(true);
      expect(command.label.length, command.id).toBeGreaterThan(3);
      expect(command.hint.length, command.id).toBeGreaterThan(3);
    }
  });

  it('filters with AND semantics and ranks label hits first', () => {
    expect(filterCommands('')).toEqual([...COMMANDS]);
    expect(filterCommands('   ')).toEqual([...COMMANDS]);
    expect(filterCommands('banana keyboard')).toEqual([]);
    expect(filterCommands('open activity').map((c) => c.id)).toContain('activity');
    const ranked = filterCommands('documentation');
    expect(ranked[0].id).toBe('docs');
  });

  it('never mutates the source list', () => {
    const before = COMMANDS.map((command) => command.id).join('|');
    filterCommands('docs');
    expect(COMMANDS.map((command) => command.id).join('|')).toBe(before);
  });

  it('detects ⌘K / Ctrl+K but not plain k or IME composition', () => {
    expect(isPaletteShortcut(key({ metaKey: true }))).toBe(true);
    expect(isPaletteShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isPaletteShortcut(key())).toBe(false);
    expect(isPaletteShortcut(key({ metaKey: true, isComposing: true }))).toBe(false);
    expect(isPaletteShortcut(key({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isPaletteShortcut(key({ metaKey: true, key: 'K' }))).toBe(true);
  });

  it('dismisses on Escape only outside composition', () => {
    expect(isPaletteDismiss(key({ key: 'Escape' }))).toBe(true);
    expect(isPaletteDismiss(key({ key: 'Escape', isComposing: true }))).toBe(false);
    expect(isPaletteDismiss(key())).toBe(false);
  });

  it('ignores single-key shortcuts inside editable targets', () => {
    expect(isEditableTarget('INPUT')).toBe(true);
    expect(isEditableTarget('textarea')).toBe(true);
    expect(isEditableTarget('DIV', true)).toBe(true);
    expect(isEditableTarget('DIV')).toBe(false);
    expect(matchSingleKey(key({ key: 'u', targetIsEditable: true }))).toBeNull();
    expect(matchSingleKey(key({ key: 'u', metaKey: true }))).toBeNull();
    expect(matchSingleKey(key({ key: 'u', isComposing: true }))).toBeNull();
    expect(matchSingleKey(key({ key: 'u' }))?.id).toBe('undo');
  });

  it('resolves the g then a sequence without stealing modifier keys', () => {
    expect(appendSequenceKey([], 'g')).toEqual(['g']);
    expect(appendSequenceKey(['g'], 'a')).toEqual(['g', 'a']);
    expect(appendSequenceKey(['g', 'a'], 'x')).toEqual(['a', 'x']);
    expect(appendSequenceKey(['g'], 'ArrowDown')).toEqual([]);
    expect(isSequenceMatch(['a', 'g', 'a'], ['g', 'a'])).toBe(true);
    expect(isSequenceMatch(['g'], ['g', 'a'])).toBe(false);
    expect(matchSequence(['g', 'a'])?.href).toBe('/activity');
    expect(matchSequence(['a', 'b'])).toBeNull();
    expect(SEQUENCE_SHORTCUTS).toHaveLength(1);
    expect(SINGLE_KEY_SHORTCUTS.map((item) => item.id)).toContain('undo');
  });

  it('wraps palette selection and handles Home / End', () => {
    expect(moveSelection(-1, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, 0, 0)).toBe(-1);
    expect(paletteSelectionKey(key({ key: 'ArrowDown' }), 0, 3)).toBe(1);
    expect(paletteSelectionKey(key({ key: 'ArrowUp' }), 0, 3)).toBe(2);
    expect(paletteSelectionKey(key({ key: 'Home' }), 2, 3)).toBe(0);
    expect(paletteSelectionKey(key({ key: 'End' }), 0, 3)).toBe(2);
    expect(paletteSelectionKey(key(), 0, 3)).toBeNull();
  });

  it('documents every required shortcut with a platform label', () => {
    expect(KEYBOARD_SHORTCUTS.map((item) => item.id)).toEqual([
      'palette', 'send', 'undo', 'activity', 'close',
    ]);
    expect(shortcutLabel('mac')).toBe('⌘K');
    expect(shortcutLabel('other')).toBe('Ctrl+K');
    expect(detectPlatform({ userAgent: 'Macintosh' })).toBe('mac');
    expect(detectPlatform({ userAgent: 'Windows NT' })).toBe('other');
    expect(detectPlatform()).toBe('other');
  });
});

describe('E9-15 docs + accessible component wiring', () => {
  it('ships a public shortcuts page in the docs index', () => {
    const entry = DOCS_ENTRIES.find((item) => item.href === '/docs/shortcuts');
    expect(entry).toBeDefined();
    expect(entry?.section).toBe('Reference');
    expect(entry?.keywords.length).toBeGreaterThan(0);
    expect(isPublicPagePath('/docs/shortcuts')).toBe(true);
    expect(fs.existsSync(path.join(APP_DIR, 'docs/shortcuts/page.tsx'))).toBe(true);
  });

  it('renders an ARIA combobox/listbox with 44px options and IME-safe keys', () => {
    const source = fs.readFileSync(path.join(APP_DIR.replace(/app$/, ''), 'components/CommandPalette.tsx'), 'utf8');
    for (const marker of [
      'role="dialog"',
      'aria-modal',
      'role="combobox"',
      'aria-activedescendant',
      'role="listbox"',
      'role="option"',
      'min-h-touch',
      'isComposing',
      'isPaletteDismiss',
      'paletteSelectionKey',
    ]) {
      expect(source, marker).toContain(marker);
    }
  });

  it('wires the palette into the workspace with a visible trigger', () => {
    const source = fs.readFileSync(path.join(APP_DIR, 'WorkspaceClient.tsx'), 'utf8');
    expect(source).toContain('<CommandPalette');
    expect(source).toContain('data-command-palette-trigger="true"');
    expect(source).toContain('isPaletteShortcut(keyEvent)');
    expect(source).toContain('matchSequence(sequenceRef.current)');
  });
});

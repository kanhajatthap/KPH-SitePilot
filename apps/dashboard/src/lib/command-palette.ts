/**
 * E9-15 — command palette view model.
 *
 * Pure and DOM-free on purpose: the component renders exactly what these
 * functions decide, so keyboard behaviour is unit-testable without a browser.
 * IME composition is respected (⌘/Ctrl+K never fires mid-composition) and
 * single-key shortcuts never steal characters from a text field.
 */

export type CommandGroup = 'Navigate' | 'Actions' | 'Help';

export interface CommandDefinition {
  id: string;
  label: string;
  group: CommandGroup;
  hint: string;
  href: string;
  shortcut?: string;
}

export const COMMANDS: readonly CommandDefinition[] = [
  { id: 'activity', label: 'Open activity & undo', group: 'Navigate', hint: 'Timeline, filters, one-click undo', href: '/activity', shortcut: 'g a' },
  { id: 'studio', label: 'Open Studio', group: 'Navigate', hint: 'Site pages and sections', href: '/studio' },
  { id: 'connect', label: 'Connect a WordPress site', group: 'Navigate', hint: 'Pairing code and guided setup', href: '/onboarding' },
  { id: 'settings', label: 'Site settings', group: 'Navigate', hint: 'Connected sites and scopes', href: '/settings/site' },
  { id: 'docs', label: 'Documentation home', group: 'Help', hint: 'Public docs hub', href: '/docs' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Help', hint: 'Every shortcut in one table', href: '/docs/shortcuts', shortcut: '⌘K' },
  { id: 'safety', label: 'Safety, snapshots & undo', group: 'Help', hint: 'Plan → approve → verify → undo', href: '/docs/safety' },
  { id: 'troubleshooting', label: 'Troubleshooting & error codes', group: 'Help', hint: 'Typed errors and one next action', href: '/docs/troubleshooting' },
];

export interface ShortcutDefinition {
  id: string;
  label: string;
  mac: string;
  other: string;
  description: string;
}

export const KEYBOARD_SHORTCUTS: readonly ShortcutDefinition[] = [
  { id: 'palette', label: 'Command palette', mac: '⌘K', other: 'Ctrl+K', description: 'Open or close the searchable command list.' },
  { id: 'send', label: 'Send message', mac: '⌘↵', other: 'Ctrl+↵', description: 'Submit the composer draft (IME-safe).' },
  { id: 'undo', label: 'Go to undo', mac: 'u', other: 'u', description: 'Open the activity timeline where one-click undo lives.' },
  { id: 'activity', label: 'Go to activity', mac: 'g a', other: 'g a', description: 'Press g then a outside a text field.' },
  { id: 'close', label: 'Dismiss palette', mac: 'Esc', other: 'Esc', description: 'Close the palette and return focus.' },
];

export interface PaletteKeyEvent {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
  targetIsEditable?: boolean;
}

export function isPaletteShortcut(event: PaletteKeyEvent): boolean {
  if (event.isComposing || event.altKey) return false;
  if (!event.metaKey && !event.ctrlKey) return false;
  return event.key.toLowerCase() === 'k';
}

export function isPaletteDismiss(event: PaletteKeyEvent): boolean {
  return !event.isComposing && event.key === 'Escape';
}

export function isEditableTarget(tagName?: string, isContentEditable?: boolean): boolean {
  if (isContentEditable) return true;
  if (!tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName.toUpperCase());
}

export interface SequenceShortcut {
  id: string;
  sequence: readonly string[];
  href: string;
  label: string;
}

export const SEQUENCE_SHORTCUTS: readonly SequenceShortcut[] = [
  { id: 'activity', sequence: ['g', 'a'], href: '/activity', label: 'Go to activity' },
];

export interface SingleKeyShortcut {
  id: string;
  key: string;
  href: string;
  label: string;
}

export const SINGLE_KEY_SHORTCUTS: readonly SingleKeyShortcut[] = [
  { id: 'undo', key: 'u', href: '/activity?filter=all', label: 'Go to undo' },
];

export function appendSequenceKey(buffer: readonly string[], key: string): string[] {
  if (key.length !== 1) return [];
  return [...buffer, key.toLowerCase()].slice(-2);
}

export function isSequenceMatch(buffer: readonly string[], sequence: readonly string[]): boolean {
  if (buffer.length < sequence.length) return false;
  const tail = buffer.slice(-sequence.length);
  return tail.every((key, index) => key === sequence[index]);
}

export function matchSequence(buffer: readonly string[]): SequenceShortcut | null {
  return SEQUENCE_SHORTCUTS.find((shortcut) => isSequenceMatch(buffer, shortcut.sequence)) ?? null;
}

export function matchSingleKey(event: PaletteKeyEvent): SingleKeyShortcut | null {
  if (event.isComposing || event.repeat || event.targetIsEditable) return null;
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.key.length !== 1) return null;
  const key = event.key.toLowerCase();
  return SINGLE_KEY_SHORTCUTS.find((shortcut) => shortcut.key === key) ?? null;
}

export function shortcutLabel(platform: 'mac' | 'other' = 'other'): string {
  return platform === 'mac' ? '⌘K' : 'Ctrl+K';
}

export function detectPlatform(navigatorLike: { userAgent?: string } = {}): 'mac' | 'other' {
  const agent = navigatorLike.userAgent ?? '';
  return /Mac|iPhone|iPad|iPod/i.test(agent) ? 'mac' : 'other';
}

/** AND matching across label/group/hint, with label-prefix hits ranked first. */
export function filterCommands(
  query: string,
  commands: readonly CommandDefinition[] = COMMANDS
): CommandDefinition[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...commands];
  return commands
    .map((command, index) => {
      const haystack = `${command.label} ${command.group} ${command.hint}`.toLowerCase();
      const matched = terms.every((term) => haystack.includes(term));
      const label = command.label.toLowerCase();
      const prefix = terms.some((term) => label.startsWith(term)) ? 2 : 0;
      const labelHit = terms.some((term) => label.includes(term)) ? 1 : 0;
      return { command, index, matched, rank: prefix + labelHit };
    })
    .filter((candidate) => candidate.matched)
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((candidate) => candidate.command);
}

/** Wrap-around selection for ArrowUp/ArrowDown/Home/End. */
export function moveSelection(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return ((current + delta) % length + length) % length;
}

export function paletteSelectionKey(
  event: PaletteKeyEvent,
  current: number,
  length: number
): number | null {
  if (length <= 0) return null;
  switch (event.key) {
    case 'ArrowDown':
      return moveSelection(current, 1, length);
    case 'ArrowUp':
      return moveSelection(current, -1, length);
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return null;
  }
}

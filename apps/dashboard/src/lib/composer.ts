/**
 * Pure helpers for Composer v2 (E9-04).
 *
 * Keeping the keyboard rules, attachment policy and capability-aware prompt
 * generation out of the React tree makes them cheap to test and impossible to
 * fake: a suggestion that the site cannot run is never shown as if it worked.
 */

import type { AgentMode } from './types';
import { evaluateSiteCapabilities, suggestPromptsForSite } from './capabilities';

export interface ComposerSiteContext {
  name?: string;
  url?: string;
  status?: string;
  scopes?: readonly string[] | null;
  capabilities?: Record<string, unknown> | null;
}

export interface ComposerSuggestion {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  icon: string;
  readOnly: boolean;
}

export interface ComposerAttachment {
  name: string;
  size: number;
  text: string;
}

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 64 * 1024;
export const MAX_ATTACHMENT_CONTEXT_CHARS = 12_000;
export const COMPOSER_SHORTCUT_HINT = 'Enter or ⌘/Ctrl + ↵ to send · Shift + Enter for a new line';

const TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.log',
  '.html',
  '.css',
  '.xml',
  '.yaml',
  '.yml',
];

const INSPECT_ICON = 'M12 21a9 9 0 100-18 9 9 0 000 18z M3.5 9h17M3.5 15h17';
const WRITE_ICON = 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z';
const LAYOUT_ICON = 'M3 5h18v14H3z M3 9h18 M7 13h4';
const SETTINGS_ICON = 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z M19 12a7 7 0 00-.1-1.1l2-1.5-2-3.4-2.4 1a7 7 0 00-1.9-1.1L14.2 3h-4l-.4 2.9a7 7 0 00-1.9 1.1l-2.4-1-2 3.4 2 1.5a7 7 0 000 2.2l-2 1.5 2 3.4 2.4-1a7 7 0 001.9 1.1l.4 2.9h4l.4-2.9a7 7 0 001.9-1.1l2.4 1 2-3.4-2-1.5c.1-.4.1-.7.1-1.1z';

const CHAT_SUGGESTIONS: ComposerSuggestion[] = [
  {
    id: 'chat-hook',
    label: 'Explain a WordPress hook',
    hint: 'Chat mode uses the model only — no site tools',
    prompt: 'Explain the difference between save_post and wp_insert_post_data, with a short example.',
    icon: INSPECT_ICON,
    readOnly: true,
  },
  {
    id: 'chat-compare',
    label: 'Compare two approaches',
    hint: 'Chat mode uses the model only — no site tools',
    prompt: 'Compare a block theme versus a classic theme for a small marketing site. Give a short recommendation.',
    icon: LAYOUT_ICON,
    readOnly: true,
  },
  {
    id: 'chat-release',
    label: 'Draft release notes',
    hint: 'Chat mode uses the model only — no site tools',
    prompt: 'Draft concise release notes for a WordPress maintenance update aimed at non-technical clients.',
    icon: WRITE_ICON,
    readOnly: true,
  },
  {
    id: 'chat-rewrite',
    label: 'Rewrite this copy',
    hint: 'Chat mode uses the model only — no site tools',
    prompt: 'Rewrite this hero headline to be clearer and less jargon-heavy, keeping the same length.',
    icon: WRITE_ICON,
    readOnly: true,
  },
];

export interface KeyEventLike {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  /** IME composition (e.g. Devanagari/Hindi input) must never submit. */
  isComposing?: boolean;
}

/**
 * Enter sends, Shift+Enter makes a newline, and ⌘/Ctrl+Enter always sends —
 * even when Shift is held. Composition events are ignored so typing Hindi
 * does not fire a prompt halfway through a word.
 */
export function shouldSubmitOnKeyDown(event: KeyEventLike): boolean {
  if (event.isComposing || event.key !== 'Enter') return false;
  if (event.metaKey || event.ctrlKey) return true;
  return !event.shiftKey;
}

export type AttachmentCheck = { ok: true } | { ok: false; reason: string };

/** Only small, plain-text files are attached: there is no upload endpoint. */
export function validateAttachmentFile(file: { name: string; size: number }): AttachmentCheck {
  const name = (file.name ?? '').trim();
  const lower = name.toLowerCase();
  if (!name) return { ok: false, reason: 'That file has no name.' };
  if (!TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { ok: false, reason: 'Only small text files are supported (.txt, .md, .json, .csv, .html, .css, .xml, .yaml, .log).' };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, reason: 'That file is empty.' };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: `Keep attachments under ${Math.round(MAX_ATTACHMENT_BYTES / 1024)} KB.` };
  }
  return { ok: true };
}

/**
 * Appends locally-read file text to the prompt with a hard character budget.
 * Nothing is uploaded; the model simply receives the text as context.
 */
export function formatAttachmentContext(attachments: ComposerAttachment[], prompt: string): string {
  if (attachments.length === 0) return prompt;
  let remaining = MAX_ATTACHMENT_CONTEXT_CHARS;
  const sections = attachments.map((attachment) => {
    const name = attachment.name.replace(/[\r\n]+/g, ' ').trim() || 'attachment';
    const text = remaining > 0 ? attachment.text.slice(0, remaining) : '';
    remaining -= text.length;
    const truncated = text.length < attachment.text.length;
    return `### ${name}\n${text}${truncated ? '\n[truncated to fit the prompt budget]' : ''}`;
  });
  return [
    prompt,
    '',
    '--- Attached context (local text files, read in your browser; nothing is uploaded) ---',
    ...sections,
  ].join('\n');
}

interface PromptMeta {
  label: string;
  hint: string;
  icon: string;
  write: boolean;
}

/** Honest labels for the site-aware prompt catalogue. */
export function classifyPrompt(prompt: string): PromptMeta {
  if (/alt text|media #\d+/i.test(prompt)) {
    return { label: 'Fix media alt text', hint: 'Media scope · staged with approval', icon: LAYOUT_ICON, write: true };
  }
  if (/seo meta|meta of post/i.test(prompt)) {
    return { label: 'Improve SEO metadata', hint: 'Content scope · snapshot + read-back verify', icon: SETTINGS_ICON, write: true };
  }
  if (/site tagline|site title/i.test(prompt)) {
    return { label: 'Update site settings', hint: 'Site ops scope · reversible', icon: SETTINGS_ICON, write: true };
  }
  if (/homepage|hero|feature cards/i.test(prompt)) {
    return { label: 'Design the homepage', hint: 'Content scope · plan then approve', icon: LAYOUT_ICON, write: true };
  }
  if (/post #\d+|title of post/i.test(prompt)) {
    return { label: 'Edit a post safely', hint: 'Content scope · snapshot before write', icon: WRITE_ICON, write: true };
  }
  return { label: 'Inspect this site', hint: 'Read-only · no approval needed', icon: INSPECT_ICON, write: false };
}

/**
 * Builds the four suggestion cards. Chat mode gets model-only prompts; the
 * other modes get prompts generated from the site's real scope/capability
 * graph. A write prompt shown in read-only mode says so explicitly instead of
 * pretending it will just work.
 */
export function buildComposerSuggestions(input: {
  mode: AgentMode;
  site?: ComposerSiteContext | null;
  siteLabel?: string;
}): ComposerSuggestion[] {
  if (input.mode === 'chat') return CHAT_SUGGESTIONS;

  const site = input.site ?? {};
  const graph = evaluateSiteCapabilities({ scopes: site.scopes, capabilities: site.capabilities });
  const label = (input.siteLabel ?? site.name ?? 'your site').trim() || 'your site';
  const prompts = suggestPromptsForSite({
    name: site.name,
    scopes: site.scopes,
    capabilities: site.capabilities,
  });

  const inspect: ComposerSuggestion = {
    id: 'inspect',
    label: 'Inspect this site',
    hint: graph.hasManifest
      ? `Read-only · capability manifest from ${label}`
      : 'Read-only · capability manifest not scanned yet',
    prompt: `Inspect ${label} and report the WordPress version, active theme and available tools.`,
    icon: INSPECT_ICON,
    readOnly: true,
  };

  const cards = prompts.map<ComposerSuggestion>((prompt, index) => {
    const meta = classifyPrompt(prompt);
    const hint =
      meta.write && input.mode !== 'writes'
        ? 'Switch to Writes and approve a plan first'
        : graph.hasManifest
          ? meta.hint
          : `${meta.hint} · manifest pending`;
    return {
      id: `cap-${index}`,
      label: meta.label,
      hint,
      prompt,
      icon: meta.icon,
      readOnly: !meta.write,
    };
  });

  return [inspect, ...cards].slice(0, 4);
}

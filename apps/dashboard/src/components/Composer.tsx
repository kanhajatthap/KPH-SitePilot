'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { AgentMode, AvailableSite } from '../lib/types';
import {
  COMPOSER_SHORTCUT_HINT,
  MAX_ATTACHMENTS,
  formatAttachmentContext,
  shouldSubmitOnKeyDown,
  validateAttachmentFile,
  type ComposerAttachment,
  type ComposerSiteContext,
  type ComposerSuggestion,
} from '../lib/composer';

export const MODE_META: Record<AgentMode, { label: string; icon: string; hint: string }> = {
  agent: {
    label: 'Agent',
    icon: 'M12 3l7 3v5c0 4.4-3 8.4-7 9.5C8 19.4 5 15.4 5 11V6l7-3z',
    hint: 'Read-only inspection and planning',
  },
  writes: {
    label: 'Writes',
    icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
    hint: 'Stage changes with human approval',
  },
  chat: {
    label: 'Chat',
    icon: 'M21 12a8 8 0 01-8 8H5l-2 2V12a8 8 0 018-8h2a8 8 0 018 8z',
    hint: 'Direct model conversation, no tools',
  },
};

const TEXT_ACCEPT = '.txt,.md,.markdown,.json,.csv,.log,.html,.css,.xml,.yaml,.yml';

function Icon({ d, className = 'h-4 w-4' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Receives the final prompt, including any locally-read attachment context. */
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  onStop: () => void;
  agentMode: AgentMode;
  onAgentModeChange: (mode: AgentMode) => void;
  selectedSite: string;
  onSelectSite: (site: string) => void;
  availableSites: AvailableSite[];
  siteContext?: ComposerSiteContext | null;
  suggestions: ComposerSuggestion[];
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Composer v2 (E9-04): capability-aware suggestions, a real site pill, local
 * text attachments, ⌘/Ctrl+Enter, a Stop control and honest mode hints.
 * Attachments are read in the browser and appended to the prompt as text —
 * there is no upload endpoint, and the UI says exactly that.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  isLoading,
  onStop,
  agentMode,
  onAgentModeChange,
  selectedSite,
  onSelectSite,
  availableSites,
  siteContext,
  suggestions,
  inputRef,
}: ComposerProps) {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef?.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value, inputRef]);

  const siteLabel = selectedSite.replace(/https?:\/\//, '').replace(/\/$/, '');
  const siteStatus = siteContext?.status ?? 'unknown';
  const siteOnline = siteStatus === 'active';

  const submit = () => {
    const prompt = value.trim();
    if (!prompt && attachments.length === 0) return;
    onSubmit(formatAttachmentContext(attachments, prompt));
    setAttachments([]);
    setAttachmentError(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const native = event.nativeEvent as KeyboardEvent;
    if (
      !shouldSubmitOnKeyDown({
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        isComposing: native.isComposing,
      })
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setAttachmentBusy(true);
    setAttachmentError(null);
    const next: ComposerAttachment[] = [...attachments];
    let firstError: string | null = null;

    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_ATTACHMENTS) {
        firstError = firstError ?? `Up to ${MAX_ATTACHMENTS} text files per prompt.`;
        break;
      }
      const check = validateAttachmentFile({ name: file.name, size: file.size });
      if (!check.ok) {
        firstError = firstError ?? check.reason;
        continue;
      }
      const text = await file.text().catch(() => null);
      if (text === null) {
        firstError = firstError ?? `${file.name} could not be read in this browser.`;
        continue;
      }
      if (next.some((item) => item.name === file.name)) continue;
      next.push({ name: file.name, size: file.size, text });
    }

    setAttachments(next);
    setAttachmentError(firstError);
    setAttachmentBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pickSuggestion = (prompt: string) => {
    onChange(prompt);
    inputRef?.current?.focus();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="shrink-0 border-t border-line bg-white/70 p-3 sm:p-4"
    >
      {value.trim() === '' && !isLoading && suggestions.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Suggested prompts">
          <span className="text-[9.5px] font-medium uppercase tracking-wide text-ink-muted">Try</span>
          {suggestions.slice(0, 2).map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => pickSuggestion(suggestion.prompt)}
              title={suggestion.hint}
              className="max-w-[190px] truncate rounded-lg border border-line bg-white px-2 py-1 text-[10px] text-ink-soft transition hover:border-pink-300 hover:text-ink"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Attached files">
          {attachments.map((attachment) => (
            <span
              key={attachment.name}
              className="flex max-w-[200px] items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-[10px] text-ink-soft"
            >
              <Icon d="M21.4 11.1L12.3 20.2a5 5 0 01-7.1-7.1l9.2-9.2a3.3 3.3 0 014.7 4.7l-9.2 9.2a1.7 1.7 0 01-2.4-2.4l8.5-8.5" className="h-3 w-3 shrink-0" />
              <span className="truncate" title={`${attachment.name} · ${Math.round(attachment.size / 1024)} KB`}>
                {attachment.name}
              </span>
              <button
                type="button"
                onClick={() => setAttachments((current) => current.filter((item) => item.name !== attachment.name))}
                aria-label={`Remove ${attachment.name}`}
                className="ml-0.5 text-ink-muted hover:text-rose-600"
              >
                ×
              </button>
            </span>
          ))}
          <span className="text-[9px] text-ink-muted">sent as text — nothing is uploaded</span>
        </div>
      ) : null}

      {attachmentError ? (
        <p role="alert" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-800">
          {attachmentError}
        </p>
      ) : null}

      <div className="composer-shell rounded-2xl">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            agentMode === 'writes'
              ? `Describe the change to stage on ${siteLabel}…`
              : agentMode === 'agent'
                ? `Ask anything about ${siteLabel}…`
                : 'Ask the model anything…'
          }
          aria-label="Agent prompt"
          aria-keyshortcuts="Enter Meta+Enter Control+Enter"
          className="block max-h-[168px] min-h-[54px] w-full resize-none bg-transparent px-4 pt-3.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-muted focus:outline-none"
        />

        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-lg bg-paper p-0.5" role="group" aria-label="Agent mode">
              {(Object.keys(MODE_META) as AgentMode[]).map((mode) => {
                const meta = MODE_META[mode];
                const active = agentMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onAgentModeChange(mode)}
                    title={meta.hint}
                    aria-pressed={active}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition ${
                      active ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Icon d={meta.icon} className="h-3 w-3" />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div
              className="flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-white px-1.5 py-1"
              title={`${selectedSite}${siteContext ? ` · ${siteStatus}` : ''}`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${siteOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}
                aria-hidden="true"
              />
              <select
                value={selectedSite}
                onChange={(event) => onSelectSite(event.target.value)}
                aria-label="Target site"
                className="max-w-[120px] cursor-pointer truncate bg-transparent text-[10px] font-medium text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/30"
              >
                {availableSites.map((site) => (
                  <option key={site.id} value={site.url}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={TEXT_ACCEPT}
              className="hidden"
              aria-label="Attach text files"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <button
              type="button"
              disabled={attachmentBusy || attachments.length >= MAX_ATTACHMENTS}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-ink-muted transition hover:text-ink disabled:opacity-40"
              aria-label="Attach text files"
              title="Attach small text files (sent with the prompt)"
            >
              <Icon d="M21.4 11.1L12.3 20.2a5 5 0 01-7.1-7.1l9.2-9.2a3.3 3.3 0 014.7 4.7l-9.2 9.2a1.7 1.7 0 01-2.4-2.4l8.5-8.5" className="h-3.5 w-3.5" />
            </button>

            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                aria-label="Stop task"
                title="Stop"
              >
                <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!value.trim() && attachments.length === 0}
              className="brand-gradient focus-ring flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-sm transition hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Send prompt"
              title="Send (Enter or ⌘/Ctrl + ↵)"
            >
              <Icon d="M12 19V5M6 11l6-6 6 6" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[9.5px] text-ink-muted">
        <span>{COMPOSER_SHORTCUT_HINT}</span>
        <span className="font-medium">
          {agentMode === 'writes' ? 'Approval required' : agentMode === 'agent' ? 'Read-only' : 'No tools'}
        </span>
      </div>
    </form>
  );
}

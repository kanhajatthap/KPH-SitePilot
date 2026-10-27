'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  AgentMode,
  ChatMessage,
  DraftProposal,
  BuilderProposal,
  AvailableSite,
  AgentExecutionTask,
  QueuedTask,
  PublishProposalResponse,
} from '../lib/types';
import { PersistedChatConversation } from '@wp-agent/contracts';

interface ChatPanelProps {
  messages: ChatMessage[];
  chatHistoryLoading?: boolean;
  chatHistoryReady?: boolean;
  chatHistoryError?: string;
  onRetryChatHistory?: () => void;
  onContinueWithoutChatHistory?: () => void;
  isLoading: boolean;
  activeTask?: AgentExecutionTask;
  queuedTasks: QueuedTask[];
  onSendMessage: (prompt: string) => void;
  onClearChat: () => void;
  conversations: PersistedChatConversation[];
  activeConversationId: string | null;
  onResumeConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onDeleteAllConversations: () => void;
  selectedSite: string;
  onSelectSite: (site: string) => void;
  availableSites: AvailableSite[];
  agentMode: AgentMode;
  onAgentModeChange: (mode: AgentMode) => void;
  onStopTask: () => void;
  onRemoveQueuedTask: (id: string) => void;
  onApproveProposal?: (proposal: DraftProposal) => void;
  onRejectProposal?: (proposal: DraftProposal) => void;
  onApproveBuilderProposal?: (proposal: BuilderProposal) => void;
  onRejectBuilderProposal?: (proposal: BuilderProposal) => void;
  onPreviewDraft?: (postId: number) => void;
  onStartRevise?: (postId: number, currentTitle: string, revisionPrompt: string) => void;
  onPublishNow?: (postId: number) => void;
  onKeepAsDraft?: (postId: number) => void;
  activePublishProposal?: PublishProposalResponse | null;
  onApprovePublish?: (proposal: PublishProposalResponse) => void;
  onCancelPublish?: () => void;
  isPublishing?: boolean;
}

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

/** Minimal inline formatter: **bold** and `code` only. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${index}`} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(
        <code key={`${keyPrefix}-c-${index}`} className="rounded bg-paper-deep px-1 py-0.5 font-mono text-[11px] text-ink">
          {token.slice(1, -1)}
        </code>
      );
    }
    cursor = pattern.lastIndex;
    index += 1;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/** Lightweight markdown for assistant answers: paragraphs, bullets, headings, bold, code. */
function RichText({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flush = () => {
    if (!list.length) return;
    const items = list.map((item, index) => (
      <li key={`li-${blocks.length}-${index}`} className="leading-6">
        {renderInline(item, `li-${blocks.length}-${index}`)}
      </li>
    ));
    blocks.push(
      listType === 'ol' ? (
        <ol key={`ol-${blocks.length}`} className="ml-4 list-decimal space-y-0.5 text-[13px] text-ink-soft">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-0.5 text-[13px] text-ink-soft">
          {items}
        </ul>
      )
    );
    list = [];
    listType = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (/^[-*]\s+/.test(trimmed)) {
      if (listType !== 'ul') {
        flush();
        listType = 'ul';
      }
      list.push(trimmed.replace(/^[-*]\s+/, ''));
      return;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== 'ol') {
        flush();
        listType = 'ol';
      }
      list.push(trimmed.replace(/^\d+\.\s+/, ''));
      return;
    }

    flush();

    if (!trimmed) {
      blocks.push(<div key={`sp-${index}`} className="h-1.5" />);
      return;
    }

    if (/^#{1,4}\s+/.test(trimmed)) {
      blocks.push(
        <p key={`h-${index}`} className="pt-1 text-[13px] font-semibold text-ink">
          {renderInline(trimmed.replace(/^#{1,4}\s+/, ''), `h-${index}`)}
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`p-${index}`} className="text-[13px] leading-6 text-ink-soft">
        {renderInline(line, `p-${index}`)}
      </p>
    );
  });

  flush();

  return <div className="space-y-1">{blocks}</div>;
}

const MODE_META: Record<AgentMode, { label: string; icon: string; hint: string }> = {
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

function ToolActivityCard({
  tool,
  open,
  onToggle,
}: {
  tool: NonNullable<ChatMessage['executedTools']>[number];
  open: boolean;
  onToggle: () => void;
}) {
  const denied = tool.status === 'denied';
  const failed = tool.status === 'error';
  const tone = denied
    ? 'border-rose-200 bg-rose-50/70 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200'
    : failed
    ? 'border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
    : 'border-line bg-white text-ink-soft dark:border-line dark:bg-card dark:text-ink-muted';

  return (
    <div className={`overflow-hidden rounded-xl border text-[11px] ${tone}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-black/[0.02]"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              denied ? 'bg-rose-500' : failed ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
          <span className="truncate font-mono text-[10px] font-medium">{tool.name}</span>
          <span className="rounded-md bg-paper-deep px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-muted">
            {denied ? 'blocked' : failed ? 'failed' : 'read'}
          </span>
        </span>
        <Icon d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} className="h-3 w-3 shrink-0 text-ink-muted" />
      </button>
      {open ? (
        <div className="space-y-1.5 border-t border-line/80 bg-paper/70 px-3 py-2 font-mono text-[10px] leading-relaxed">
          {tool.arguments ? (
            <div>
              <span className="text-ink-muted">args </span>
              <span className="break-all text-ink-soft">{JSON.stringify(tool.arguments)}</span>
            </div>
          ) : null}
          {tool.error ? (
            <div className="text-rose-600">
              {tool.error.code}: {tool.error.message}
            </div>
          ) : null}
          {tool.output !== undefined && !tool.error ? (
            <div className="max-h-40 overflow-auto text-emerald-700">
              {JSON.stringify(tool.output, null, 1)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DraftProposalCard({
  proposal,
  busy,
  onApprove,
  onReject,
}: {
  proposal: DraftProposal;
  busy: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
          <Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" className="h-3.5 w-3.5" />
          Draft proposal
        </span>
        <span className="rounded-md border border-amber-200 bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
          Not saved
        </span>
      </div>
      <div className="mt-2 text-[13px] font-medium text-ink">{proposal.post.title}</div>
      {proposal.post.excerpt ? (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{proposal.post.excerpt}</p>
      ) : null}
      {proposal.duplicateWarning ? (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] text-rose-700">
          {proposal.duplicateWarning}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-amber-200/70 pt-2.5">
        <span className="truncate font-mono text-[9px] text-ink-muted">
          {proposal.targetSite.replace(/https?:\/\//, '')}
        </span>
        {proposal.isApplied ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700">
            <Icon d="M20 6L9 17l-5-5" className="h-3 w-3" /> Saved
          </span>
        ) : (
          <div className="flex items-center gap-2">
            {onReject ? (
              <button
                type="button"
                onClick={onReject}
                disabled={busy}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink-muted transition hover:bg-white hover:text-ink disabled:opacity-50"
              >
                Reject
              </button>
            ) : null}
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              {busy ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" /> : null}
              Approve draft
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BuilderProposalCard({
  proposal,
  busy,
  onApprove,
  onReject,
}: {
  proposal: BuilderProposal;
  busy: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const destructive =
    (proposal.operationType === 'plugin' && proposal.pluginAction === 'delete') ||
    proposal.operationType === 'page_trash';
  const destructiveLabel = proposal.operationType === 'page_trash'
    ? 'Approve & Move to Trash'
    : 'Approve & Uninstall';
  const approvalLabel = proposal.operationType === 'page_restore'
    ? 'Approve restore'
    : destructive
      ? destructiveLabel
      : 'Approve change';

  return (
    <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold capitalize text-violet-800">
          <Icon d="M4 5h16v14H4z M4 9h16" className="h-3.5 w-3.5" />
          {proposal.builderType} proposal
        </span>
        <span className="rounded-md border border-violet-200 bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700">
          Staged
        </span>
      </div>
      <div className="mt-2 text-[13px] font-medium text-ink">{proposal.title}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{proposal.summary}</p>
      {proposal.unsupportedFeatures.length > 0 ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">
          Preserved verbatim: {proposal.unsupportedFeatures.join(', ')}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-violet-200/70 pt-2.5">
        <span className="truncate font-mono text-[9px] text-ink-muted">
          {proposal.targetSite.replace(/https?:\/\//, '')}
        </span>
        {proposal.isApplied ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700">
            <Icon d="M20 6L9 17l-5-5" className="h-3 w-3" /> Saved
          </span>
        ) : (
          <div className="flex items-center gap-2">
            {onReject ? (
              <button
                type="button"
                onClick={onReject}
                disabled={busy}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink-muted transition hover:bg-white hover:text-ink disabled:opacity-50"
              >
                Reject
              </button>
            ) : null}
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition disabled:opacity-50 ${
                destructive
                  ? 'bg-rose-700 hover:bg-rose-800'
                  : 'bg-ink hover:bg-stone-800'
              }`}
            >
              {busy ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" /> : null}
              {approvalLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPanel({
  messages,
  chatHistoryLoading = false,
  chatHistoryReady = true,
  chatHistoryError,
  onRetryChatHistory,
  onContinueWithoutChatHistory,
  isLoading,
  activeTask,
  queuedTasks,
  onSendMessage,
  onClearChat,
  conversations,
  activeConversationId,
  onResumeConversation,
  onDeleteConversation,
  onDeleteAllConversations,
  selectedSite,
  onSelectSite,
  availableSites,
  agentMode,
  onAgentModeChange,
  onStopTask,
  onRemoveQueuedTask,
  onApproveProposal,
  onRejectProposal,
  onApproveBuilderProposal,
  onRejectBuilderProposal,
  onPreviewDraft,
  onStartRevise,
  onPublishNow,
  onKeepAsDraft,
  activePublishProposal,
  onApprovePublish,
  onCancelPublish,
  isPublishing,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [approvingPlanId, setApprovingPlanId] = useState<string | null>(null);
  const [revisionState, setRevisionState] = useState<{
    postId: number;
    currentTitle: string;
    prompt: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading, activeTask]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  const siteLabel = selectedSite.replace(/https?:\/\//, '').replace(/\/$/, '');

  const contextualSuggestion = useMemo(() => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed.length < 5) return null;

    const isMutation =
      /(?:create|draft|add|make|publish|write|generate|propose)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:wordpress\s+|wp\s+)?(?:post|page|article|draft|hero section|product)/i.test(trimmed) ||
      /(?:post|page|draft)\s+titled/i.test(trimmed) ||
      /save (?:as )?draft/i.test(trimmed) ||
      /elementor|gutenberg|blocks|acf|woocommerce/i.test(trimmed);

    const isInspect =
      /inspect|site health|wp version|installed plugins|read page|get page|check (?:the )?(?:site|status)/i.test(trimmed);

    if (isMutation && agentMode !== 'writes') {
      return {
        targetMode: 'writes' as AgentMode,
        label: 'Switch to Writes',
        reason: 'This request changes WordPress content.',
      };
    }
    if (isInspect && agentMode === 'chat') {
      return {
        targetMode: 'agent' as AgentMode,
        label: 'Switch to Agent',
        reason: 'This request needs read-only site tools.',
      };
    }
    return null;
  }, [input, agentMode]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!chatHistoryReady || !input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  const toggleTool = (key: string) => {
    setExpandedTools((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const runApproval = async (id: string, action?: () => Promise<void> | void) => {
    setApprovingPlanId(id);
    try {
      await action?.();
    } finally {
      setApprovingPlanId(null);
    }
  };

  const suggestions = [
    {
      label: 'Build a landing page',
      hint: 'Hero, products, testimonials, contact',
      icon: 'M3 5h18v14H3z M3 9h18 M7 13h4',
      prompt:
        'Create a modern landing page for a local ceramics studio with a hero, product collection, testimonials and contact section. Show me a preview before saving anything.',
    },
    {
      label: 'Draft a blog post',
      hint: 'SEO summary, duplicate check, approval',
      icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
      prompt:
        'Draft a WordPress post titled "How to Make a Simple Website Using AI" with beginner-friendly steps. Check for duplicates first and show me the content for approval.',
    },
    {
      label: 'Inspect my site',
      hint: 'WP version, theme, active builders',
      icon: 'M12 21a9 9 0 100-18 9 9 0 000 18z M3.5 9h17M3.5 15h17',
      prompt: `Inspect ${siteLabel} and report the WordPress version, active theme and available page builders.`,
    },
    {
      label: 'Improve this page',
      hint: 'Rewrite copy, then stage a preview',
      icon: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
      prompt:
        'Improve the hero section copy and layout of the current page. Keep the brand tone, then show a staged preview before saving.',
    },
  ];

  const statusLabel =
    activeTask?.status === 'planning'
      ? 'Planning'
      : activeTask?.status === 'running'
      ? 'Working'
      : activeTask?.status === 'waiting_for_approval'
      ? 'Waiting for approval'
      : activeTask?.status === 'completed'
      ? 'Completed'
      : activeTask?.status === 'cancelled'
      ? 'Stopped'
      : 'Thinking';

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-line bg-white/60 md:w-[420px] lg:w-[460px]">
      {/* Header */}
      <div className="relative flex h-[52px] shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="brand-gradient flex h-6 w-6 items-center justify-center rounded-lg text-white">
            <Icon d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[13px] font-semibold tracking-tight">SitePilot Agent</span>
          <span className="hidden items-center gap-1 rounded-full border border-line bg-paper px-1.5 py-0.5 text-[9px] font-medium text-ink-muted sm:flex">
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            autonomous
          </span>
        </div>
        <div className="flex items-center gap-1">
          {conversations.length > 0 ? (
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              aria-expanded={historyOpen}
              className="focus-ring rounded-lg px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-paper-deep hover:text-ink"
            >
              History ({conversations.length})
            </button>
          ) : null}
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={onClearChat}
              disabled={isLoading || !chatHistoryReady}
              className="focus-ring rounded-lg px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-paper-deep hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              title="Save this conversation and start a new one"
            >
              New chat
            </button>
          ) : null}
        </div>
        {historyOpen ? (
          <div
            role="dialog"
            aria-label="Conversation history"
            className="absolute right-3 top-full z-30 mt-1 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-xs font-semibold text-ink">Recent conversations</span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded px-1.5 py-0.5 text-xs text-ink-muted hover:bg-paper"
                aria-label="Close conversation history"
              >
                Close
              </button>
            </div>
            <ul className="max-h-72 overflow-y-auto p-1.5">
              {[...conversations].reverse().map((conversation) => (
                <li key={conversation.id} className="flex items-center gap-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      onResumeConversation(conversation.id);
                      setHistoryOpen(false);
                    }}
                    disabled={isLoading}
                    className={`min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left hover:bg-paper disabled:opacity-50 ${
                      activeConversationId === conversation.id ? 'bg-paper' : ''
                    }`}
                  >
                    <span className="block truncate text-xs font-medium text-ink">
                      {conversation.title}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-ink-muted">
                      {new Date(conversation.updatedAt).toLocaleString()} · {conversation.messages.length} messages
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteConversation(conversation.id)}
                    disabled={isLoading}
                    className="mr-1 rounded-md px-2 py-1 text-[10px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    aria-label={`Delete ${conversation.title}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-line px-3 py-2">
              <span className="text-[10px] text-ink-muted">Keeps the latest 50 conversations</span>
              <button
                type="button"
                onClick={onDeleteAllConversations}
                disabled={isLoading || conversations.length === 0}
                className="rounded px-1.5 py-1 text-[10px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Clear all
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {chatHistoryLoading || chatHistoryError ? (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center justify-between gap-2 border-b px-4 py-2 text-[10px] ${
            chatHistoryError
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-line bg-paper text-ink-muted'
          }`}
        >
          <span>
            {chatHistoryError
              ? `Chat history sync issue: ${chatHistoryError}`
              : 'Restoring saved chat history…'}
          </span>
          {chatHistoryError && onRetryChatHistory ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onRetryChatHistory}
                className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium hover:bg-amber-100"
              >
                Retry
              </button>
              {!chatHistoryReady && onContinueWithoutChatHistory ? (
                <button
                  type="button"
                  onClick={onContinueWithoutChatHistory}
                  className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium hover:bg-amber-100"
                >
                  Continue temporarily
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-md flex-col justify-center py-6">
            <div className="animate-fade-up">
              <div className="brand-gradient mb-4 flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg shadow-pink-500/20">
                <Icon d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" className="h-5 w-5" />
              </div>
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
                What should we build?
              </h1>
              <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
                Describe a page, a post, or a change. I&apos;ll inspect your site, show a plan, and stage
                everything for your approval before anything is saved.
              </p>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {suggestions.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setInput(item.prompt);
                    textareaRef.current?.focus();
                  }}
                  className="group rounded-xl border border-line bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/30"
                >
                  <span className="flex items-center gap-2 text-[12px] font-medium text-ink">
                    <Icon d={item.icon} className="h-3.5 w-3.5 text-pink-500" />
                    {item.label}
                  </span>
                  <span className="mt-1 block text-[10.5px] leading-relaxed text-ink-muted">{item.hint}</span>
                </button>
              ))}
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-[10px] text-ink-muted">
              <Icon d="M12 3l7 3v5c0 4.4-3 8.4-7 9.5C8 19.4 5 15.4 5 11V6l7-3z" className="h-3 w-3 text-emerald-600" />
              Read-only by default. Writes always require your approval.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`animate-fade-up flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className={`flex w-full gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser ? (
                      <span className="brand-gradient mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white">
                        <Icon d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" className="h-3.5 w-3.5" />
                      </span>
                    ) : null}

                    <div className={`min-w-0 ${isUser ? 'max-w-[86%]' : 'max-w-[calc(100%-2.4rem)] flex-1'}`}>
                      {!isUser && msg.executedTools?.length ? (
                        <div className="mb-2 space-y-1.5">
                          {msg.executedTools.map((tool, index) => {
                            const key = `${msg.id}_tool_${index}`;
                            return (
                              <ToolActivityCard
                                key={key}
                                tool={tool}
                                open={Boolean(expandedTools[key])}
                                onToggle={() => toggleTool(key)}
                              />
                            );
                          })}
                        </div>
                      ) : null}

                      <div
                        className={
                          isUser
                            ? 'rounded-2xl rounded-br-md bg-[#2a2a26] px-3.5 py-2.5 text-[13px] leading-relaxed text-ink'
                            : 'text-[13px] leading-6 text-ink-soft'
                        }
                      >
                        {isUser ? (
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                        ) : (
                          <RichText content={msg.content} />
                        )}

                        {msg.proposal ? (
                          <DraftProposalCard
                            proposal={msg.proposal}
                            busy={approvingPlanId === msg.proposal.planId}
                            onApprove={
                              onApproveProposal
                                ? () =>
                                    runApproval(msg.proposal!.planId, () => onApproveProposal(msg.proposal!))
                                : undefined
                            }
                            onReject={
                              onRejectProposal ? () => onRejectProposal(msg.proposal!) : undefined
                            }
                          />
                        ) : null}

                        {msg.builderProposal ? (
                          <BuilderProposalCard
                            proposal={msg.builderProposal}
                            busy={approvingPlanId === msg.builderProposal.planId}
                            onApprove={
                              onApproveBuilderProposal
                                ? () =>
                                    runApproval(msg.builderProposal!.planId, () =>
                                      onApproveBuilderProposal(msg.builderProposal!)
                                    )
                                : undefined
                            }
                            onReject={
                              onRejectBuilderProposal
                                ? () => onRejectBuilderProposal(msg.builderProposal!)
                                : undefined
                            }
                          />
                        ) : null}

                        {msg.appliedPost ? (
                          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
                                  <Icon d="M20 6L9 17l-5-5" className="h-4 w-4" />
                                </span>
                                <div>
                                  <div className="text-[12px] font-semibold text-emerald-900">
                                    {msg.appliedPost.status === 'publish' ? 'Published live' : 'Draft saved'}
                                  </div>
                                  <div className="text-[10px] text-emerald-700/80">
                                    Verified on {siteLabel}
                                  </div>
                                </div>
                              </div>
                              <span className="rounded-md border border-emerald-200 bg-white/70 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-700">
                                #{msg.appliedPost.id}
                              </span>
                            </div>

                            <div className="mt-2.5 rounded-xl border border-emerald-200/70 bg-white/70 p-2.5">
                              <div className="truncate text-[12px] font-medium text-ink">
                                {msg.appliedPost.title}
                              </div>
                              <a
                                href={msg.appliedPost.editLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:underline"
                              >
                                Open in WP Admin
                                <Icon d="M7 17L17 7M9 7h8v8" className="h-3 w-3" />
                              </a>
                            </div>

                            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => onPreviewDraft?.(msg.appliedPost!.id)}
                                className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5 text-[10.5px] font-medium text-ink-soft transition hover:bg-paper-deep"
                              >
                                <Icon d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" className="h-3 w-3" />
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setRevisionState({
                                    postId: msg.appliedPost!.id,
                                    currentTitle: msg.appliedPost!.title,
                                    prompt: '',
                                  })
                                }
                                className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5 text-[10.5px] font-medium text-ink-soft transition hover:bg-paper-deep"
                              >
                                <Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" className="h-3 w-3" />
                                Revise
                              </button>
                              {msg.appliedPost.status !== 'publish' ? (
                                <button
                                  type="button"
                                  onClick={() => onPublishNow?.(msg.appliedPost!.id)}
                                  className="flex items-center justify-center gap-1.5 rounded-lg bg-ink px-2 py-1.5 text-[10.5px] font-semibold text-white transition hover:bg-stone-800"
                                >
                                  <Icon d="M12 19V5M6 11l6-6 6 6" className="h-3 w-3" />
                                  Publish
                                </button>
                              ) : (
                                <span className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-100/60 px-2 py-1.5 text-[10.5px] font-medium text-emerald-700">
                                  Live
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => onKeepAsDraft?.(msg.appliedPost!.id)}
                                className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5 text-[10.5px] font-medium text-ink-soft transition hover:bg-paper-deep"
                              >
                                <Icon d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z M7 3v6h9" className="h-3 w-3" />
                                Keep draft
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {msg.error ? (
                          <div className="mt-2.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-[11px] text-rose-700">
                            <div className="flex items-start gap-1.5 font-medium">
                              <Icon d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{msg.error}</span>
                            </div>
                            {/credentials|Application Password|401/i.test(msg.error) ? (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-[10px] font-medium text-rose-600">
                                  How to connect WordPress
                                </summary>
                                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[10px] leading-relaxed text-rose-700/90">
                                  <li>Open WP Admin for {siteLabel}.</li>
                                  <li>Go to Users → Profile → Application Passwords.</li>
                                  <li>Create one named “KPH-SitePilot”.</li>
                                  <li>Add it to the server environment as WP_USERNAME and WP_APPLICATION_PASSWORD.</li>
                                </ol>
                                <p className="mt-1.5 text-[10px] italic text-rose-600/80">
                                  Never paste credentials in chat. The agent reads them server-side only.
                                </p>
                              </details>
                            ) : /ECONNREFUSED|ENOTFOUND|fetch failed|Failed to fetch|Network|timeout|API server/i.test(
                                msg.error
                              ) ? (
                              <p className="mt-1 pl-5 text-[10px] text-rose-600/80">
                                Check that the LocalWP site is running and the API is up on port 3001.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <span className={`mt-1 px-1 text-[9px] text-ink-muted ${isUser ? 'mr-1' : 'ml-9'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Thinking timeline */}
        {activeTask ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
              <span className="flex items-center gap-2 text-[11px] font-semibold text-ink">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pink-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-pink-500" />
                </span>
                {statusLabel}
                <span className="rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink-muted">
                  {activeTask.mode}
                </span>
              </span>
              {activeTask.status === 'running' || activeTask.status === 'planning' ? (
                <button
                  type="button"
                  onClick={onStopTask}
                  className="rounded-lg px-2 py-1 text-[10px] font-medium text-ink-muted transition hover:bg-rose-50 hover:text-rose-600"
                >
                  Stop
                </button>
              ) : null}
            </div>
            {activeTask.steps?.length ? (
              <div className="space-y-1 px-3 py-2.5">
                {activeTask.steps.map((step, index) => (
                  <div key={step.id || index} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex min-w-0 items-center gap-2">
                      {step.status === 'completed' ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <Icon d="M20 6L9 17l-5-5" className="h-2.5 w-2.5" />
                        </span>
                      ) : step.status === 'running' ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
                      ) : step.status === 'failed' ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                          <Icon d="M6 6l12 12M18 6L6 18" className="h-2.5 w-2.5" />
                        </span>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                      )}
                      <span
                        className={`truncate ${
                          step.status === 'running'
                            ? 'font-medium text-ink'
                            : step.status === 'completed'
                            ? 'text-ink-soft'
                            : 'text-ink-muted'
                        }`}
                      >
                        {step.name}
                      </span>
                    </span>
                    {step.toolName ? (
                      <span className="shrink-0 rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[9px] text-ink-muted">
                        {step.toolName}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Loading */}
        {isLoading && !activeTask ? (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-line bg-white px-3 py-2.5">
            <span className="shimmer-text text-[12px] font-medium">
              {agentMode === 'writes'
                ? 'Designing the change…'
                : agentMode === 'agent'
                ? 'Checking your site…'
                : 'Thinking…'}
            </span>
            <button
              type="button"
              onClick={onStopTask}
              className="rounded-lg px-2 py-1 text-[10px] font-medium text-ink-muted transition hover:bg-rose-50 hover:text-rose-600"
            >
              Stop
            </button>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {/* Queue */}
      {queuedTasks.length > 0 ? (
        <div className="flex items-center justify-between gap-2 border-t border-line bg-paper px-4 py-2 text-[10px]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-md bg-ink px-1.5 py-0.5 font-semibold text-white">
              {queuedTasks.length} queued
            </span>
            <span className="truncate text-ink-muted">{queuedTasks[0].prompt}</span>
          </span>
          <button
            type="button"
            onClick={() => onRemoveQueuedTask(queuedTasks[0].id)}
            className="shrink-0 font-medium text-ink-muted transition hover:text-rose-600"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* Mode nudge */}
      {contextualSuggestion ? (
        <div className="flex items-center justify-between gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2">
          <span className="truncate text-[10.5px] text-amber-800">{contextualSuggestion.reason}</span>
          <button
            type="button"
            onClick={() => onAgentModeChange(contextualSuggestion.targetMode)}
            className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-amber-500"
          >
            {contextualSuggestion.label}
          </button>
        </div>
      ) : null}

      {/* Composer */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-line bg-white/70 p-3 sm:p-4">
        <div className="composer-shell rounded-2xl">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!chatHistoryReady}
            rows={1}
            placeholder={
              !chatHistoryReady
                ? 'Waiting for chat history…'
                : agentMode === 'writes'
                ? `Describe the change to stage on ${siteLabel}…`
                : agentMode === 'agent'
                ? `Ask anything about ${siteLabel}…`
                : 'Ask the model anything…'
            }
            aria-label="Agent prompt"
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

              <select
                value={selectedSite}
                onChange={(event) => onSelectSite(event.target.value)}
                aria-label="Target site"
                className="max-w-[120px] cursor-pointer truncate rounded-lg bg-transparent px-1.5 py-1 text-[10px] font-medium text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/30"
              >
                {availableSites.map((site) => (
                  <option key={site.id} value={site.url}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStopTask}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                  aria-label="Stop task"
                  title="Stop"
                >
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
                </button>
              ) : null}
              <button
                type="submit"
                disabled={!chatHistoryReady || !input.trim()}
                className="brand-gradient focus-ring flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-sm transition hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Send prompt"
                title="Send (Enter)"
              >
                <Icon d="M12 19V5M6 11l6-6 6 6" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between px-1 text-[9.5px] text-ink-muted">
          <span>
            <kbd className="rounded border border-line bg-white px-1 py-0.5 font-sans">Enter</kbd> to send ·{' '}
            <kbd className="rounded border border-line bg-white px-1 py-0.5 font-sans">Shift</kbd> + Enter for a new line
          </span>
          <span className="font-medium">
            {agentMode === 'writes' ? 'Approval required' : agentMode === 'agent' ? 'Read-only' : 'No tools'}
          </span>
        </div>
      </form>

      {/* Publish confirmation */}
      {activePublishProposal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-lg rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Icon d="M12 19V5M6 11l6-6 6 6" className="h-4 w-4 text-emerald-600" />
                Publish to WordPress
              </div>
              <button
                type="button"
                onClick={onCancelPublish}
                disabled={isPublishing}
                className="rounded-lg p-1 text-ink-muted transition hover:bg-paper-deep hover:text-ink disabled:opacity-50"
                aria-label="Close"
              >
                <Icon d="M6 6l12 12M18 6L6 18" className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
              This makes the post publicly visible on{' '}
              <strong className="font-semibold">{activePublishProposal.targetSite}</strong>. It moves from{' '}
              <span className="font-mono font-semibold">draft</span> to{' '}
              <span className="font-mono font-semibold">published</span>.
            </div>

            <div className="mt-3 space-y-1.5 rounded-xl border border-line bg-paper px-3 py-2.5 text-[11px]">
              <div>
                <span className="text-ink-muted">Title </span>
                <span className="font-medium text-ink">{activePublishProposal.post.title}</span>
              </div>
              <div>
                <span className="text-ink-muted">Post </span>
                <span className="font-mono font-semibold text-ink">#{activePublishProposal.post.id}</span>
              </div>
              <div className="truncate">
                <span className="text-ink-muted">Integrity </span>
                <span className="font-mono text-[9px] text-ink-muted">{activePublishProposal.integrityHash}</span>
              </div>
            </div>

            {/* Pre-flight Checklist */}
            {activePublishProposal.checklist ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink">Pre-flight Checklist</span>
                  <div className="flex items-center gap-2 text-[10px]">
                    {activePublishProposal.checklist.hasBlockingFailures ? (
                      <span className="font-semibold text-rose-600">Action Required (Blocking)</span>
                    ) : (
                      <span className="font-semibold text-emerald-600">All blocking checks passed</span>
                    )}
                    {activePublishProposal.checklist.warningCount > 0 ? (
                      <span className="text-amber-700">({activePublishProposal.checklist.warningCount} advisory {activePublishProposal.checklist.warningCount === 1 ? 'warning' : 'warnings'})</span>
                    ) : null}
                  </div>
                </div>

                <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-paper-deep/40 p-2.5 text-[11px]">
                  {activePublishProposal.checklist.items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-2 rounded-lg border p-2 transition ${
                        item.passed
                          ? 'border-line/70 bg-paper/60 text-ink'
                          : item.severity === 'blocking'
                          ? 'border-rose-200 bg-rose-50/70 text-rose-900'
                          : 'border-amber-200 bg-amber-50/70 text-amber-900'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {item.passed ? (
                          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                            ✓
                          </span>
                        ) : item.severity === 'blocking' ? (
                          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-700">
                            !
                          </span>
                        ) : (
                          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800">
                            i
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium">{item.label}</span>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider ${
                              item.passed
                                ? 'bg-emerald-100/80 text-emerald-800'
                                : item.severity === 'blocking'
                                ? 'bg-rose-200/80 text-rose-800'
                                : 'bg-amber-200/80 text-amber-800'
                            }`}
                          >
                            {item.passed ? 'PASS' : item.severity}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10px] opacity-80">{item.details || item.description}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {activePublishProposal.checklist.hasBlockingFailures ? (
                  <div className="rounded-lg bg-rose-50 p-2 text-[10.5px] font-medium text-rose-700">
                    Publishing is disabled until all blocking items are resolved.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={onCancelPublish}
                disabled={isPublishing}
                className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-ink-muted transition hover:bg-paper-deep hover:text-ink disabled:opacity-50"
              >
                Keep as draft
              </button>
              <button
                type="button"
                onClick={() => onApprovePublish?.(activePublishProposal)}
                disabled={isPublishing || Boolean(activePublishProposal.checklist?.hasBlockingFailures)}
                title={
                  activePublishProposal.checklist?.hasBlockingFailures
                    ? 'Resolve all blocking checklist failures before publishing'
                    : 'Publish live to WordPress'
                }
                className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPublishing ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                ) : (
                  <Icon d="M12 19V5M6 11l6-6 6 6" className="h-3 w-3" />
                )}
                Publish live
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Revision modal */}
      {revisionState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md rounded-2xl p-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" className="h-4 w-4 text-pink-500" />
                Revise post #{revisionState.postId}
              </div>
              <button
                type="button"
                onClick={() => setRevisionState(null)}
                className="rounded-lg p-1 text-ink-muted transition hover:bg-paper-deep hover:text-ink"
                aria-label="Close"
              >
                <Icon d="M6 6l12 12M18 6L6 18" className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-[11px] text-ink-muted">
              Current title <span className="font-medium text-ink">“{revisionState.currentTitle}”</span>
            </p>

            <label htmlFor="revision-prompt" className="mt-3 block text-[11px] font-medium text-ink-soft">
              What should change?
            </label>
            <textarea
              id="revision-prompt"
              rows={4}
              value={revisionState.prompt}
              onChange={(event) =>
                setRevisionState((prev) => (prev ? { ...prev, prompt: event.target.value } : null))
              }
              placeholder="Add a step-by-step section, tighten the intro, improve the conclusion…"
              className="mt-1 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-[12px] text-ink placeholder:text-ink-muted focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevisionState(null)}
                className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-ink-muted transition hover:bg-paper-deep hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!revisionState.prompt.trim()}
                onClick={() => {
                  const { postId, currentTitle, prompt } = revisionState;
                  setRevisionState(null);
                  onStartRevise?.(postId, currentTitle, prompt.trim());
                }}
                className="rounded-lg bg-ink px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-40"
              >
                Propose revision
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

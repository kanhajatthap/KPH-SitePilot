'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AgentMode,
  ChatMessage,
  DraftProposal,
  BuilderProposal,
  AvailableSite,
  AgentExecutionTask,
  QueuedTask,
  IntentDetectionResult,
  VerifiedResource,
  AppliedDraftPost,
  PublishProposalResponse,
} from '../lib/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  activeTask?: AgentExecutionTask;
  queuedTasks: QueuedTask[];
  onSendMessage: (prompt: string) => void;
  onClearChat: () => void;
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

export function ChatPanel({
  messages,
  isLoading,
  activeTask,
  queuedTasks,
  onSendMessage,
  onClearChat,
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
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [showActivityDetails, setShowActivityDetails] = useState(true);
  const [approvingPlanId, setApprovingPlanId] = useState<string | null>(null);
  const [revisionState, setRevisionState] = useState<{
    open: boolean;
    postId: number;
    currentTitle: string;
    prompt: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, activeTask]);

  // Client-side quick intent detection for proactive mode suggestion pills
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
        label: 'Switch to Controlled Writes',
        reason: 'This request involves creating or updating WordPress content.',
      };
    }
    if (isInspect && agentMode === 'chat') {
      return {
        targetMode: 'agent' as AgentMode,
        label: 'Switch to WP Agent',
        reason: 'This request asks to inspect or query the WordPress site.',
      };
    }
    return null;
  }, [input, agentMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleToolExpand = (toolId: string) => {
    setExpandedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const handleApprove = async (proposal: DraftProposal) => {
    setApprovingPlanId(proposal.planId);
    try {
      if (onApproveProposal) await onApproveProposal(proposal);
    } finally {
      setApprovingPlanId(null);
    }
  };

  const handleApproveBuilder = async (proposal: BuilderProposal) => {
    setApprovingPlanId(proposal.planId);
    try {
      if (onApproveBuilderProposal) await onApproveBuilderProposal(proposal);
    } finally {
      setApprovingPlanId(null);
    }
  };

  const quickPrompts = [
    { label: '🔑 Hearth & Clay Auth Card', prompt: 'Hearth & Clay store ke liye authentication page banao with email aur password fields' },
    { label: '🏺 Handcrafted Ceramics & Store', prompt: 'Create handcrafted ceramics, organic throws, candles aur baskets collection with realistic pricing in INR' },
    { label: '🚀 Agency Hero Section', prompt: 'Create an Elementor hero section structure for "Digital Innovation Agency"' },
    { label: '💎 3-Tier Flexible Pricing Table', prompt: 'Create a 3-tier pricing table for WordPress agency services' },
    { label: '📝 Post: "How to Make a Simple Website Using AI"', prompt: 'Create a WordPress post titled "How to Make a Simple Website Using AI" with beginner-friendly step-by-step instructions. Check for duplicates first and show me the content for approval.' },
    { label: '🔍 Inspect site health', prompt: `Inspect the site ${selectedSite.replace(/https?:\/\//, '').replace(/\.local$/, '')} and report its version` },
  ];

  return (
    <aside className="w-[420px] h-full flex flex-col border-r border-slate-800 bg-[#1a1a2e] shrink-0">
      {/* ── Chat Header ── */}
      <div className="h-11 border-b border-slate-800 px-4 flex items-center justify-between text-xs shrink-0 bg-[#13131f]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-semibold text-slate-200">AI WordPress Copilot</span>
          <span className="text-slate-600">•</span>
          <span className="text-[11px] text-slate-500 font-mono">Autonomous Engine</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={onClearChat}
            className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors"
            title="Clear conversation"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* ── Messages Scroll Area ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="font-medium text-slate-200 text-sm mb-1">How can I assist your WordPress site?</h3>
            <p className="text-xs text-slate-500 max-w-[280px] mb-6">
              Ask questions, inspect site versions, or create draft posts safely with explicit approval.
            </p>
            <div className="w-full space-y-1.5">
              <p className="text-[11px] font-medium text-slate-600 uppercase tracking-wider text-left px-1 mb-2">Suggested Actions</p>
              {quickPrompts.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => { setInput(item.prompt); textareaRef.current?.focus(); }}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-700/60 border border-slate-700/60 hover:border-emerald-500/40 text-xs text-slate-300 transition-all flex items-center justify-between group"
                >
                  <span className="truncate pr-2">{item.label}</span>
                  <span className="text-slate-600 group-hover:text-emerald-400 text-sm">➔</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[92%] rounded-2xl p-3 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600/80 text-white rounded-br-none shadow-md'
                    : 'bg-slate-800/80 text-slate-200 rounded-bl-none border border-slate-700/50 shadow-md'
                }`}
              >
                {/* Executed Tools Badges */}
                {msg.executedTools && msg.executedTools.length > 0 && (
                  <div className="mb-2 space-y-1.5 pt-0.5">
                    {msg.executedTools.map((tool, idx) => {
                      const toolKey = `${msg.id}_tool_${idx}`;
                      const isExpanded = expandedTools[toolKey];
                      const isDenied = tool.status === 'denied';
                      const isError = tool.status === 'error';
                      return (
                        <div
                          key={idx}
                          className={`rounded-lg border text-[11px] overflow-hidden ${
                            isDenied
                              ? 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                              : isError
                              ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                              : 'bg-slate-900/80 border-slate-700 text-slate-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleToolExpand(toolKey)}
                            className="w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              {isDenied ? <span className="text-rose-400" title="Blocked by security guard">🛡️ Denied:</span>
                                : isError ? <span className="text-amber-400">⚠️ Error:</span>
                                : <span className="text-emerald-400">⚡ Tool:</span>}
                              <span className="font-mono font-medium">{tool.name}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-slate-500">
                              <span>{isDenied ? 'BLOCKED' : isError ? 'FAILED' : 'READ_ONLY'}</span>
                              <span>{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="p-2 border-t border-slate-700/60 bg-black/30 font-mono text-[10px] space-y-1">
                              {tool.arguments && <div><span className="text-slate-400">Args: </span><span>{JSON.stringify(tool.arguments)}</span></div>}
                              {tool.error && <div className="text-rose-400"><span>Error [{tool.error.code}]: </span><span>{tool.error.message}</span></div>}
                              {tool.output !== undefined && !tool.error && (
                                <div className="text-emerald-400/90 overflow-x-auto"><span>Output: </span><span>{JSON.stringify(tool.output, null, 1)}</span></div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Main content */}
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Draft Proposal Card */}
                {msg.proposal && (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-950/90 border border-amber-500/40 shadow-lg space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                        <span>📝</span><span>WordPress Draft Proposal</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-semibold">STATUS: DRAFT ONLY</span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-slate-200">{msg.proposal.post.title}</div>
                      {msg.proposal.post.excerpt && <p className="text-[10px] text-slate-400 italic">&ldquo;{msg.proposal.post.excerpt}&rdquo;</p>}
                    </div>
                    {msg.proposal.duplicateWarning && (
                      <div className="p-2 rounded-lg bg-rose-950/50 border border-rose-800/80 text-[10px] text-rose-300 flex items-start gap-1.5">
                        <span className="text-rose-400">⚠️</span><span>{msg.proposal.duplicateWarning}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <span className="text-[9px] font-mono text-slate-500 truncate max-w-[150px]">Target: {msg.proposal.targetSite.replace(/https?:\/\//, '')}</span>
                      {msg.proposal.isApplied ? (
                        <span className="text-[10px] font-medium text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Approved &amp; Created
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {onRejectProposal && (
                            <button type="button" onClick={() => onRejectProposal(msg.proposal!)} disabled={approvingPlanId === msg.proposal.planId}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors disabled:opacity-50">
                              Reject
                            </button>
                          )}
                          <button type="button" onClick={() => handleApprove(msg.proposal!)} disabled={approvingPlanId === msg.proposal.planId}
                            className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50">
                            {approvingPlanId === msg.proposal.planId ? (
                              <><span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Saving...</span></>
                            ) : '✓ Approve Changes'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Builder Proposal Card */}
                {msg.builderProposal && (
                  <div className="mt-3 p-3.5 rounded-xl bg-sky-950/40 border border-sky-700/60 shadow-lg space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sky-400 font-semibold text-xs">
                        <span>🧱</span><span className="capitalize">{msg.builderProposal.builderType} Builder Proposal</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-900/60 text-sky-300 border border-sky-600/50 uppercase font-bold">{msg.builderProposal.builderType}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-100">{msg.builderProposal.title}</p>
                      <p className="text-[11px] text-slate-300">{msg.builderProposal.summary}</p>
                    </div>
                    {msg.builderProposal.unsupportedFeatures && msg.builderProposal.unsupportedFeatures.length > 0 && (
                      <div className="p-2 rounded-lg bg-amber-950/50 border border-amber-800/80 text-[10px] text-amber-300">
                        ⚠️ Preserved verbatim: {msg.builderProposal.unsupportedFeatures.join(', ')}
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <span className="text-[9px] font-mono text-slate-500 truncate max-w-[150px]">Target: {msg.builderProposal.targetSite.replace(/https?:\/\//, '')}</span>
                      {msg.builderProposal.isApplied ? (
                        <span className="text-[10px] font-medium text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Approved &amp; Saved
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {onRejectBuilderProposal && (
                            <button type="button" onClick={() => onRejectBuilderProposal(msg.builderProposal!)} disabled={approvingPlanId === msg.builderProposal.planId}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors disabled:opacity-50">
                              Reject
                            </button>
                          )}
                          <button type="button" onClick={() => handleApproveBuilder(msg.builderProposal!)} disabled={approvingPlanId === msg.builderProposal.planId}
                            className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50">
                            {approvingPlanId === msg.builderProposal.planId ? (
                              <><span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Saving...</span></>
                            ) : '✓ Approve Changes'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Draft Completion Card */}
                {msg.appliedPost && (
                  <div className="mt-3 p-4 rounded-xl bg-gradient-to-b from-emerald-950/70 to-slate-950/90 border border-emerald-500/50 shadow-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🎉</span>
                        <div>
                          <div className="text-xs font-bold text-emerald-300">Your draft is ready!</div>
                          <div className="text-[10px] text-slate-400">Created and independently verified on WordPress</div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                        msg.appliedPost.status === 'publish'
                          ? 'bg-emerald-900/80 text-emerald-200 border-emerald-600'
                          : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                      }`}>
                        {msg.appliedPost.status === 'publish' ? '● PUBLISHED LIVE' : '○ DRAFT'} (ID #{msg.appliedPost.id})
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 text-slate-200 text-xs">
                      <div className="font-semibold text-white truncate">{msg.appliedPost.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                        <span>Target: {selectedSite.replace(/https?:\/\//, '')}</span>
                        <a href={msg.appliedPost.editLink} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 hover:underline">
                          <span>Open in WP Admin</span><span>↗</span>
                        </a>
                      </div>
                    </div>
                    <div className="text-[10px] text-emerald-300/80 font-mono flex items-center gap-1">
                      <span>✓</span><span>Verified via read-only GET /wp-json/wp/v2/posts/{msg.appliedPost.id}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                      <button type="button" onClick={() => onPreviewDraft?.(msg.appliedPost!.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] transition-colors flex items-center justify-center gap-1.5 border border-slate-700">
                        <span>👁️</span><span>Preview Draft</span>
                      </button>
                      <button type="button" onClick={() => setRevisionState({ open: true, postId: msg.appliedPost!.id, currentTitle: msg.appliedPost!.title, prompt: '' })}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] transition-colors flex items-center justify-center gap-1.5 border border-slate-700">
                        <span>✏️</span><span>Revise Draft</span>
                      </button>
                      {msg.appliedPost.status !== 'publish' ? (
                        <button type="button" onClick={() => onPublishNow?.(msg.appliedPost!.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition-all flex items-center justify-center gap-1.5 shadow-md border border-emerald-500/50">
                          <span>🚀</span><span>Publish Now</span>
                        </button>
                      ) : (
                        <div className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 text-emerald-300 font-medium text-[11px] flex items-center justify-center gap-1.5 border border-emerald-800/60">
                          ✓ Live on Site
                        </div>
                      )}
                      <button type="button" onClick={() => onKeepAsDraft?.(msg.appliedPost!.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-[11px] transition-colors flex items-center justify-center gap-1.5 border border-slate-800">
                        <span>📁</span><span>Keep as Draft</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Application Password Guidance */}
                {msg.error && (msg.error.includes('credentials') || msg.error.includes('Application Password') || msg.error.includes('401')) && (
                  <div className="mt-3 p-3.5 rounded-xl bg-amber-950/50 border border-amber-700/80 shadow-lg text-[11px] space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold"><span>🔑</span><span>WordPress Application Password Required</span></div>
                    <p className="text-slate-300">To perform actions on WordPress, your local WordPress user requires an authorized Application Password.</p>
                    <div className="bg-black/40 p-2.5 rounded-lg border border-amber-900/40 text-slate-300 space-y-1 text-[10px] font-mono">
                      <div>1. Open LocalWP → WP Admin for {selectedSite}</div>
                      <div>2. Navigate to Users → Profile</div>
                      <div>3. Scroll to Application Passwords</div>
                      <div>4. Enter name &quot;KPH-SitePilot&quot; &amp; click Add New</div>
                      <div>5. Add credentials to your server .env.local:</div>
                      <div className="text-emerald-400">WP_USERNAME=admin<br />WP_APPLICATION_PASSWORD=xxxx xxxx xxxx xxxx</div>
                    </div>
                    <p className="text-[10px] text-amber-400/80 italic">Note: Never paste your password in chat. The agent reads credentials server-side only.</p>
                  </div>
                )}

                {/* General Error */}
                {msg.error && !msg.error.includes('credentials') && !msg.error.includes('Application Password') && !msg.error.includes('401') && (
                  <div className="mt-2 p-2 rounded bg-rose-950/60 border border-rose-800 text-[11px] text-rose-300 flex items-start gap-1.5">
                    <span className="text-rose-400 mt-0.5">⚠️</span>
                    <div>
                      <p className="font-semibold">{msg.error}</p>
                      <p className="text-[10px] text-rose-400 mt-0.5">Ensure LocalWP site is running and backend API is active on port 3001.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <span className="text-[10px] text-slate-600 mt-1 px-1">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}

        {/* Live Multi-Step Activity Panel (inline in stream) */}
        {activeTask && (
          <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 shadow-xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-semibold text-slate-200">
                  {activeTask.status === 'planning' ? 'Planning Task...'
                    : activeTask.status === 'running' ? 'Executing Task...'
                    : activeTask.status === 'waiting_for_approval' ? 'Awaiting Your Approval'
                    : activeTask.status === 'completed' ? 'Task Completed'
                    : activeTask.status === 'cancelled' ? 'Task Stopped'
                    : 'Task Active'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">{activeTask.mode}</span>
              </div>
              <button type="button" onClick={() => setShowActivityDetails((prev) => !prev)} className="text-[10px] text-slate-500 hover:text-slate-300">
                {showActivityDetails ? 'Hide ▲' : 'Steps ▼'}
              </button>
            </div>
            {showActivityDetails && activeTask.steps && activeTask.steps.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                {activeTask.steps.map((step, idx) => (
                  <div key={step.id || idx} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-slate-900/60 border border-slate-800/40">
                    <div className="flex items-center gap-2">
                      {step.status === 'completed' ? <span className="text-emerald-400 font-bold">✓</span>
                        : step.status === 'running' ? <span className="w-2.5 h-2.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        : step.status === 'failed' ? <span className="text-rose-400 font-bold">✕</span>
                        : step.status === 'skipped' ? <span className="text-slate-500">⊘</span>
                        : <span className="text-slate-600 font-bold">○</span>}
                      <span className={step.status === 'running' ? 'text-white font-medium' : step.status === 'completed' ? 'text-slate-300' : 'text-slate-500'}>
                        {step.name}
                      </span>
                    </div>
                    {step.toolName && (
                      <span className="text-[9px] font-mono px-1 rounded bg-slate-800 text-slate-400">{step.toolName}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/90 border border-slate-700/60 shadow-lg">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span>
                {agentMode === 'writes' ? 'Analyzing & generating proposal...'
                  : agentMode === 'agent' ? 'Executing read-only WordPress tools...'
                  : 'Synthesizing AI response...'}
              </span>
            </div>
            <button type="button" onClick={onStopTask}
              className="px-2.5 py-1 rounded bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-semibold transition-colors flex items-center gap-1 shadow"
              title="Stop task execution immediately">
              <span>⏹</span><span>Stop</span>
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Queue bar ── */}
      {queuedTasks && queuedTasks.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold shrink-0">Queue ({queuedTasks.length})</span>
            <span className="text-[11px] text-slate-300 truncate">Next: &ldquo;{queuedTasks[0].prompt}&rdquo;</span>
          </div>
          <button type="button" onClick={() => onRemoveQueuedTask(queuedTasks[0].id)} className="text-[10px] text-slate-500 hover:text-rose-400 px-1 font-mono transition-colors" title="Remove queued prompt">
            ✕ Cancel
          </button>
        </div>
      )}

      {/* ── Contextual mode suggestion ── */}
      {contextualSuggestion && (
        <div className="px-3 py-2 bg-gradient-to-r from-amber-950/60 to-slate-900 border-t border-amber-700/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-amber-200 text-[11px] truncate mr-2">
            <span className="text-amber-400">⚡</span>
            <span className="truncate">{contextualSuggestion.reason}</span>
          </div>
          <button type="button" onClick={() => onAgentModeChange(contextualSuggestion.targetMode)}
            className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] transition-colors shrink-0 shadow-sm">
            {contextualSuggestion.label}
          </button>
        </div>
      )}

      {/* ── Composer ── */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 bg-[#13131f] shrink-0 space-y-2">
        {/* Mode pills + site selector */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
          <div className="flex items-center bg-slate-900/80 border border-slate-800 rounded-lg p-0.5" role="tablist">
            <button type="button" onClick={() => onAgentModeChange('agent')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${agentMode === 'agent' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-200'}`}
              title="Safe Read-Only inspection and query mode (Default)">
              <span className={`w-1.5 h-1.5 rounded-full ${agentMode === 'agent' ? 'bg-white' : 'bg-emerald-400'}`} />
              <span>🛡 Read-Only</span>
            </button>
            <button type="button" onClick={() => onAgentModeChange('writes')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${agentMode === 'writes' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-200'}`}
              title="Create WordPress draft posts with human approval">
              <span className={`w-1.5 h-1.5 rounded-full ${agentMode === 'writes' ? 'bg-white' : 'bg-amber-400'}`} />
              <span>✏️ Writes</span>
            </button>
            <button type="button" onClick={() => onAgentModeChange('chat')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${agentMode === 'chat' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-200'}`}
              title="Direct model chat without tools">
              <span className={`w-1.5 h-1.5 rounded-full ${agentMode === 'chat' ? 'bg-white' : 'bg-sky-400'}`} />
              <span>💬 Chat</span>
            </button>
          </div>

          {/* Site selector */}
          <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-0.5">
            <span className="text-[10px] text-slate-500">Target:</span>
            <select
              value={selectedSite}
              onChange={(e) => onSelectSite(e.target.value)}
              className="bg-transparent text-[11px] text-emerald-400 font-mono focus:outline-none cursor-pointer"
              aria-label="Select Target Site"
            >
              {availableSites.map((site) => (
                <option key={site.id} value={site.url} className="bg-slate-900 text-slate-200">{site.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Textarea & send/stop */}
        <div className="relative flex items-end bg-slate-900/90 border border-slate-700 focus-within:border-emerald-500/60 rounded-xl overflow-hidden shadow-inner transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              agentMode === 'writes'
                ? `Request draft post for ${selectedSite.replace(/https?:\/\//, '')}... (Approval required)`
                : agentMode === 'agent'
                ? `Ask about ${selectedSite.replace(/https?:\/\//, '')}... (Read-Only inspection)`
                : `Ask AI anything... (Enter to send, Shift+Enter for new line)`
            }
            rows={1}
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 text-xs px-3 py-2.5 resize-none focus:outline-none min-h-[44px] max-h-[140px]"
            aria-label="Agent prompt input"
          />
          <div className="flex items-center gap-1.5 m-1.5 shrink-0">
            {isLoading && (
              <button type="button" onClick={onStopTask}
                className="p-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-all shadow"
                aria-label="Stop task" title="Stop current task">
                <span className="text-xs font-bold">⏹</span>
              </button>
            )}
            <button type="submit" disabled={!input.trim()}
              className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white transition-all shrink-0"
              aria-label="Send message" title={isLoading ? 'Add to execution queue' : 'Send prompt'}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[10px] text-slate-600">
          <span>Shift + Enter for new line</span>
          {agentMode === 'writes' ? (
            <span className="text-amber-500 font-mono">Approval Required</span>
          ) : agentMode === 'agent' ? (
            <span className="text-emerald-600 font-mono">Read-Only Enforced</span>
          ) : (
            <span className="text-sky-500 font-mono">Direct AI Chat</span>
          )}
        </div>
      </form>

      {/* ── Publish Confirmation Modal ── */}
      {activePublishProposal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-2xl p-5 space-y-4 text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <span>🚀</span><span>Publish Post to Live WordPress Site</span>
              </div>
              <button type="button" onClick={onCancelPublish} disabled={isPublishing} className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-800 transition-colors">✕</button>
            </div>
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/60 text-amber-200 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-300"><span>⚠️</span><span>Public Visibility Warning</span></div>
              <p className="text-[11px] leading-relaxed">
                Publishing will make this post immediately visible to all public visitors on{' '}
                <strong className="text-white">{activePublishProposal.targetSite}</strong>. This action converts status from{' '}
                <strong className="text-amber-300 font-mono">DRAFT</strong> to <strong className="text-emerald-300 font-mono">LIVE PUBLISHED</strong>.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-slate-800 text-xs space-y-1.5">
              <div><span className="text-slate-400">Post Title: </span><strong className="text-white">{activePublishProposal.post.title}</strong></div>
              <div><span className="text-slate-400">Post ID: </span><span className="font-mono text-emerald-400 font-semibold">#{activePublishProposal.post.id}</span></div>
              <div><span className="text-slate-400">Integrity Hash: </span><span className="font-mono text-[10px] text-slate-500 truncate block">{activePublishProposal.integrityHash}</span></div>
            </div>
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button type="button" onClick={onCancelPublish} disabled={isPublishing} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50">
                Cancel / Keep Draft
              </button>
              <button type="button" onClick={() => onApprovePublish?.(activePublishProposal)} disabled={isPublishing}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-lg flex items-center gap-1.5 disabled:opacity-50">
                {isPublishing ? (
                  <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Publishing &amp; Verifying...</span></>
                ) : <><span>✓</span><span>Approve &amp; Publish Live</span></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revision Modal ── */}
      {revisionState?.open && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-sky-500/40 shadow-2xl p-5 space-y-4 text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <span>✏️</span><span>Revise Draft Post #{revisionState.postId}</span>
              </div>
              <button type="button" onClick={() => setRevisionState(null)} className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-800 transition-colors">✕</button>
            </div>
            <p className="text-xs text-slate-300">Current Title: <strong className="text-white">&ldquo;{revisionState.currentTitle}&rdquo;</strong></p>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-400">What changes would you like to make?</label>
              <textarea
                rows={3}
                value={revisionState.prompt}
                onChange={(e) => setRevisionState((prev) => (prev ? { ...prev, prompt: e.target.value } : null))}
                placeholder="e.g. Add a step-by-step section, make the conclusion stronger..."
                className="w-full rounded-lg bg-black/50 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none"
              />
            </div>
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button type="button" onClick={() => setRevisionState(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">
                Cancel
              </button>
              <button type="button" disabled={!revisionState.prompt.trim()}
                onClick={() => {
                  const pid = revisionState.postId;
                  const curTitle = revisionState.currentTitle;
                  const prompt = revisionState.prompt.trim();
                  setRevisionState(null);
                  onStartRevise?.(pid, curTitle, prompt);
                }}
                className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5">
                <span>Propose Revision</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

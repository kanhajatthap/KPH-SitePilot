'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '../components/Header';
import { ChatPanel } from '../components/ChatPanel';
import { PreviewCanvas } from '../components/PreviewCanvas';
import {
  AgentMode,
  ChatMessage,
  DraftProposal,
  BuilderProposal,
  PreviewState,
  ViewportMode,
  AvailableSite,
  AgentExecutionTask,
  TaskStep,
  QueuedTask,
  SitePageSummary,
  VerifiedResource,
  PublishProposalResponse,
} from '../lib/types';
import {
  BuilderCapabilities,
  ChatHistory,
  PersistedChatConversation,
} from '@wp-agent/contracts';
import {
  createChatConversation,
  fromPersistedChatHistory,
  readLocalChatHistory,
  saveLocalChatHistory,
  toPersistedChatHistory,
} from '../lib/chat-history';
import { synthesizeFromPrompt } from '../lib/ui-synthesizer';
import {
  checkApiHealth,
  sendAgentMessage,
  sendPureChatMessage,
  generateSitePlan,
  reviseSitePlan,
  proposeDraftPost,
  applyDraftPost,
  detectBuilderCapabilities,
  proposeBuilderContent,
  extractPreviewData,
  fetchPost,
  proposePublish,
  applyPublish,
  reviseDraft,
  connectTaskActivityStream,
  proposeSiteSettings,
  applySiteSettings,
  proposePluginOperation,
  applyPluginOperation,
  listInstalledPlugins,
  proposeCodeInjection,
  applyCodeInjection,
  proposePageCreation,
  applyPageCreation,
  fetchPageSections,
  proposeSectionEdit,
  applySectionEdit,
  listSitePages,
} from '../lib/api-client';

const AVAILABLE_SITES: AvailableSite[] = [
  {
    id: 'test-local',
    name: 'Test LocalWP Site (Online)',
    url: 'http://test.local',
    description: 'Active LocalWP development instance',
    isDefault: true,
  },
  {
    id: 'plugin-test',
    name: 'Plugin Test Lab',
    url: 'http://plugin-test.local',
    description: 'LocalWP testing site',
  },
];

export default function DashboardPage() {
  const showSignOut = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const [selectedSite, setSelectedSite] = useState<string>(AVAILABLE_SITES[0].url);
  const [agentMode, setAgentMode] = useState<AgentMode>('agent');
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatHistory>({
    conversations: [],
    activeConversationId: null,
  });
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<AgentExecutionTask | undefined>(undefined);
  const [queuedTasks, setQueuedTasks] = useState<QueuedTask[]>([]);
  const [apiConnected, setApiConnected] = useState(true);
  const [capabilities, setCapabilities] = useState<BuilderCapabilities | undefined>(undefined);
  const [activePublishProposal, setActivePublishProposal] =
    useState<PublishProposalResponse | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [activeCanvasTab, setActiveCanvasTab] = useState<'preview' | 'live' | 'code'>('preview');
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [sitePages, setSitePages] = useState<SitePageSummary[]>([]);

  // Section selector state for scoped page editing (Live Preview vertical slice)
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all');
  const [availableSections, setAvailableSections] = useState<Array<{ id: string; name: string }>>([
    { id: 'hero', name: 'Hero Section' },
    { id: 'features', name: 'Features Grid' },
    { id: 'metrics', name: 'Metrics Bar' },
  ]);
  const [targetPageId, setTargetPageId] = useState<number>(32); // Default page ID (modern-tech-home)

  const abortControllerRef = useRef<AbortController | null>(null);
  const approvalInFlightRef = useRef(false);
  const isSaasMode = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const [preview, setPreview] = useState<PreviewState>({
    targetSite: AVAILABLE_SITES[0].url,
    viewport: 'desktop',
    isLoading: false,
    activeView: 'welcome',
  });

  // Keep preview targetSite and viewport synced with selections
  useEffect(() => {
    setPreview((prev) => ({
      ...prev,
      targetSite: selectedSite,
      viewport,
    }));
  }, [selectedSite, viewport]);

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      try {
        let history: ChatHistory;
        if (isSaasMode) {
          const response = await fetch('/api/chat/history', { cache: 'no-store' });
          if (!response.ok) throw new Error('Unable to load saved conversations.');
          history = await response.json() as ChatHistory;
        } else {
          history = readLocalChatHistory();
        }
        if (!active) return;
        setChatHistory(history);
        setMessages(fromPersistedChatHistory(
          history.conversations.find(
            (conversation) => conversation.id === history.activeConversationId
          )?.messages ?? []
        ));
        setHistoryReady(true);
      } catch (error) {
        if (!active) return;
        setHistoryError(
          error instanceof Error ? error.message : 'Unable to load saved conversations.'
        );
      }
    };
    void loadHistory();
    return () => { active = false; };
  }, [isSaasMode]);

  useEffect(() => {
    if (!historyReady || messages.length === 0) return;
    const activeId = chatHistory.activeConversationId;
    const existing = chatHistory.conversations.find(
      (conversation) => conversation.id === activeId
    );
    const updatedAt = new Date().toISOString();
    const conversation: PersistedChatConversation = existing
      ? { ...existing, updatedAt, messages: toPersistedChatHistory(messages) }
      : createChatConversation(messages);
    if (!activeId) setChatHistory((history) => ({
      ...history,
      conversations: [...history.conversations, conversation].slice(-50),
      activeConversationId: conversation.id,
    }));
    else setChatHistory((history) => ({
      ...history,
      conversations: history.conversations.map((item) =>
        item.id === activeId ? conversation : item
      ),
    }));
  }, [messages, historyReady, chatHistory.activeConversationId]);

  useEffect(() => {
    if (!historyReady) return;
    const timer = window.setTimeout(async () => {
      try {
        if (isSaasMode) {
          const response = await fetch('/api/chat/history', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatHistory),
          });
          if (!response.ok) throw new Error('Unable to save conversations to your account.');
        } else {
          saveLocalChatHistory(chatHistory);
        }
        setHistoryError(null);
      } catch (error) {
        setHistoryError(
          error instanceof Error ? error.message : 'Unable to save conversations.'
        );
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [chatHistory, historyReady, isSaasMode]);

  // Check backend API server health
  const checkHealth = useCallback(async () => {
    const isHealthy = await checkApiHealth();
    setApiConnected(isHealthy);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Probe connected WordPress site for active builders and themes
  useEffect(() => {
    let isMounted = true;
    detectBuilderCapabilities(selectedSite)
      .then((caps) => {
        if (isMounted) {
          setCapabilities(caps);
          setPreview((prev) => ({ ...prev, capabilities: caps }));
        }
      })
      .catch(() => {
        // Safe fallback if target site REST endpoint not available
      });
    return () => {
      isMounted = false;
    };
  }, [selectedSite]);

  const handleStopTask = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setActiveTask((prev) =>
      prev
        ? {
            ...prev,
            status: 'cancelled',
            steps: prev.steps.map((s) =>
              s.status === 'running' ? { ...s, status: 'failed', error: 'Stopped by user' } : s
            ),
          }
        : undefined
    );
    setPreview((prev) => ({ ...prev, isLoading: false }));

    const cancelMessage: ChatMessage = {
      id: `msg_asst_${Date.now()}`,
      role: 'assistant',
      content: 'Task execution was stopped by user.',
      timestamp: new Date().toISOString(),
      status: 'denied',
    };
    setMessages((prev) => [...prev, cancelMessage]);
  };

  const handleRemoveQueuedTask = (id: string) => {
    setQueuedTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleApproveProposal = async (proposal: DraftProposal) => {
    setIsLoading(true);
    setPreview((prev) => ({ ...prev, isLoading: true }));
    try {
      const applied = await applyDraftPost({
        planId: proposal.planId,
        integrityHash: proposal.integrityHash,
        targetSite: proposal.targetSite,
        post: proposal.post,
        approvedBy: 'user',
      });

      let verified: VerifiedResource | undefined;
      try {
        verified = await fetchPost(proposal.targetSite, applied.id);
      } catch {
        // Fallback
      }

      // Mark proposal as applied in chat messages
      setMessages((prev) =>
        prev.map((m) =>
          m.proposal?.planId === proposal.planId
            ? {
                ...m,
                proposal: { ...m.proposal, isApplied: true },
                appliedPost: applied,
                verifiedResource: verified,
                showCompletionCard: true,
              }
            : m
        )
      );

      const successMessage: ChatMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: `Draft post "${applied.title}" has been successfully created and independently verified on ${proposal.targetSite} (Post ID #${applied.id}) with status "draft".`,
        timestamp: new Date().toISOString(),
        status: 'success',
        appliedPost: applied,
        verifiedResource: verified,
        showCompletionCard: true,
      };

      setMessages((prev) => [...prev, successMessage]);
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
        activeView: 'verified_post',
        appliedPost: applied,
        verifiedResource: verified,
        proposal: undefined,
        lastUpdated: new Date().toISOString(),
      }));

      if (activeTask) {
        setActiveTask((prev) =>
          prev
            ? {
                ...prev,
                status: 'completed',
                steps: prev.steps.map((s) => ({ ...s, status: 'completed' })),
              }
            : undefined
        );
      }
    } catch (err) {
      const errorMsg = (err as Error).message || 'Failed to apply approved post';
      const errorMessage: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: `Could not save draft post to WordPress: ${errorMsg}`,
        timestamp: new Date().toISOString(),
        status: 'error',
        error: errorMsg,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
        activeView: 'error',
        errorMessage: errorMsg,
      }));
    } finally {
      setIsLoading(false);
      setPreview((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handlePreviewDraft = async (postId: number) => {
    try {
      setPreview((prev) => ({ ...prev, isLoading: true }));
      const resource = await fetchPost(selectedSite, postId);
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
        activeView: 'verified_post',
        verifiedResource: resource,
        lastUpdated: new Date().toISOString(),
      }));
    } catch (err) {
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
        errorMessage: (err as Error).message,
      }));
    }
  };

  const handleStartRevise = async (postId: number, currentTitle: string, revisionPrompt: string) => {
    setIsLoading(true);
    setPreview((prev) => ({ ...prev, isLoading: true }));
    try {
      const revisionProposal = await reviseDraft({
        targetSite: selectedSite,
        postId,
        revisionPrompt,
      });

      const staged: DraftProposal = {
        planId: revisionProposal.planId,
        integrityHash: revisionProposal.integrityHash,
        targetSite: revisionProposal.targetSite,
        post: {
          title: revisionProposal.diff.after.title,
          content: revisionProposal.diff.after.content,
          status: 'draft',
        },
        summary: revisionProposal.summary,
        createdAt: revisionProposal.createdAt,
      };

      const asstMsg: ChatMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: `I've prepared a revision proposal for Post #${postId}: "${staged.post.title}".\n\nReview the staged changes below and click **Approve Changes** to update the draft on WordPress.`,
        timestamp: new Date().toISOString(),
        status: 'success',
        proposal: staged,
      };

      setMessages((prev) => [...prev, asstMsg]);
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
        activeView: 'proposal',
        proposal: staged,
        lastUpdated: new Date().toISOString(),
      }));
    } catch (err) {
      const errorMsg = (err as Error).message || 'Failed to prepare revision';
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          content: `Could not revise draft: ${errorMsg}`,
          timestamp: new Date().toISOString(),
          status: 'error',
          error: errorMsg,
        },
      ]);
    } finally {
      setIsLoading(false);
      setPreview((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handlePublishNow = async (postId: number) => {
    setIsLoading(true);
    try {
      const proposal = await proposePublish(selectedSite, postId);
      setActivePublishProposal(proposal);
    } catch (err) {
      const errorMsg = (err as Error).message || 'Failed to stage publish proposal';
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          content: `Could not prepare publish proposal: ${errorMsg}`,
          timestamp: new Date().toISOString(),
          status: 'error',
          error: errorMsg,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprovePublish = async (proposal: PublishProposalResponse) => {
    setIsPublishing(true);
    try {
      const result = await applyPublish({
        planId: proposal.planId,
        integrityHash: proposal.integrityHash,
        targetSite: proposal.targetSite,
        postId: proposal.post.id,
        intendedStatus: 'publish',
        approvedBy: 'user',
      });

      setActivePublishProposal(null);

      // Update messages so the applied post shows published
      setMessages((prev) =>
        prev.map((m) =>
          m.appliedPost?.id === result.post.id
            ? {
                ...m,
                appliedPost: {
                  ...m.appliedPost,
                  status: 'publish' as any,
                },
                verifiedResource: result.post,
              }
            : m
        )
      );

      const publishSuccessMessage: ChatMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: `🎉 Post #${result.post.id} ("${result.post.title}") has been published live to ${result.targetSite}!\n\nStatus is now LIVE on WordPress and publicly accessible.`,
        timestamp: new Date().toISOString(),
        status: 'success',
        verifiedResource: result.post,
      };

      setMessages((prev) => [...prev, publishSuccessMessage]);
      setPreview((prev) => ({
        ...prev,
        activeView: 'verified_post',
        verifiedResource: result.post,
        appliedPost: prev.appliedPost ? { ...prev.appliedPost, status: 'publish' as any } : undefined,
        lastUpdated: new Date().toISOString(),
      }));
    } catch (err) {
      const errorMsg = (err as Error).message || 'Failed to publish post';
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          content: `Could not publish post: ${errorMsg}`,
          timestamp: new Date().toISOString(),
          status: 'error',
          error: errorMsg,
        },
      ]);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCancelPublish = () => {
    setActivePublishProposal(null);
  };

  const handleKeepAsDraft = (postId: number) => {
    const keepMessage: ChatMessage = {
      id: `msg_asst_${Date.now()}`,
      role: 'assistant',
      content: `Post #${postId} will remain stored as a draft in WordPress. You can review, edit, or publish it whenever you're ready.`,
      timestamp: new Date().toISOString(),
      status: 'success',
    };
    setMessages((prev) => [...prev, keepMessage]);
  };

  const handleRefreshPost = async (postId: number) => {
    try {
      setPreview((prev) => ({ ...prev, isLoading: true }));
      const refreshed = await fetchPost(selectedSite, postId);
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
        activeView: 'verified_post',
        verifiedResource: refreshed,
        lastUpdated: new Date().toISOString(),
      }));
    } catch (err) {
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
        errorMessage: (err as Error).message,
      }));
    }
  };

  const handleRejectProposal = (proposal: DraftProposal) => {
    const rejectionMessage: ChatMessage = {
      id: `msg_asst_${Date.now()}`,
      role: 'assistant',
      content: `Proposal for "${proposal.post.title}" was rejected. Zero changes were made to WordPress.`,
      timestamp: new Date().toISOString(),
      status: 'denied',
    };
    setMessages((prev) => [...prev, rejectionMessage]);
    setPreview((prev) => ({
      ...prev,
      proposal: undefined,
      activeView: 'welcome',
    }));
    setActiveTask(undefined);
  };

  const handleApproveBuilderProposal = async (proposal: BuilderProposal) => {
    // A state update is not enough to stop a double-click: two handlers can
    // run before React re-renders. Use a synchronous ref lock as well.
    if (approvalInFlightRef.current) return;
    approvalInFlightRef.current = true;
    setIsLoading(true);
    setPreview((prev) => ({ ...prev, isLoading: true }));
    try {
      // ── ROUTE: Plugin Operation ──────────────────────────────────────────
      if (proposal.operationType === 'plugin') {
        const result = await applyPluginOperation({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: proposal.targetSite,
        });
        const successMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `✅ Plugin operation completed successfully on ${proposal.targetSite}.\n\n**Result:**\n\`\`\`\n${result.resultMessage ?? 'Done.'}\n\`\`\``,
          timestamp: new Date().toISOString(),
          status: 'success',
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.builderProposal?.planId === proposal.planId
              ? { ...m, builderProposal: { ...m.builderProposal, isApplied: true } }
              : m
          )
        );
        setMessages((prev) => [...prev, successMessage]);
        setPreview((prev) => ({
          ...prev,
          isLoading: false,
          activeView: 'builder',
          builderProposal: undefined,
          lastUpdated: new Date().toISOString(),
        }));
        if (activeTask) {
          setActiveTask((prev) =>
            prev ? { ...prev, status: 'completed', steps: prev.steps.map((s) => ({ ...s, status: 'completed' })) } : undefined
          );
        }
        return;
      }

      // ── ROUTE: Site Settings ─────────────────────────────────────────────
      if (proposal.operationType === 'settings') {
        const result = await applySiteSettings({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: proposal.targetSite,
          approvedBy: 'user',
        });
        const successMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `✅ Site settings updated on ${proposal.targetSite}.\n\n**Updated keys:**\n${(result.updated || []).map((k) => `• \`${k}\``).join('\n')}`,
          timestamp: new Date().toISOString(),
          status: 'success',
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.builderProposal?.planId === proposal.planId
              ? { ...m, builderProposal: { ...m.builderProposal, isApplied: true } }
              : m
          )
        );
        setMessages((prev) => [...prev, successMessage]);
        setPreview((prev) => ({ ...prev, isLoading: false, activeView: 'builder', builderProposal: undefined, lastUpdated: new Date().toISOString() }));
        if (activeTask) {
          setActiveTask((prev) =>
            prev ? { ...prev, status: 'completed', steps: prev.steps.map((s) => ({ ...s, status: 'completed' })) } : undefined
          );
        }
        return;
      }

      // ── ROUTE: Code Injection ────────────────────────────────────────────
      if (proposal.operationType === 'code') {
        const result = await applyCodeInjection({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: proposal.targetSite,
        });
        const successMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `✅ Code injected into **${proposal.codeLocation ?? 'header'}** on ${proposal.targetSite}.\n\nVerified: ${result.verified ? 'Yes' : 'Pending'}`,
          timestamp: new Date().toISOString(),
          status: 'success',
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.builderProposal?.planId === proposal.planId
              ? { ...m, builderProposal: { ...m.builderProposal, isApplied: true } }
              : m
          )
        );
        setMessages((prev) => [...prev, successMessage]);
        setPreview((prev) => ({ ...prev, isLoading: false, activeView: 'builder', builderProposal: undefined, lastUpdated: new Date().toISOString() }));
        if (activeTask) {
          setActiveTask((prev) =>
            prev ? { ...prev, status: 'completed', steps: prev.steps.map((s) => ({ ...s, status: 'completed' })) } : undefined
          );
        }
        return;
      }

      // ── ROUTE: Page Creation (Website Homepage / Landing Page) ───────────
      if (proposal.operationType === 'page') {
        const result = await applyPageCreation({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          targetSite: proposal.targetSite,
          approvedBy: 'user',
        });
        const successMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `🎉 ${result.source === 'existing' ? '**Matching Page Already Exists on WordPress**' : result.source === 'recovered' ? '**Page Recovered After a Late CLI Exit**' : '**Page Successfully Created on WordPress!**'}\n\n• **Title:** ${result.title}\n• **Page ID:** #${result.pageId}\n• **Status:** \`${result.postStatus}\`${result.isFrontPage ? ' (Set as Site Homepage 🏠)' : ''}\n• **Live URL:** [${result.pageUrl}](${result.pageUrl})\n• **WP Admin Edit:** [Open in WP Admin ↗](${result.editUrl})\n\n✓ ${result.source === 'existing' ? 'This page already existed; no duplicate was created. ' : result.source === 'recovered' ? 'The page was inserted before the CLI exited; it was recovered by slug. ' : ''}${result.verified ? `Verified independently via read-only WP-CLI inspection on ${result.targetSite}.` : 'The page exists, but verification could not confirm its content. Open WP Admin to inspect it before relying on it.'}`,
          timestamp: new Date().toISOString(),
          status: 'success',
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.builderProposal?.planId === proposal.planId
              ? { ...m, builderProposal: { ...m.builderProposal, isApplied: true } }
              : m
          )
        );
        setMessages((prev) => [...prev, successMessage]);
        setPreview((prev) => ({
          ...prev,
          isLoading: false,
          activeView: 'builder',
          builderProposal: undefined,
          lastUpdated: new Date().toISOString(),
        }));
        if (activeTask) {
          setActiveTask((prev) =>
            prev ? { ...prev, status: 'completed', steps: prev.steps.map((s) => ({ ...s, status: 'completed' })) } : undefined
          );
        }
        return;
      }

      // ── ROUTE: Section Edit (Scoped Chat → Section) ──────────────────────
      if (proposal.operationType === 'section') {
        const { sectionDetails } = proposal;
        if (!sectionDetails) {
          throw new Error('Section edit proposal is missing sectionDetails.');
        }
        const result = await applySectionEdit({
          planId: proposal.planId,
          integrityHash: proposal.integrityHash,
          pageId: sectionDetails.pageId,
          targetSite: proposal.targetSite,
          approvedBy: 'user',
        });
        const successMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `✅ **${sectionDetails.sectionName}** section updated on WordPress Page #${sectionDetails.pageId}!

• **Section:** \`${sectionDetails.sectionId}\`
• **Page URL:** [${result.pageUrl}](${result.pageUrl})
• **Last Modified:** ${result.postModified}
• **Verified:** ${result.verified ? 'Yes (read-only GET confirmed)' : 'Pending'}

The live site has been updated. Refresh the Preview tab to see changes.`,
          timestamp: new Date().toISOString(),
          status: 'success',
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.builderProposal?.planId === proposal.planId
              ? { ...m, builderProposal: { ...m.builderProposal, isApplied: true } }
              : m
          )
        );
        setMessages((prev) => [...prev, successMessage]);
        setPreview((prev) => ({
          ...prev,
          isLoading: false,
          activeView: 'builder',
          builderProposal: undefined,
          lastUpdated: new Date().toISOString(),
        }));
        setActiveCanvasTab('live'); // Auto-switch to Live tab to show changes
        if (activeTask) {
          setActiveTask((prev) =>
            prev ? { ...prev, status: 'completed', steps: prev.steps.map((s) => ({ ...s, status: 'completed' })) } : undefined
          );
        }
        return;
      }

      // ── ROUTE: Content / Post Creation (default) ─────────────────────────
      const content =
        proposal.renderedPreviewHtml ||
        (typeof proposal.diff.after === 'string'
          ? proposal.diff.after
          : JSON.stringify(proposal.diff.after, null, 2));

      const applied = await applyDraftPost({
        planId: proposal.planId,
        integrityHash: proposal.integrityHash,
        targetSite: proposal.targetSite,
        post: {
          title: proposal.title,
          content,
        },
        approvedBy: 'user',
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.builderProposal?.planId === proposal.planId
            ? {
                ...m,
                builderProposal: { ...m.builderProposal, isApplied: true },
                appliedPost: applied,
              }
            : m
        )
      );

      const successMessage: ChatMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: `Staged ${proposal.builderType} post "${applied.title}" has been successfully approved and created on ${proposal.targetSite} (Post ID #${applied.id}) with status "draft".`,
        timestamp: new Date().toISOString(),
        status: 'success',
        appliedPost: applied,
      };

      setMessages((prev) => [...prev, successMessage]);
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
        activeView: 'applied',
        appliedPost: applied,
        builderProposal: undefined,
        lastUpdated: new Date().toISOString(),
      }));

      if (activeTask) {
        setActiveTask((prev) =>
          prev
            ? {
                ...prev,
                status: 'completed',
                steps: prev.steps.map((s) => ({ ...s, status: 'completed' })),
              }
            : undefined
        );
      }
    } catch (err) {
      const errorMsg = (err as Error).message || 'Failed to apply approved builder post';
      const errorMessage: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: `Could not apply operation: ${errorMsg}`,
        timestamp: new Date().toISOString(),
        status: 'error',
        error: errorMsg,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
        activeView: 'error',
        errorMessage: errorMsg,
      }));
    } finally {
      approvalInFlightRef.current = false;
      setIsLoading(false);
      setPreview((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleRejectBuilderProposal = (proposal: BuilderProposal) => {
    const rejectionMessage: ChatMessage = {
      id: `msg_asst_${Date.now()}`,
      role: 'assistant',
      content: `Builder proposal for "${proposal.title}" was rejected. Zero changes were made to WordPress.`,
      timestamp: new Date().toISOString(),
      status: 'denied',
    };
    setMessages((prev) => [...prev, rejectionMessage]);
    setPreview((prev) => ({
      ...prev,
      builderProposal: undefined,
      activeView: 'welcome',
    }));
    setActiveTask(undefined);
  };

  // Handle section selection changes — refetch sections when Live tab opened on page 32
  const handleSelectSection = (sectionId: string) => {
    setSelectedSectionId(sectionId);
  };

  // Fetch page sections from API to populate the section strip
  const handleFetchPageSections = async (pageId: number) => {
    try {
      const result = await fetchPageSections(pageId);
      setAvailableSections(
        result.sections.map((s) => ({ id: s.id, name: s.name }))
      );
      setTargetPageId(pageId);
    } catch {
      // Keep default sections if fetch fails (site may be offline)
    }
  };

  const handleFetchSitePages = useCallback(async () => {
    try {
      const result = await listSitePages(selectedSite);
      setSitePages(result.pages);
    } catch {
      setSitePages([]);
    }
  }, [selectedSite]);

  useEffect(() => {
    void handleFetchSitePages();
  }, [handleFetchSitePages]);

  const handleSendMessage = async (
    prompt: string,
    overrideMode?: AgentMode,
    overrideSite?: string
  ) => {
    const currentMode = overrideMode || agentMode;
    const currentSite = overrideSite || selectedSite;

    // Sequential Queue check: if a task is already executing, queue this prompt!
    if (isLoading) {
      const queuedItem: QueuedTask = {
        id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        prompt,
        targetSite: currentSite,
        mode: currentMode,
        queuedAt: new Date().toISOString(),
        status: 'queued',
      };
      setQueuedTasks((prev) => [...prev, queuedItem]);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessageId = `msg_user_${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
      targetSite: currentSite,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setPreview((prev) => ({ ...prev, isLoading: true }));

    // Initialize a truthful task tracker. Do not show tool badges here: this
    // local UI does not know which tools will run until the route executes.
    const taskId = `task_${Date.now()}`;
    const initialSteps =
      currentMode === 'writes'
        ? [
            {
              id: 'step_understand',
              name: 'Understanding the request',
              description: 'Analyzing the requested change.',
              status: 'running' as const,
            },
            {
              id: 'step_prepare',
              name: 'Preparing the change',
              description: `Resolving the target and scope for ${currentSite}.`,
              status: 'pending' as const,
            },
            {
              id: 'step_stage',
              name: 'Staging the proposal',
              description: 'Generating a reviewable proposal and integrity hash.',
              status: 'pending' as const,
            },
            {
              id: 'step_approval',
              name: 'Awaiting user approval',
              description: 'Nothing is written until you approve.',
              status: 'pending' as const,
            },
          ]
        : currentMode === 'agent'
        ? [
            {
              id: 'step_understand',
              name: 'Understanding the request',
              description: 'Parsing the request and target site.',
              status: 'running' as const,
            },
            {
              id: 'step_work',
              name: 'Working with the connected site',
              description: `Running only the read-only tools needed for ${currentSite}.`,
              status: 'pending' as const,
            },
            {
              id: 'step_synthesize',
              name: 'Synthesizing the response',
              description: 'Formatting the verified result.',
              status: 'pending' as const,
            },
          ]
        : [
            {
              id: 'step_understand',
              name: 'Understanding the request',
              description: 'Processing chat prompt.',
              status: 'running' as const,
            },
            {
              id: 'step_respond',
              name: 'Generating AI response',
              description: 'Synthesizing conversational response.',
              status: 'pending' as const,
            },
          ];

    setActiveTask({
      id: taskId,
      correlationId: taskId,
      prompt,
      targetSite: currentSite,
      mode: currentMode,
      status: 'running',
      steps: initialSteps,
      currentStepIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      const p = prompt.toLowerCase().trim();

      // --- Intent Detection ---
      const isInspectionPrompt = /^(inspect|check site|get page|read page|site health|wp version)/i.test(p);

      // Section edit: scoped instruction for a selected page section
      const isSectionEdit =
        selectedSectionId && selectedSectionId !== 'all' &&
        (
          /(?:change|update|edit|make|set|use|apply|add|remove|adjust|style|modify)/i.test(p) &&
          !/^(inspect|install|activate|create|list|show)/i.test(p)
        );

      // Plugin operations: install, activate, deactivate, list
      const isPluginOp = 
        /^(install|activate|deactivate|uninstall|delete)\s+(?:the\s+|plugin\s+)?(?:plugin\s+)?[\w-]+/i.test(p) ||
        /(?:install|activate|deactivate)\s+[\w-]+\s+plugin/i.test(p) ||
        /^(list|show)\s+(installed\s+)?plugins/i.test(p) ||
        /plugin[s]?\s*(list|status)/i.test(p);

      // Site settings: title, tagline, permalinks, homepage
      const isSettingsOp =
        /(?:change|set|update|modify)\s+(?:the\s+)?(?:site\s+(?:title|name|tagline|description)|tagline|permalink|homepage|front\s*page)/i.test(p) ||
        /(?:blogname|blogdescription|permalink_structure)/i.test(p);

      // Header/footer/CSS code injection
      const isCodeInjection =
        /(?:add|inject|insert|include)\s+.+?\s+(?:to|in(?:to)?)\s+(?:the\s+)?(?:header|footer|head|<head)/i.test(p) ||
        /add\s+(?:google\s+analytics|gtm|tag\s+manager|tracking|pixel|script|code|css|custom\s+css)/i.test(p) ||
        /(?:inject|insert)\s+(?:script|code|css|tracking)/i.test(p);

      // Content creation: pages, posts, sections
      const isCreationOp =
        !isInspectionPrompt && !isPluginOp && !isSettingsOp && !isCodeInjection &&
        (
          /^(create|build|make|generate|design|draft|add|stage)\b/i.test(p) ||
          /auth|login|sign in|signup|hearth|hero|banner|pricing|tier|product|ceramics|store|shop|catalog|inventory|contact|table|cards|landing|page|post|article/i.test(p) ||
          currentMode === 'writes'
        );

      // --- ROUTE 0: Section Edit (highest priority when section is actively selected) ---
      if (isSectionEdit && !isPluginOp && !isSettingsOp && !isCodeInjection) {
        const targetSection = availableSections.find((s) => s.id === selectedSectionId);
        const sectionName = targetSection?.name || selectedSectionId;

        setCurrentRoute(`/editor/section/${selectedSectionId}`);
        setActiveCanvasTab('preview');

        const planStepId = `step_section_${Date.now()}`;
        const planStep: TaskStep = {
          id: planStepId,
          name: 'Proposing section edit',
          description: `Proposing scoped edit to "${sectionName}" → "${prompt}"`,
          status: 'running',
          toolName: 'section_edit',
          startedAt: new Date().toISOString(),
        };
        setActiveTask((prev) => prev ? { ...prev, steps: [...prev.steps, planStep] } : undefined);

        try {
          const sectionProposal = await proposeSectionEdit({
            targetSite: currentSite,
            pageId: targetPageId,
            sectionId: selectedSectionId,
            instruction: prompt,
          });

          const bProposal: BuilderProposal = {
            status: 'proposed',
            planId: sectionProposal.planId,
            integrityHash: sectionProposal.integrityHash,
            targetSite: currentSite,
            builderType: 'gutenberg',
            title: `${sectionName} Update`,
            diff: {
              before: sectionProposal.diff.before,
              after: sectionProposal.diff.after,
            },
            renderedPreviewHtml: sectionProposal.renderedPreviewHtml,
            unsupportedFeatures: sectionProposal.unsupportedOperations,
            summary: sectionProposal.summary,
            createdAt: sectionProposal.createdAt,
            operationType: 'section',
            sectionDetails: {
              pageId: sectionProposal.pageId,
              sectionId: sectionProposal.sectionId,
              sectionName: sectionProposal.sectionName,
            },
          };

          const unsupportedNote = sectionProposal.unsupportedOperations.length > 0
            ? `\n\n**⚠️ Unsupported Operations (skipped):**\n${sectionProposal.unsupportedOperations.map((u) => `• ${u}`).join('\n')}`
            : '';

          const diffSnippet = sectionProposal.diff.after !== sectionProposal.diff.before
            ? `\n\n**Diff (after):**\n\`\`\`html\n${sectionProposal.diff.after.slice(0, 400)}...\n\`\`\``
            : '\n\n*(No changes were detected — instruction may not match supported transforms)*';

          const assistantMessage: ChatMessage = {
            id: `msg_asst_${Date.now()}`,
            role: 'assistant',
            content: `🎯 **Section Edit Proposal** — \`${sectionName}\` on Page #${targetPageId}

**Instruction:** "${prompt}"
**Target Section:** \`${sectionProposal.sectionId}\`
**Summary:** ${sectionProposal.summary}${diffSnippet}${unsupportedNote}

Review the diff in the Preview panel. Click **✓ Approve & Apply** to write changes to WordPress, or **Reject** to cancel.`,
            timestamp: new Date().toISOString(),
            status: 'success',
            builderProposal: bProposal,
          };

          setMessages((prev) => [...prev, assistantMessage]);
          setPreview((prev) => ({
            ...prev,
            isLoading: false,
            activeView: 'builder',
            builderProposal: bProposal,
            lastUpdated: new Date().toISOString(),
          }));
          setActiveTask((prev) =>
            prev
              ? { ...prev, status: 'waiting_for_approval', steps: prev.steps.map((s) => ({ ...s, status: 'completed' })) }
              : undefined
          );
        } catch (sectionErr: any) {
          throw new Error(`Section edit failed: ${sectionErr.message}`);
        }
        return;
      }

      // --- ROUTE 1: Plugin Operations ---
      if (isPluginOp) {
        const action = /^(list|show)\s/i.test(p) || /list$|status$/i.test(p) ? 'list'
          : /\bactivate\b/i.test(p) ? 'activate'
          : /\bdeactivate\b/i.test(p) ? 'deactivate'
          : /\bdelete\b|\buninstall\b/i.test(p) ? 'delete'
          : 'install';

        // Common plugin slug aliases (human name → WordPress.org slug)
        const slugAliases: Record<string, string> = {
          'yoast': 'wordpress-seo',
          'yoastseo': 'wordpress-seo',
          'acf': 'advanced-custom-fields',
          'woocommerce': 'woocommerce',
          'elementor': 'elementor',
          'contactform7': 'contact-form-7',
          'cf7': 'contact-form-7',
          'rankmath': 'seo-by-rank-math',
          'rank-math': 'seo-by-rank-math',
          'jetpack': 'jetpack',
          'wordfence': 'wordfence',
          'wpforms': 'wpforms-lite',
          'redirection': 'redirection',
          'seopress': 'wp-seopress',
        };

        // Extract plugin slug from prompt
        const slugMatch = p.match(/(?:install|activate|deactivate|delete|uninstall)\s+(?:the\s+|plugin\s+)?(?:plugin\s+)?([\w-]+)/i)
          || p.match(/([\w-]+)\s+plugin/i);
        const rawSlug = slugMatch?.[1]?.toLowerCase().replace(/\s+/g, '-') || 'unknown-plugin';
        const pluginSlug = slugAliases[rawSlug] ?? rawSlug;

        const synth = synthesizeFromPrompt(prompt, currentSite, { pluginSlug, pluginAction: action });
        setCurrentRoute('/plugins');
        setActiveCanvasTab('preview');

        let bProposal: BuilderProposal;
        if (action === 'list') {
          bProposal = {
            status: 'proposed',
            planId: `plan_${Date.now()}`,
            integrityHash: Math.random().toString(16).substring(2).padEnd(64, '0'),
            targetSite: currentSite,
            builderType: 'gutenberg',
            title: 'Installed Plugins',
            diff: { before: null, after: 'Plugin list inspection' },
            renderedPreviewHtml: synth.renderedHtml,
            unsupportedFeatures: [],
            summary: synth.summary,
            createdAt: new Date().toISOString(),
            operationType: 'plugin',
            pluginAction: 'install',
            pluginSlug,
          };
        } else {
          try {
            const proposal = await proposePluginOperation({
              targetSite: currentSite,
              action: action as 'install' | 'activate' | 'deactivate' | 'delete',
              pluginSlug,
            });
            bProposal = {
              status: 'proposed',
              planId: proposal.planId,
              integrityHash: proposal.integrityHash,
              targetSite: currentSite,
              builderType: 'gutenberg',
              title: `Plugin: ${action} ${pluginSlug}`,
              diff: { before: null, after: proposal.cliCommand },
              renderedPreviewHtml: synth.renderedHtml,
              unsupportedFeatures: [],
              summary: proposal.summary,
              createdAt: proposal.createdAt,
              operationType: 'plugin',
              pluginAction: action as 'install' | 'activate' | 'deactivate' | 'delete',
              pluginSlug,
            };
          } catch {
            bProposal = {
              status: 'proposed',
              planId: `plan_${Date.now()}`,
              integrityHash: Math.random().toString(16).substring(2).padEnd(64, '0'),
              targetSite: currentSite,
              builderType: 'gutenberg',
              title: `Plugin: ${action} ${pluginSlug}`,
              diff: { before: null, after: `wp plugin ${action} ${pluginSlug}` },
              renderedPreviewHtml: synth.renderedHtml,
              unsupportedFeatures: [],
              summary: synth.summary,
              createdAt: new Date().toISOString(),
              operationType: 'plugin',
              pluginAction: action as 'install' | 'activate' | 'deactivate' | 'delete',
              pluginSlug,
            };
          }
        }

        const assistantMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `\`\`\`bash\n${synth.codeSnippet}\n\`\`\`\n\n**Isse kya kya fix/generate hua:**\n${synth.bulletPoints.map((b) => `• ${b}`).join('\n')}\n\nWordPress (${currentSite}) par plugin status verify ho chuka hai.`,
          timestamp: new Date().toISOString(),
          status: 'success',
          builderProposal: bProposal,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setPreview((prev) => ({
          ...prev,
          isLoading: false,
          activeView: 'builder',
          builderProposal: bProposal,
          lastUpdated: new Date().toISOString(),
        }));
        setActiveTask((prev) => prev ? { ...prev, status: 'waiting_for_approval', steps: prev.steps.map((s) => ({ ...s, status: 'completed' })) } : undefined);
        return;
      }

      // --- ROUTE 2: Site Settings ---
      if (isSettingsOp) {
        // Parse key-value from prompt
        const settingsMap: Record<string, string> = {};
        const titleMatch = p.match(/(?:site\s+(?:title|name)|blogname)\s+(?:to\s+)?["']?([^"'\n,]+)["']?/i);
        const taglineMatch = p.match(/(?:tagline|description|blogdescription)\s+(?:to\s+)?["']?([^"'\n,]+)["']?/i);
        const permalinkMatch = p.match(/permalink[s]?\s+(?:to\s+)?["']?([^"'\n,]+)["']?/i);
        if (titleMatch?.[1]) settingsMap['blogname'] = titleMatch[1].trim();
        if (taglineMatch?.[1]) settingsMap['blogdescription'] = taglineMatch[1].trim();
        if (permalinkMatch?.[1]) settingsMap['permalink_structure'] = permalinkMatch[1].trim();

        const synth = synthesizeFromPrompt(prompt, currentSite);
        setCurrentRoute('/settings');
        setActiveCanvasTab('preview');

        let bProposal: BuilderProposal = {
          status: 'proposed',
          planId: `plan_${Date.now()}`,
          integrityHash: Math.random().toString(16).substring(2).padEnd(64, '0'),
          targetSite: currentSite,
          builderType: 'gutenberg',
          title: 'Site Settings Update',
          diff: { before: null, after: JSON.stringify(settingsMap) },
          renderedPreviewHtml: synth.renderedHtml,
          unsupportedFeatures: [],
          summary: synth.summary,
          createdAt: new Date().toISOString(),
          operationType: 'settings',
        };

        if (Object.keys(settingsMap).length > 0) {
          try {
            const proposal = await proposeSiteSettings({ targetSite: currentSite, settings: settingsMap });
            bProposal = {
              ...bProposal,
              planId: proposal.planId,
              integrityHash: proposal.integrityHash,
              summary: proposal.summary,
              createdAt: proposal.createdAt,
              operationType: 'settings',
            };
          } catch { /* fallback to preview-only */ }
        }

        const assistantMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `\`\`\`bash\nwp option update ${Object.entries(settingsMap).map(([k, v]) => `${k} "${v}"`).join('\nwp option update ')}\n\`\`\`\n\n**Isse kya kya change hoga:**\n${Object.entries(settingsMap).map(([k, v]) => `• \`${k}\` → "${v}"`).join('\n')}\n\nChange review karo aur top-right **Publish** se apply karo on ${currentSite}.`,
          timestamp: new Date().toISOString(),
          status: 'success',
          builderProposal: bProposal,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setPreview((prev) => ({ ...prev, isLoading: false, activeView: 'builder', builderProposal: bProposal, lastUpdated: new Date().toISOString() }));
        setActiveTask((prev) => prev ? { ...prev, status: 'waiting_for_approval', steps: prev.steps.map((s) => ({ ...s, status: 'completed' })) } : undefined);
        return;
      }

      // --- ROUTE 3: Code / Script Injection ---
      if (isCodeInjection) {
        const location: 'header' | 'footer' | 'css' = /footer/i.test(p) ? 'footer' : /css|style/i.test(p) ? 'css' : 'header';

        // Extract the code snippet from the prompt (everything after "add" or between quotes)
        const codeMatch = prompt.match(/add\s+(.+?)\s+to\s+(?:the\s+)?(?:header|footer|head)/i)?.[1]
          || prompt.match(/["'`]([^"'`]+)["'`]/)?.[1]
          || '<!-- Custom code will be inserted here -->';

        // Format as proper script tag if it's a URL/src reference
        let codeSnippet = codeMatch;
        if (/analytics|gtm|google|pixel|tag\s*manager/i.test(p) && !codeMatch.startsWith('<')) {
          codeSnippet = `<!-- ${codeMatch} -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', 'GA_MEASUREMENT_ID');\n</script>`;
        }

        const synth = synthesizeFromPrompt(prompt, currentSite);
        setCurrentRoute('/code');
        setActiveCanvasTab('preview');

        let bProposal: BuilderProposal = {
          status: 'proposed',
          planId: `plan_${Date.now()}`,
          integrityHash: Math.random().toString(16).substring(2).padEnd(64, '0'),
          targetSite: currentSite,
          builderType: 'gutenberg',
          title: `${location.charAt(0).toUpperCase() + location.slice(1)} Script Injection`,
          diff: { before: null, after: codeSnippet },
          renderedPreviewHtml: synth.renderedHtml,
          unsupportedFeatures: [],
          summary: `Inject custom ${location} code on ${currentSite}`,
          createdAt: new Date().toISOString(),
          operationType: 'code',
          codeLocation: location,
        };

        try {
          const proposal = await proposeCodeInjection({ targetSite: currentSite, location, code: codeSnippet, label: `${location} script from prompt` });
          bProposal = {
            ...bProposal,
            planId: proposal.planId,
            integrityHash: proposal.integrityHash,
            summary: proposal.summary,
            operationType: 'code',
            codeLocation: location,
          };
        } catch { /* fallback */ }

        const assistantMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `\`\`\`html\n${codeSnippet}\n\`\`\`\n\n**Isse kya kya inject hoga:**\n• Custom code snippet **wp_${location}** hook ke through inject hoga\n• Target: \`${currentSite}\` — \`${location}\` section\n• WP-CLI: \`wp option update ${location}_scripts\`\n\nPreview dekho aur **Publish** karo to apply it on ${currentSite}.`,
          timestamp: new Date().toISOString(),
          status: 'success',
          builderProposal: bProposal,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setPreview((prev) => ({ ...prev, isLoading: false, activeView: 'builder', builderProposal: bProposal, lastUpdated: new Date().toISOString() }));
        setActiveTask((prev) => prev ? { ...prev, status: 'waiting_for_approval', steps: prev.steps.map((s) => ({ ...s, status: 'completed' })) } : undefined);
        return;
      }

      // --- ROUTE 4: Content creation (Gutenberg/Elementor/Pages/Posts) ---
      if (isCreationOp) {
        const isPageOrHomeRequest = /(?:page|homepage|home\s*page|landing\s*page|website)/i.test(p);
        const isFrontPage = /(?:homepage|home\s*page|front\s*page)/i.test(p);

        const synth = synthesizeFromPrompt(prompt, currentSite);
        setCurrentRoute(synth.route);
        setActiveCanvasTab('preview');

        let planId = `plan_${Date.now()}`;
        let integrityHash = Math.random().toString(16).substring(2).padEnd(64, '0');

        if (isPageOrHomeRequest) {
          // Dedicated Page Creation Workflow. If staging fails, stop honestly:
          // never fabricate a plan id/hash that can only fail at approval time.
          try {
            const pageProp = await proposePageCreation({
              targetSite: currentSite,
              title: synth.title,
              content: synth.gutenbergBlocksHtml,
              slug: isFrontPage ? 'home' : synth.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              status: 'publish',
              isFrontPage,
              builder: 'gutenberg',
            });
            planId = pageProp.planId;
            integrityHash = pageProp.integrityHash;
          } catch (err) {
            const errorMsg = (err as Error).message || 'Failed to stage the page proposal';
            setMessages((prev) => [
              ...prev,
              {
                id: `msg_err_${Date.now()}`,
                role: 'assistant',
                content: `Could not stage the page proposal: ${errorMsg}`,
                timestamp: new Date().toISOString(),
                status: 'error',
                error: errorMsg,
              },
            ]);
            setPreview((prev) => ({
              ...prev,
              isLoading: false,
              activeView: 'error',
              errorMessage: errorMsg,
            }));
            setActiveTask((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'failed',
                    error: errorMsg,
                    steps: prev.steps.map((step) =>
                      step.status === 'running' ? { ...step, status: 'failed', error: errorMsg } : step
                    ),
                  }
                : undefined
            );
            return;
          }

          const bProposal: BuilderProposal = {
            status: 'proposed',
            planId,
            integrityHash,
            targetSite: currentSite,
            builderType: 'gutenberg',
            title: synth.title,
            diff: {
              before: null,
              after: synth.gutenbergBlocksHtml,
            },
            renderedPreviewHtml: synth.renderedHtml,
            unsupportedFeatures: [],
            summary: `Create and publish WordPress ${isFrontPage ? 'Homepage' : 'Page'}: "${synth.title}"`,
            createdAt: new Date().toISOString(),
            operationType: 'page',
            pageDetails: {
              isFrontPage,
              slug: isFrontPage ? 'home' : synth.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              postStatus: 'publish',
            },
          };

          const assistantMessage: ChatMessage = {
            id: `msg_asst_${Date.now()}`,
            role: 'assistant',
            content: `\`\`\`html\n${synth.codeSnippet}\n\`\`\`\n\n**Isse kya kya generate aur stage hua:**\n${synth.bulletPoints.map((b) => `• ${b}`).join('\n')}\n\n• **Target:** WordPress Page (${isFrontPage ? 'Homepage 🏠' : 'Standard Page'})\n• **Builder:** Structured Gutenberg Blocks\n\nPreview dekh kar top-right **Publish** ya neeche button se approve karein to create the real page on ${currentSite}.`,
            timestamp: new Date().toISOString(),
            status: 'success',
            builderProposal: bProposal,
          };

          setMessages((prev) => [...prev, assistantMessage]);
          setPreview((prev) => ({
            ...prev,
            isLoading: false,
            activeView: 'builder',
            builderProposal: bProposal,
            lastUpdated: new Date().toISOString(),
          }));

          setActiveTask((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'waiting_for_approval',
                  currentStepIndex: 3,
                  steps: [
                    {
                      id: 'step_understand',
                      name: 'Understanding the request',
                      description: 'Parsed the page request and target site.',
                      status: 'completed',
                    },
                    {
                      id: 'step_generate',
                      name: 'Generating page content',
                      description: 'Built five responsive sections as Gutenberg blocks.',
                      status: 'completed',
                    },
                    {
                      id: 'step_stage',
                      name: 'Staging the page proposal',
                      description: 'Created a verifiable proposal and integrity hash.',
                      status: 'completed',
                    },
                    {
                      id: 'step_approval',
                      name: 'Awaiting user approval',
                      description: 'Nothing is saved until you approve.',
                      status: 'running',
                    },
                  ],
                }
              : undefined
          );
          return;
        }

        // Standard Post / Blog Staging Fallback. Do not invent a plan id when
        // staging fails; that only moves the failure to the approval step.
        try {
          const apiProposal = await proposeBuilderContent({
            targetSite: currentSite,
            builderType: synth.type === 'products' ? 'woocommerce' : synth.type === 'hero' ? 'elementor' : 'gutenberg',
            prompt,
            title: synth.title,
          });
          planId = apiProposal.planId;
          integrityHash = apiProposal.integrityHash;
        } catch (err) {
          const errorMsg = (err as Error).message || 'Failed to stage the content proposal';
          setMessages((prev) => [
            ...prev,
            {
              id: `msg_err_${Date.now()}`,
              role: 'assistant',
              content: `Could not stage the content proposal: ${errorMsg}`,
              timestamp: new Date().toISOString(),
              status: 'error',
              error: errorMsg,
            },
          ]);
          setPreview((prev) => ({
            ...prev,
            isLoading: false,
            activeView: 'error',
            errorMessage: errorMsg,
          }));
          setActiveTask((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'failed',
                  error: errorMsg,
                  steps: prev.steps.map((step) =>
                    step.status === 'running' ? { ...step, status: 'failed', error: errorMsg } : step
                  ),
                }
              : undefined
          );
          return;
        }

        const bProposal: BuilderProposal = {
          status: 'proposed',
          planId,
          integrityHash,
          targetSite: currentSite,
          builderType: synth.type === 'products' ? 'woocommerce' : synth.type === 'hero' ? 'elementor' : 'gutenberg',
          title: synth.title,
          diff: {
            before: null,
            after: synth.gutenbergBlocksHtml,
          },
          renderedPreviewHtml: synth.renderedHtml,
          unsupportedFeatures: [],
          summary: synth.summary,
          createdAt: new Date().toISOString(),
          operationType: 'content',
        };

        const assistantMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `\`\`\`sql\n${synth.codeSnippet}\n\`\`\`\n\n**Isse kya kya fix/generate hua:**\n${synth.bulletPoints.map((b) => `• ${b}`).join('\n')}\n\nRun karne ke baad batayein, main live preview verify kar dunga! To publish to WordPress (${currentSite}), click **Publish** at top right.`,
          timestamp: new Date().toISOString(),
          status: 'success',
          builderProposal: bProposal,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setPreview((prev) => ({
          ...prev,
          isLoading: false,
          activeView: 'builder',
          builderProposal: bProposal,
          lastUpdated: new Date().toISOString(),
        }));

        setActiveTask((prev) =>
          prev
            ? {
                ...prev,
                status: 'waiting_for_approval',
                currentStepIndex: 3,
                steps: [
                  {
                    id: 'step_understand',
                    name: 'Understanding the request',
                    description: 'Parsed the content request and target site.',
                    status: 'completed',
                  },
                  {
                    id: 'step_generate',
                    name: 'Generating content',
                    description: 'Built the requested content and Gutenberg markup.',
                    status: 'completed',
                  },
                  {
                    id: 'step_stage',
                    name: 'Staging the content proposal',
                    description: 'Created a verifiable proposal and integrity hash.',
                    status: 'completed',
                  },
                  {
                    id: 'step_approval',
                    name: 'Awaiting user approval',
                    description: 'Nothing is saved until you approve.',
                    status: 'running',
                  },
                ],
              }
            : undefined
        );
        return;
      }

      // 2. Website Planning (Phase 4 Planning Workflow)
      const isPlanRequest = /plan|design system|wireframe|website plan|sitemap|layout/i.test(prompt);
      const isRevisionRequest = preview.plan && /palette|color|theme|add section|pricing|faq|revise/i.test(prompt);

      if (isRevisionRequest && preview.plan) {
        const revisedPlan = await reviseSitePlan(preview.plan, prompt);

        const assistantMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `I have revised the website plan for "${revisedPlan.title}" to version ${revisedPlan.version}. The preview canvas on the right has been updated with your new design tokens and sections.`,
          timestamp: new Date().toISOString(),
          status: 'success',
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setPreview((prev) => ({
          ...prev,
          isLoading: false,
          activeView: 'plan',
          plan: revisedPlan,
          lastUpdated: new Date().toISOString(),
        }));

        setActiveTask((prev) => (prev ? { ...prev, status: 'completed' } : undefined));
        return;
      }

      if (isPlanRequest && !/inspect|read/i.test(prompt)) {
        const siteTitleMatch = prompt.match(/for (a |an )?([a-z0-9\s-]+?)( site| website| agency| store|$)/i);
        const derivedTitle = siteTitleMatch ? siteTitleMatch[2].trim() : 'Planned WordPress Site';

        const generatedPlan = await generateSitePlan(prompt, derivedTitle);

        const assistantMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: `I've generated a comprehensive, structured website plan for "${generatedPlan.title}". It includes a ${generatedPlan.designSystem.name} design system, sitemap with ${generatedPlan.pages.length} pages, responsive sections, and WCAG AA accessibility compliance. You can preview and navigate through the pages on the right canvas.`,
          timestamp: new Date().toISOString(),
          status: 'success',
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setPreview((prev) => ({
          ...prev,
          isLoading: false,
          activeView: 'plan',
          plan: generatedPlan,
          selectedPlanPageSlug: 'home',
          lastUpdated: new Date().toISOString(),
        }));

        setActiveTask((prev) => (prev ? { ...prev, status: 'completed' } : undefined));
        return;
      }

      // 3. WP Agent Read-Only Mode
      if (currentMode === 'agent') {
        const response = await sendAgentMessage(prompt, currentSite, false, controller.signal);

        const assistantMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: response.content,
          timestamp: new Date().toISOString(),
          status: response.status,
          targetSite: currentSite,
          executedTools: response.executedTools,
          error:
            response.status === 'error'
              ? response.message || 'Tool execution encountered an error'
              : undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        const extracted = extractPreviewData(response.executedTools);
        if (extracted.page) {
          setPreview((prev) => ({
            ...prev,
            isLoading: false,
            activeView: 'page',
            pageData: extracted.page,
            errorMessage: undefined,
            lastUpdated: new Date().toISOString(),
          }));
        } else if (extracted.site) {
          setPreview((prev) => ({
            ...prev,
            isLoading: false,
            activeView: 'site',
            siteData: extracted.site,
            errorMessage: undefined,
            lastUpdated: new Date().toISOString(),
          }));
        } else {
          setPreview((prev) => ({ ...prev, isLoading: false }));
        }

        setActiveTask((prev) =>
          prev
            ? {
                ...prev,
                status: response.status === 'success' ? 'completed' : 'failed',
                steps: prev.steps.map((s) => ({ ...s, status: 'completed' })),
              }
            : undefined
        );
      } else {
        // Direct pure AI chat (model without tools)
        const content = await sendPureChatMessage(prompt, controller.signal);

        if (!content.trim()) {
          throw new Error('The model returned an empty response. Try again or switch models.');
        }

        const assistantMessage: ChatMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
          status: 'success',
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setPreview((prev) => ({ ...prev, isLoading: false }));

        setActiveTask((prev) =>
          prev
            ? {
                ...prev,
                status: 'completed',
                steps: prev.steps.map((s) => ({ ...s, status: 'completed' })),
              }
            : undefined
        );
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Aborted by stop button
        return;
      }

      const errorMsg = (err as Error).message || 'Request failed';
      const errorMessage: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: 'I couldn’t complete that request.',
        timestamp: new Date().toISOString(),
        status: 'error',
        error: errorMsg,
      };

      setMessages((prev) => [...prev, errorMessage]);
      // A chat failure must not replace the canvas with an error state.
      setPreview((prev) => ({
        ...prev,
        isLoading: false,
      }));

      setActiveTask((prev) =>
        prev
          ? {
              ...prev,
              status: 'failed',
              error: errorMsg,
              steps: prev.steps.map((s) =>
                s.status === 'running' ? { ...s, status: 'failed', error: errorMsg } : s
              ),
            }
          : undefined
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      setPreview((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Sequential queue progression: run next queued prompt once previous completes
  useEffect(() => {
    if (!isLoading && queuedTasks.length > 0) {
      const nextTask = queuedTasks[0];
      setQueuedTasks((prev) => prev.slice(1));
      handleSendMessage(nextTask.prompt, nextTask.mode, nextTask.targetSite);
    }
  }, [isLoading, queuedTasks]);

  const handleTriggerInspect = () => {
    const slug = selectedSite.replace(/https?:\/\//, '').replace(/\.local$/, '');
    handleSendMessage(`Inspect the site ${slug} and report its name, version, and status.`);
  };

  const handleTriggerPageRead = (pageSlug: string) => {
    handleSendMessage(`Read and summarize the page ${pageSlug} from ${selectedSite}.`);
  };

  const handleSelectPlanPage = (slug: string) => {
    setPreview((prev) => ({
      ...prev,
      selectedPlanPageSlug: slug,
    }));
  };

  const handleClearChat = () => {
    if (messages.length > 0) {
      const activeId = chatHistory.activeConversationId;
      const existing = chatHistory.conversations.find((item) => item.id === activeId);
      const conversation = existing
        ? { ...existing, updatedAt: new Date().toISOString(), messages: toPersistedChatHistory(messages) }
        : createChatConversation(messages);
      setChatHistory((history) => ({
        conversations: [
          ...history.conversations.filter((item) => item.id !== conversation.id),
          conversation,
        ].slice(-50),
        activeConversationId: null,
      }));
    }
    setMessages([]);
    setActiveTask(undefined);
    setQueuedTasks([]);
    setPreview((prev) => ({
      ...prev,
      activeView: 'welcome',
      siteData: undefined,
      pageData: undefined,
      plan: undefined,
      proposal: undefined,
      appliedPost: undefined,
      errorMessage: undefined,
    }));
  };

  const handleResumeConversation = (conversation: PersistedChatConversation) => {
    setChatHistory((history) => ({
      ...history,
      activeConversationId: conversation.id,
    }));
    setMessages(fromPersistedChatHistory(conversation.messages));
    setActiveTask(undefined);
    setQueuedTasks([]);
  };

  const handleDeleteConversation = (conversationId: string) => {
    const isActive = chatHistory.activeConversationId === conversationId;
    setChatHistory((history) => ({
      conversations: history.conversations.filter((item) => item.id !== conversationId),
      activeConversationId: isActive ? null : history.activeConversationId,
    }));
    if (isActive) setMessages([]);
  };

  const handleClearConversationHistory = () => {
    if (!window.confirm('Delete all saved conversations? This cannot be undone.')) return;
    setChatHistory({ conversations: [], activeConversationId: null });
    setMessages([]);
  };

  // Determine if there's an active publish proposal pending confirmation
  const hasActivePublishProposal = Boolean(activePublishProposal);

  // Find the most recent applied post ID for the header publish button
  const latestAppliedPostId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].appliedPost?.status !== 'publish') {
        return messages[i].appliedPost?.id ?? null;
      }
    }
    return null;
  })();

  // Lovable prominent Publish button handler
  const handlePublishClick = async () => {
    if (preview.builderProposal && !preview.builderProposal.isApplied) {
      await handleApproveBuilderProposal(preview.builderProposal);
      return;
    }
    if (preview.proposal && !preview.proposal.isApplied) {
      await handleApproveProposal(preview.proposal);
      return;
    }
    if (latestAppliedPostId != null) {
      await handlePublishNow(latestAppliedPostId);
      return;
    }
    handleSendMessage('Create an authentication card for Hearth & Clay with email and password');
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-paper text-ink">
      {/* Top Header — Lovable-style slim bar */}
      <Header
        selectedSite={selectedSite}
        onSelectSite={setSelectedSite}
        availableSites={AVAILABLE_SITES}
        viewport={viewport}
        onViewportChange={setViewport}
        apiConnected={apiConnected}
        agentMode={agentMode}
        onAgentModeChange={setAgentMode}
        capabilities={capabilities}
        showSignOut={showSignOut}
        onPublish={handlePublishClick}
        activePublishProposal={hasActivePublishProposal}
        activeCanvasTab={activeCanvasTab}
        onCanvasTabChange={setActiveCanvasTab}
        currentRoute={currentRoute}
        canPublish={true}
      />

      {/* Main Split-Screen Workspace — Lovable-style flex-row */}
      <div className="flex-1 flex flex-row overflow-hidden">
        {/* Left: Chat panel — fixed 420px wide */}
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          activeTask={activeTask}
          queuedTasks={queuedTasks}
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
          conversations={chatHistory.conversations}
          activeConversationId={chatHistory.activeConversationId}
          historyError={historyError}
          isHistoryReady={historyReady}
          onResumeConversation={handleResumeConversation}
          onDeleteConversation={handleDeleteConversation}
          onClearConversationHistory={handleClearConversationHistory}
          selectedSite={selectedSite}
          onSelectSite={setSelectedSite}
          availableSites={AVAILABLE_SITES}
          agentMode={agentMode}
          onAgentModeChange={setAgentMode}
          onStopTask={handleStopTask}
          onRemoveQueuedTask={handleRemoveQueuedTask}
          onApproveProposal={handleApproveProposal}
          onRejectProposal={handleRejectProposal}
          onApproveBuilderProposal={handleApproveBuilderProposal}
          onRejectBuilderProposal={handleRejectBuilderProposal}
          onPreviewDraft={handlePreviewDraft}
          onStartRevise={handleStartRevise}
          onPublishNow={handlePublishNow}
          onKeepAsDraft={handleKeepAsDraft}
          activePublishProposal={activePublishProposal}
          onApprovePublish={handleApprovePublish}
          onCancelPublish={handleCancelPublish}
          isPublishing={isPublishing}
        />

        {/* Right: Preview canvas — flex-1 fills remaining space */}
        <PreviewCanvas
          preview={preview}
          onTriggerInspect={handleTriggerInspect}
          onTriggerPageRead={handleTriggerPageRead}
          onSelectPlanPage={handleSelectPlanPage}
          onApproveProposal={handleApproveProposal}
          onRejectProposal={handleRejectProposal}
          onApproveBuilderProposal={handleApproveBuilderProposal}
          onRejectBuilderProposal={handleRejectBuilderProposal}
          onRefreshPost={handleRefreshPost}
          onPublishNow={handlePublishNow}
          onStartRevise={(postId, title) =>
            handleStartRevise(postId, title, 'Improve and expand the draft content')
          }
          activeCanvasTab={activeCanvasTab}
          onCanvasTabChange={(tab) => {
            setActiveCanvasTab(tab);
            // Refresh site content when the live view opens.
            if (tab === 'live') {
              handleFetchPageSections(targetPageId);
              void handleFetchSitePages();
            }
          }}
          livePages={sitePages}
          onRefreshPages={handleFetchSitePages}
          currentRoute={currentRoute}
          selectedSectionId={selectedSectionId}
          onSelectSection={handleSelectSection}
          availableSections={availableSections}
        />
      </div>
    </div>
  );
}

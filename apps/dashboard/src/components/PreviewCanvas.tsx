'use client';

import React, { useState, useCallback } from 'react';
import { DraftProposal, BuilderProposal, PreviewState } from '../lib/types';
import { Section } from '@wp-agent/contracts';

interface PreviewCanvasProps {
  preview: PreviewState;
  onTriggerInspect: () => void;
  onTriggerPageRead: (slug: string) => void;
  onSelectPlanPage?: (slug: string) => void;
  onApproveProposal?: (proposal: DraftProposal) => void;
  onRejectProposal?: (proposal: DraftProposal) => void;
  onApproveBuilderProposal?: (proposal: BuilderProposal) => void;
  onRejectBuilderProposal?: (proposal: BuilderProposal) => void;
  onRefreshPost?: (postId: number) => void;
  onPublishNow?: (postId: number) => void;
  onStartRevise?: (postId: number, currentTitle: string) => void;
  activeCanvasTab?: 'preview' | 'live' | 'code';
  onCanvasTabChange?: (tab: 'preview' | 'live' | 'code') => void;
  currentRoute?: string;
}

export function PreviewCanvas({
  preview,
  onTriggerInspect,
  onTriggerPageRead,
  onSelectPlanPage,
  onApproveProposal,
  onRejectProposal,
  onApproveBuilderProposal,
  onRejectBuilderProposal,
  onRefreshPost,
  onPublishNow,
  onStartRevise,
  activeCanvasTab = 'preview',
  onCanvasTabChange,
  currentRoute = '/',
}: PreviewCanvasProps) {
  const {
    targetSite,
    viewport,
    isLoading,
    activeView,
    siteData,
    pageData,
    plan,
    selectedPlanPageSlug,
    proposal,
    builderProposal,
    appliedPost,
    verifiedResource,
    errorMessage,
  } = preview;

  const [activeTab, setActiveTab] = useState<'preview' | 'design-tokens' | 'seo-a11y'>('preview');
  const [approving, setApproving] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);

  const refreshIframe = useCallback(() => setIframeKey((k) => k + 1), []);

  const handleApprove = async () => {
    if (!proposal || !onApproveProposal) return;
    setApproving(true);
    try {
      await onApproveProposal(proposal);
    } finally {
      setApproving(false);
    }
  };

  const handleApproveBuilder = async () => {
    if (!builderProposal || !onApproveBuilderProposal) return;
    setApproving(true);
    try {
      await onApproveBuilderProposal(builderProposal);
    } finally {
      setApproving(false);
    }
  };

  // Viewport width constraints for the canvas container
  const viewportStyle: React.CSSProperties =
    viewport === 'tablet'
      ? { maxWidth: '768px', margin: '20px auto', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0' }
      : viewport === 'mobile'
      ? { maxWidth: '375px', margin: '20px auto', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)', border: '2px solid #cbd5e1' }
      : { width: '100%', height: '100%' };

  // Active page within the plan
  const activePlanPage =
    plan?.pages.find((p) => p.slug === (selectedPlanPageSlug || 'home')) ||
    plan?.pages[0];

  // Determine the verified/applied resource
  const res = verifiedResource || (appliedPost ? {
    id: appliedPost.id,
    title: appliedPost.title,
    slug: appliedPost.slug,
    status: appliedPost.status,
    content: proposal?.post.content || builderProposal?.renderedPreviewHtml || '',
    excerpt: proposal?.post.excerpt || '',
    editLink: appliedPost.editLink,
    targetSite,
    lastVerifiedAt: preview.lastUpdated || new Date().toISOString(),
    isLivePublished: appliedPost.status === 'publish',
  } : null);

  const isLive = res ? (res.status === 'publish' || res.isLivePublished) : false;

  // ── Address bar URL display ──
  const displayUrl =
    activeView === 'builder' && builderProposal
      ? `${targetSite}${currentRoute || '/'} (${builderProposal.builderType.toUpperCase()} Staged)`
      : activeView === 'proposal' && proposal
      ? `${targetSite}${currentRoute || '/'} (Staged Proposal)`
      : (activeView === 'applied' || activeView === 'verified_post') && res
      ? `${targetSite}/wp-admin/post.php?post=${res.id}&action=edit`
      : activeView === 'plan' && plan
      ? `http://plan.local/${activePlanPage?.slug || ''}`
      : pageData
      ? `${targetSite}/${pageData.slug}`
      : `${targetSite}${currentRoute || '/'}`;

  // Current serialized code content for Code view
  const currentCode =
    builderProposal?.diff?.after
      ? (typeof builderProposal.diff.after === 'string'
          ? builderProposal.diff.after
          : JSON.stringify(builderProposal.diff.after, null, 2))
      : proposal?.post.content
      ? proposal.post.content
      : res?.content
      ? res.content
      : `<!-- WordPress Site: ${targetSite} -->\n<div class="site-wrapper">\n  <header>KPH SitePilot Workspace</header>\n  <main>Connected to ${targetSite}</main>\n</div>`;

  return (
    <main className="flex-1 h-full flex flex-col bg-[#f5f5f7] overflow-hidden select-none">
      {/* ── Sub-header: Lovable-style browser chrome bar ── */}
      <div className="h-10 border-b border-slate-200 bg-white px-4 flex items-center justify-between text-xs text-slate-500 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2 flex-1 max-w-2xl">
          {/* Window control dots */}
          <div className="flex items-center gap-1.5 mr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 hover:bg-rose-400 transition-colors" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 hover:bg-amber-400 transition-colors" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 hover:bg-emerald-400 transition-colors" />
          </div>

          {/* Route & Address pill */}
          <div className="flex-1 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-3 py-1 text-[11px] font-mono text-slate-600 shadow-inner">
            <span className="text-emerald-500">🔒</span>
            <span className="truncate">{displayUrl}</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded font-sans font-medium bg-slate-200 text-slate-700">
              {activeCanvasTab.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Right status badges & refresh */}
        <div className="flex items-center gap-2.5 ml-4">
          {isLoading && (
            <span className="text-[11px] text-indigo-600 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              Generating…
            </span>
          )}

          {/* Post ID & Status Badge */}
          {res && (
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                isLive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-amber-50 text-amber-700 border-amber-300'
              }`}
            >
              {isLive ? '● PUBLISHED LIVE' : '○ DRAFT'} #{res.id}
            </span>
          )}

          {/* Refresh preview */}
          <button
            onClick={refreshIframe}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            title="Reload canvas"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Proposal Amber/Sky Alert Banner (Unapproved Staged State) ── */}
      {proposal && !proposal.isApplied && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs text-amber-800 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <span>⚠️</span>
            <span>
              <strong>PREVIEW (NOT SAVED)</strong> — Staged changes for &ldquo;{proposal.post.title}&rdquo;. Click <strong>Publish</strong> at top right or approve below.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onRejectProposal && (
              <button
                onClick={() => onRejectProposal(proposal)}
                className="px-2.5 py-1 rounded bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 text-[11px] font-medium transition-colors"
              >
                Reject
              </button>
            )}
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition-all shadow-sm"
            >
              {approving ? 'Saving Draft…' : '✓ Approve & Save Draft'}
            </button>
          </div>
        </div>
      )}

      {builderProposal && !builderProposal.isApplied && (
        <div className="px-4 py-2 bg-sky-50 border-b border-sky-200 flex items-center justify-between text-xs text-sky-800 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <span>🧱</span>
            <span>
              <strong>PREVIEW (NOT SAVED)</strong> — Staged {builderProposal.builderType.toUpperCase()} content: &ldquo;{builderProposal.title}&rdquo;.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onRejectBuilderProposal && (
              <button
                onClick={() => onRejectBuilderProposal(builderProposal)}
                className="px-2.5 py-1 rounded bg-white hover:bg-sky-100 border border-sky-300 text-sky-800 text-[11px] font-medium transition-colors"
              >
                Reject
              </button>
            )}
            <button
              onClick={handleApproveBuilder}
              disabled={approving}
              className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition-all shadow-sm"
            >
              {approving ? 'Saving Draft…' : '✓ Approve & Save Draft'}
            </button>
          </div>
        </div>
      )}

      {/* ── Main Canvas Viewport Area ── */}
      <div className="flex-1 overflow-auto flex flex-col items-center justify-start p-4 relative bg-[#f8f7f4]">
        {/* TAB 1: VISUAL INTERACTIVE PREVIEW (Default & Primary Lovable View) */}
        {activeCanvasTab === 'preview' && (
          <div
            className="w-full h-full transition-all duration-300 flex flex-col justify-center items-center select-text"
            style={viewportStyle}
          >
            {/* If Builder Proposal is active */}
            {builderProposal && (
              <div className="w-full h-full bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-y-auto">
                <div
                  className="builder-canvas-preview text-slate-800"
                  dangerouslySetInnerHTML={{ __html: builderProposal.renderedPreviewHtml }}
                />
              </div>
            )}

            {/* If Post Proposal is active */}
            {!builderProposal && proposal && (
              <div className="w-full h-full bg-white rounded-xl shadow-lg border border-slate-200/80 p-8 overflow-y-auto max-w-3xl">
                <div className="border-b border-slate-100 pb-4 mb-6">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">Staged Draft Proposal</span>
                  <h1 className="text-3xl font-bold text-slate-900 mt-2">{proposal.post.title}</h1>
                  {proposal.post.excerpt && <p className="text-xs text-slate-500 mt-1 italic">&ldquo;{proposal.post.excerpt}&rdquo;</p>}
                </div>
                <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {proposal.post.content}
                </div>
              </div>
            )}

            {/* If Verified / Applied Post is active */}
            {!builderProposal && !proposal && res && (
              <div className="w-full h-full bg-white rounded-xl shadow-lg border border-slate-200/80 p-8 overflow-y-auto max-w-4xl space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {isLive ? 'Live WordPress Post' : 'Verified Draft Post'}
                    </span>
                    <h1 className="text-3xl font-bold text-slate-900 mt-2">{res.title}</h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={res.editLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors"
                    >
                      Open in WP Admin ↗
                    </a>
                  </div>
                </div>

                <div
                  className="prose prose-slate max-w-none text-slate-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: res.content }}
                />
              </div>
            )}

            {/* If Plan is active */}
            {!builderProposal && !proposal && !res && plan && (
              <div className="w-full h-full bg-white rounded-xl shadow-lg border border-slate-200/80 p-8 overflow-y-auto">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{plan.title}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plan.pages.map((pg) => (
                    <div key={pg.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                      <h3 className="font-bold text-slate-800 text-sm">{pg.title}</h3>
                      <p className="text-xs text-slate-500 mt-1">{pg.sections.length} interactive sections designed.</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Welcome / Empty Canvas State (matches Hearth & Clay demo preview!) */}
            {!builderProposal && !proposal && !res && !plan && (
              <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-stone-200/60 p-8 border border-stone-200/80 font-serif text-[#2c241e] text-center">
                <a href="#" className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition-colors font-sans mb-6">
                  <span>←</span> Back to store
                </a>
                <h2 className="text-2xl font-serif font-bold text-stone-900 tracking-tight">Hearth &amp; Clay</h2>
                <h3 className="text-lg font-serif font-medium text-stone-800 mt-2">Welcome back</h3>
                <p className="text-xs text-stone-500 font-sans mt-1">Enter your credentials to access your orders</p>

                <div className="space-y-4 font-sans text-xs mt-6 text-left">
                  <div>
                    <label className="block font-medium text-stone-700 mb-1.5">Email address</label>
                    <input
                      type="email"
                      defaultValue="you@example.com"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-stone-50/50 text-stone-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#a85a38]/30"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-stone-700 mb-1.5">Password</label>
                    <input
                      type="password"
                      defaultValue="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-stone-50/50 text-stone-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#a85a38]/30"
                    />
                  </div>
                  <button
                    onClick={() => alert('Simulated Sign In')}
                    className="w-full py-2.5 rounded-lg bg-[#a85a38] hover:bg-[#8f4a2c] text-white font-medium text-xs shadow-md shadow-[#a85a38]/20 transition-all mt-2"
                  >
                    Sign In
                  </button>
                  <div className="text-center pt-2 text-[11px] text-stone-500">
                    Don&apos;t have an account? <span className="text-[#a85a38] font-medium cursor-pointer">Sign up</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LIVE WORDPRESS SITE IFRAME */}
        {activeCanvasTab === 'live' && (
          <div className="w-full h-full transition-all duration-300 flex justify-center items-start" style={viewportStyle}>
            <iframe
              key={iframeKey}
              src={targetSite}
              className="w-full h-full border-0 min-h-[600px] bg-white rounded-xl shadow-md"
              title="Live WordPress Site Preview"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        )}

        {/* TAB 3: CODE & DIFF VIEW */}
        {activeCanvasTab === 'code' && (
          <div className="w-full max-w-4xl h-full bg-slate-900 rounded-xl shadow-xl border border-slate-800 flex flex-col overflow-hidden text-slate-200">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-950/80">
              <span className="text-xs font-mono text-slate-400">Gutenberg Block / HTML Representation</span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(currentCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors"
              >
                {copiedCode ? '✓ Copied' : 'Copy Code'}
              </button>
            </div>
            <pre className="flex-1 p-6 font-mono text-xs overflow-auto text-emerald-400 whitespace-pre-wrap leading-relaxed select-text">
              {currentCode}
            </pre>
          </div>
        )}

        {/* ── Floating Bottom Dock Toolbar (Exactly like Lovable screenshot!) ── */}
        <div className="fixed bottom-6 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-full shadow-2xl border border-slate-200/80 text-slate-600 text-xs font-medium">
          <button
            onClick={() => alert('Inspector activated: click elements to view attributes.')}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            title="Inspect Canvas"
          >
            📐
          </button>
          <button
            onClick={() => alert('Typography styles: Serif (Georgia), Sans (Inter).')}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            title="Typography"
          >
            🔤
          </button>
          <button
            onClick={() => {
              if (onStartRevise && (builderProposal || proposal || res)) {
                const id = res?.id || 1;
                const t = builderProposal?.title || proposal?.post.title || res?.title || 'Draft Content';
                onStartRevise(id, t);
              } else {
                alert('Type revision request in chat.');
              }
            }}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            title="Edit Staged Content"
          >
            ✏️
          </button>
          <div className="w-[1px] h-4 bg-slate-200 mx-1" />
          <button
            onClick={refreshIframe}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            title="Refresh Preview"
          >
            🔄
          </button>
        </div>
      </div>
    </main>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { DraftProposal, BuilderProposal, PreviewState, SitePageSummary } from '../lib/types';
import { RouteTree } from './RouteTree';

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
  selectedSectionId?: string;
  onSelectSection?: (sectionId: string) => void;
  availableSections?: Array<{ id: string; name: string }>;
  livePages?: SitePageSummary[];
  onRefreshPages?: () => void;
  targetPageId?: number;
  onSelectPage?: (page: SitePageSummary) => void;
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

export function PreviewCanvas({
  preview,
  onTriggerInspect,
  onTriggerPageRead,
  onSelectPlanPage,
  onApproveProposal,
  onRejectProposal,
  onApproveBuilderProposal,
  onRejectBuilderProposal,
  onStartRevise,
  activeCanvasTab = 'preview',
  onCanvasTabChange,
  currentRoute = '/',
  selectedSectionId = 'hero',
  onSelectSection,
  availableSections = [
    { id: 'hero', name: 'Hero' },
    { id: 'features', name: 'Features' },
    { id: 'metrics', name: 'Metrics' },
  ],
  livePages = [],
  onRefreshPages,
  targetPageId,
  onSelectPage,
}: PreviewCanvasProps) {
  const [treeOpen, setTreeOpen] = useState(false);
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

  const [approving, setApproving] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pageSlug, setPageSlug] = useState('');
  const [selectedLiveUrl, setSelectedLiveUrl] = useState(targetSite);

  useEffect(() => {
    setSelectedLiveUrl(targetSite);
  }, [targetSite]);

  const refreshIframe = useCallback(() => setIframeKey((value) => value + 1), []);

  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);

  // Keyboard navigation listener: Escape clears section selection
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedSectionId && selectedSectionId !== 'all') {
        onSelectSection?.('all');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSectionId, onSelectSection]);

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

  const viewportStyle: React.CSSProperties =
    viewport === 'tablet'
      ? {
          width: '768px',
          maxWidth: '100%',
          height: '100%',
          margin: '0 auto',
          borderRadius: '18px',
          overflow: 'hidden',
          border: '1px solid #d9d2c7',
          boxShadow: '0 1px 2px rgba(27,25,23,.05), 0 30px 60px -35px rgba(27,25,23,.45)',
        }
      : viewport === 'mobile'
      ? {
          width: '390px',
          maxWidth: '100%',
          height: '100%',
          margin: '0 auto',
          borderRadius: '28px',
          overflow: 'hidden',
          border: '1px solid #d9d2c7',
          boxShadow: '0 1px 2px rgba(27,25,23,.05), 0 30px 60px -35px rgba(27,25,23,.45)',
        }
      : { width: '100%', height: '100%' };

  const activePlanPage =
    plan?.pages.find((page) => page.slug === (selectedPlanPageSlug || 'home')) || plan?.pages[0];

  const res =
    verifiedResource ||
    (appliedPost
      ? {
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
        }
      : null);

  const isLive = res ? res.status === 'publish' || Boolean(res.isLivePublished) : false;

  const displayUrl =
    activeView === 'builder' && builderProposal
      ? `${targetSite}${currentRoute || '/'}`
      : activeView === 'proposal' && proposal
      ? `${targetSite}${currentRoute || '/'}`
      : (activeView === 'applied' || activeView === 'verified_post') && res
      ? `${targetSite}/wp-admin/post.php?post=${res.id}&action=edit`
      : activeView === 'plan' && plan
      ? `plan://${activePlanPage?.slug || 'home'}`
      : pageData
      ? `${targetSite}/${pageData.slug}`
      : `${targetSite}${currentRoute || '/'}`;
  const addressUrl = activeCanvasTab === 'live' ? selectedLiveUrl : displayUrl;

  const currentCode = builderProposal?.diff?.after
    ? typeof builderProposal.diff.after === 'string'
      ? builderProposal.diff.after
      : JSON.stringify(builderProposal.diff.after, null, 2)
    : proposal?.post.content
    ? proposal.post.content
    : res?.content
    ? res.content
    : `<!-- ${targetSite} -->\n<!-- Ask the agent to generate a page or draft a post. -->\n<div class="site-wrapper">\n  <main>Nothing staged yet.</main>\n</div>`;

  const canEdit = Boolean(res || proposal || builderProposal);

  return (
    <main className="hidden h-full min-w-0 flex-1 flex-col overflow-hidden bg-paper-deep md:flex">
      {/* Browser chrome */}
      <div className="glass z-10 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-paper-deep" />
            <span className="h-2.5 w-2.5 rounded-full bg-paper-deep" />
            <span className="h-2.5 w-2.5 rounded-full bg-paper-deep" />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-white/80 px-2.5 py-1.5 shadow-inner">
            <Icon d="M6 10V8a6 6 0 1112 0v2 M5 10h14v10H5z" className="h-3 w-3 shrink-0 text-emerald-600" />
            <span className="truncate font-mono text-[10.5px] text-ink-soft">{addressUrl}</span>
            <span className="ml-auto hidden shrink-0 rounded bg-paper-deep px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-muted sm:inline">
              {activeCanvasTab}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isLoading ? (
            <span className="hidden items-center gap-1.5 text-[10px] font-medium text-pink-600 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pink-500" />
              Generating
            </span>
          ) : null}

          {res ? (
            <span
              className={`hidden rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-semibold sm:inline ${
                isLive
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              {isLive ? 'LIVE' : 'DRAFT'} #{res.id}
            </span>
          ) : null}

          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                if (!onStartRevise) return;
                const id = res?.id ?? 0;
                const title = builderProposal?.title || proposal?.post.title || res?.title || 'Draft content';
                onStartRevise(id, title);
              }}
              className="focus-ring rounded-lg p-1.5 text-ink-muted transition hover:bg-white hover:text-ink"
              title="Revise staged content"
              aria-label="Revise staged content"
            >
              <Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" className="h-3.5 w-3.5" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setTreeOpen((prev) => !prev)}
            className={`focus-ring flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
              treeOpen
                ? 'border-pink-300 bg-pink-50/80 text-pink-700 shadow-sm'
                : 'border-line bg-white text-ink-soft hover:bg-paper-deep hover:text-ink'
            }`}
            title="Toggle Pages & Sections Tree"
            aria-label="Toggle Pages & Sections Tree"
            aria-expanded={treeOpen}
          >
            <Icon d="M4 6h16M4 12h10M4 18h14" className="h-3.5 w-3.5 text-pink-600" />
            <span className="hidden sm:inline">Routes</span>
          </button>

          <a
            href={targetSite}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring rounded-lg p-1.5 text-ink-muted transition hover:bg-white hover:text-ink"
            title="Open site in a new tab"
            aria-label="Open site in a new tab"
          >
            <Icon d="M7 17L17 7M9 7h8v8" className="h-3.5 w-3.5" />
          </a>

          <button
            type="button"
            onClick={refreshIframe}
            className="focus-ring rounded-lg p-1.5 text-ink-muted transition hover:bg-white hover:text-ink"
            title="Reload canvas"
            aria-label="Reload canvas"
          >
            <Icon d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {activeCanvasTab === 'live' ? (
        <div className="z-10 flex min-h-10 shrink-0 items-center gap-2 border-b border-line bg-white/80 px-3 py-1.5">
          <label htmlFor="live-page-select" className="shrink-0 text-[10px] font-semibold uppercase text-ink-muted">
            Page
          </label>
          <select
            id="live-page-select"
            value={selectedLiveUrl}
            onChange={(event) => setSelectedLiveUrl(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1.5 text-[11px] text-ink"
          >
            <option value={targetSite}>Site homepage · {targetSite}</option>
            {livePages.map((page) => (
              <option key={page.id} value={page.url}>
                {page.title} · {page.status}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onRefreshPages}
            className="focus-ring rounded-md p-1.5 text-ink-muted hover:bg-paper-deep hover:text-ink"
            title="Refresh page list"
            aria-label="Refresh page list"
          >
            <Icon d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" className="h-3.5 w-3.5" />
          </button>
          <details className="relative shrink-0">
            <summary className="cursor-pointer rounded-md border border-line bg-white px-2 py-1.5 text-[10px] font-medium text-ink-soft">
              All URLs ({livePages.length})
            </summary>
            <div className="absolute right-0 top-full z-30 mt-1 max-h-64 w-[min(560px,80vw)] overflow-y-auto rounded-md border border-line bg-white p-1 shadow-lift">
              {livePages.length ? livePages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => setSelectedLiveUrl(page.url)}
                  className="block w-full border-b border-line px-2.5 py-2 text-left last:border-b-0 hover:bg-paper"
                >
                  <span className="block text-[11px] font-medium text-ink">
                    {page.title} <span className="font-normal text-ink-muted">· {page.status}</span>
                  </span>
                  <span className="block break-all font-mono text-[10px] text-ink-muted">{page.url}</span>
                </button>
              )) : (
                <p className="px-2.5 py-2 text-[11px] text-ink-muted">No pages found for this site.</p>
              )}
            </div>
          </details>
        </div>
      ) : null}

      {/* Section scope */}
      {activeCanvasTab === 'preview' ? (
        <div className="no-scrollbar flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-white/60 px-3">
          <span className="mr-1 shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Scope
          </span>
          <button
            type="button"
            onClick={() => onSelectSection?.('all')}
            className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition ${
              !selectedSectionId || selectedSectionId === 'all'
                ? 'bg-ink text-white'
                : 'border border-line bg-white text-ink-soft hover:bg-paper-deep'
            }`}
          >
            Whole page
          </button>
          {availableSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelectSection?.(section.id)}
              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition ${
                selectedSectionId === section.id
                  ? 'bg-ink text-white'
                  : 'border border-line bg-white text-ink-soft hover:bg-paper-deep'
              }`}
            >
              {section.name}
            </button>
          ))}
          {selectedSectionId && selectedSectionId !== 'all' ? (
            <span className="ml-auto hidden shrink-0 rounded-md border border-line bg-white px-1.5 py-0.5 font-mono text-[9px] text-ink-muted lg:inline">
              chat targets “{selectedSectionId}”
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Staged banners */}
      {proposal && !proposal.isApplied ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <p className="min-w-0 truncate text-[11px] text-amber-800">
            <strong className="font-semibold">Staged draft.</strong> “{proposal.post.title}” is not saved yet.
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {onRejectProposal ? (
              <button
                type="button"
                onClick={() => onRejectProposal(proposal)}
                className="rounded-lg px-2.5 py-1 text-[10px] font-medium text-amber-800 transition hover:bg-amber-100"
              >
                Reject
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              {approving ? 'Saving…' : 'Approve & save'}
            </button>
          </div>
        </div>
      ) : null}

      {builderProposal && !builderProposal.isApplied ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-violet-200 bg-violet-50 px-3 py-2">
          <p className="min-w-0 truncate text-[11px] text-violet-800">
            <strong className="font-semibold">Staged {builderProposal.builderType}.</strong>{' '}
            “{builderProposal.title}” is not saved yet.
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {onRejectBuilderProposal ? (
              <button
                type="button"
                onClick={() => onRejectBuilderProposal(builderProposal)}
                className="rounded-lg px-2.5 py-1 text-[10px] font-medium text-violet-800 transition hover:bg-violet-100"
              >
                Reject
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleApproveBuilder}
              disabled={approving}
              className="rounded-lg bg-violet-600 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {approving ? 'Saving…' : 'Approve & save'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Canvas */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Collapsible RouteTree Sidebar */}
        {treeOpen ? (
          <aside className="w-64 shrink-0 border-r border-line bg-white/95 backdrop-blur-sm z-20 flex flex-col shadow-sm">
            <RouteTree
              targetSite={targetSite}
              selectedPageId={targetPageId}
              selectedSectionId={selectedSectionId}
              onSelectPage={(page) => {
                onSelectPage?.(page);
              }}
              onSelectSection={(_pageId, sectionId) => {
                onSelectSection?.(sectionId);
              }}
              className="h-full"
            />
          </aside>
        ) : null}

        <div className="dots-bg relative flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
        {activeCanvasTab === 'preview' ? (
          <div className="flex h-full w-full flex-col" style={viewportStyle}>
            {/* Visual Section Navigation Bar overlay when sections exist */}
            {availableSections && availableSections.length > 0 && (res || builderProposal) ? (
              <div
                className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-white/90 p-2 shadow-xs backdrop-blur-xs"
                role="region"
                aria-label="Visual Section Selection"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mr-1">
                  Visual Sections ({availableSections.length}):
                </span>
                <button
                  type="button"
                  onClick={() => onSelectSection?.('all')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                    !selectedSectionId || selectedSectionId === 'all'
                      ? 'bg-ink text-white shadow-xs'
                      : 'border border-line bg-paper-deep text-ink-soft hover:bg-paper hover:text-ink'
                  }`}
                  aria-pressed={!selectedSectionId || selectedSectionId === 'all'}
                >
                  Whole Page
                </button>
                {availableSections.map((sec) => {
                  const isSelected = selectedSectionId === sec.id;
                  const isHovered = hoveredSectionId === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => onSelectSection?.(sec.id)}
                      onMouseEnter={() => setHoveredSectionId(sec.id)}
                      onMouseLeave={() => setHoveredSectionId((prev) => (prev === sec.id ? null : prev))}
                      className={`group relative flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                        isSelected
                          ? 'border border-pink-400 bg-pink-50 text-pink-700 shadow-xs ring-2 ring-pink-500/20'
                          : isHovered
                          ? 'border border-line-strong bg-white text-ink shadow-xs'
                          : 'border border-line bg-white text-ink-soft hover:bg-paper-deep hover:text-ink'
                      }`}
                      aria-pressed={isSelected}
                      aria-label={`Select section ${sec.name}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-pink-500' : 'bg-line-strong'}`} />
                      <span>{sec.name}</span>
                      {isSelected ? (
                        <span className="ml-1 rounded bg-pink-100 px-1 py-0.2 text-[9px] font-semibold text-pink-700">
                          Active
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {selectedSectionId && selectedSectionId !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => onSelectSection?.('all')}
                    className="ml-auto text-[10px] font-medium text-ink-muted hover:text-ink hover:underline"
                    title="Press Escape to clear selection"
                  >
                    Clear (Esc)
                  </button>
                ) : null}
              </div>
            ) : null}

            {builderProposal ? (
              <div
                className={`relative h-full w-full overflow-y-auto rounded-xl border bg-white shadow-lift transition ${
                  selectedSectionId && selectedSectionId !== 'all'
                    ? 'border-pink-300 ring-2 ring-pink-500/10'
                    : 'border-line'
                }`}
                tabIndex={0}
                role="region"
                aria-label={`Preview Canvas: ${selectedSectionId !== 'all' ? selectedSectionId : 'Full Page'}`}
              >
                {selectedSectionId && selectedSectionId !== 'all' ? (
                  <div className="sticky top-2 right-2 z-10 m-2 flex items-center justify-between rounded-lg border border-pink-200 bg-pink-50/95 px-3 py-1.5 shadow-sm backdrop-blur-xs">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-pink-700">
                      <span className="h-2 w-2 rounded-full bg-pink-500" />
                      Section Scope: #{selectedSectionId}
                    </span>
                    <span className="text-[10.5px] text-pink-600/80">
                      Chat instructions will target this section • Press Esc to clear
                    </span>
                  </div>
                ) : null}
                <div
                  className="builder-canvas-preview text-ink p-4"
                  dangerouslySetInnerHTML={{ __html: builderProposal.renderedPreviewHtml }}
                />
              </div>
            ) : proposal ? (
              <article className="mx-auto h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-lift sm:p-9">
                <div className="border-b border-line pb-4">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Staged draft
                  </span>
                  <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                    {proposal.post.title}
                  </h1>
                  {proposal.post.excerpt ? (
                    <p className="mt-1 text-[12px] italic text-ink-muted">“{proposal.post.excerpt}”</p>
                  ) : null}
                </div>
                <div className="mt-5 whitespace-pre-wrap text-[13.5px] leading-7 text-ink-soft">
                  {proposal.post.content}
                </div>
              </article>
            ) : res ? (
              <article
                className={`mx-auto h-full w-full max-w-4xl overflow-y-auto rounded-2xl border bg-white p-6 shadow-lift sm:p-9 transition ${
                  selectedSectionId && selectedSectionId !== 'all'
                    ? 'border-pink-300 ring-2 ring-pink-500/10'
                    : 'border-line'
                }`}
                tabIndex={0}
                role="region"
                aria-label={`Verified Draft: ${selectedSectionId !== 'all' ? selectedSectionId : 'Full Page'}`}
              >
                {selectedSectionId && selectedSectionId !== 'all' ? (
                  <div className="sticky top-0 z-10 -mt-2 mb-4 flex items-center justify-between rounded-lg border border-pink-200 bg-pink-50/95 px-3 py-1.5 shadow-sm backdrop-blur-xs">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-pink-700">
                      <span className="h-2 w-2 rounded-full bg-pink-500" />
                      Section Scope: #{selectedSectionId}
                    </span>
                    <span className="text-[10.5px] text-pink-600/80">
                      Chat instructions will target this section • Press Esc to clear
                    </span>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                  <div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        isLive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {isLive ? 'Live on WordPress' : 'Verified draft'}
                    </span>
                    <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                      {res.title}
                    </h1>
                  </div>
                  <a
                    href={res.editLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition hover:bg-paper-deep"
                  >
                    Open in WP Admin
                    <Icon d="M7 17L17 7M9 7h8v8" className="h-3 w-3" />
                  </a>
                </div>
                <div
                  className="prose prose-stone mt-5 max-w-none text-[13.5px] leading-7 text-ink-soft"
                  dangerouslySetInnerHTML={{ __html: res.content }}
                />
              </article>
            ) : plan ? (
              <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-lift sm:p-8">
                <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                  Site plan
                </span>
                <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-ink">{plan.title}</h2>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {plan.pages.length} page{plan.pages.length === 1 ? '' : 's'} planned. Select one to focus the
                  canvas.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {plan.pages.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => onSelectPlanPage?.(page.slug)}
                      className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                        activePlanPage?.slug === page.slug
                          ? 'border-pink-200 bg-pink-50/50'
                          : 'border-line bg-paper/60'
                      }`}
                    >
                      <div className="text-[13px] font-medium text-ink">{page.title}</div>
                      <div className="mt-0.5 text-[10.5px] text-ink-muted">
                        {page.sections.length} section{page.sections.length === 1 ? '' : 's'}
                      </div>
                      <div className="mt-2 font-mono text-[9px] text-ink-muted">/{page.slug}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : errorMessage ? (
              <div className="mx-auto mt-10 w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-lift">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                  <Icon d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-[15px] font-semibold text-ink">Couldn&apos;t render this preview</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{errorMessage}</p>
              </div>
            ) : siteData ? (
              <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-lift sm:p-8">
                <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                  Site overview
                </span>
                <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-ink">{siteData.siteName}</h2>
                <a
                  href={siteData.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted transition hover:text-ink"
                >
                  {siteData.siteUrl}
                  <Icon d="M7 17L17 7M7 7h10v10" className="h-3 w-3" />
                </a>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-paper/60 p-3">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">WordPress</dt>
                    <dd className="mt-1 text-[14px] font-medium text-ink">{siteData.wpVersion}</dd>
                  </div>
                  <div className="rounded-xl border border-line bg-paper/60 p-3">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Active theme</dt>
                    <dd className="mt-1 text-[14px] font-medium text-ink">
                      {siteData.activeTheme ?? 'Not exposed by the REST API'}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-line bg-paper/60 p-3">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Builders</dt>
                    <dd className="mt-1 text-[14px] font-medium text-ink">
                      {[
                        siteData.capabilities?.gutenberg && 'Gutenberg',
                        siteData.capabilities?.elementor && 'Elementor',
                        siteData.capabilities?.acf && 'ACF',
                        siteData.capabilities?.woocommerce && 'WooCommerce',
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Core WordPress'}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-line bg-paper/60 p-3">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Status</dt>
                    <dd
                      className={`mt-1 text-[14px] font-medium ${
                        siteData.status === 'ok' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {siteData.status}
                    </dd>
                  </div>
                </dl>

                {siteData.plugins?.length ? (
                  <div className="mt-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Plugins</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {siteData.plugins.map((plugin) => (
                        <span
                          key={plugin}
                          className="rounded-full border border-line bg-paper px-2 py-1 text-[10.5px] text-ink-soft"
                        >
                          {plugin}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="mt-5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                  <Icon d="M20 6L9 17l-5-5" className="h-3.5 w-3.5 text-emerald-600" />
                  Inspected read-only. No changes were made.
                </p>
              </div>
            ) : (
              <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center py-8 text-center">
                <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg shadow-pink-500/20">
                  <Icon d="M3 5h18v14H3z M3 9h18 M7 13h4" className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-ink">Your canvas is ready</h2>
                <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
                  Ask the agent to build a page, draft a post, or inspect your site. Staged changes appear here
                  before anything is saved.
                </p>

                <div className="mt-5 w-full space-y-2">
                  <button
                    type="button"
                    onClick={onTriggerInspect}
                    className="flex w-full items-center justify-between rounded-xl border border-line bg-white px-3.5 py-2.5 text-left text-[12px] font-medium text-ink transition hover:border-line-strong hover:shadow-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Icon d="M12 21a9 9 0 100-18 9 9 0 000 18z M3.5 9h17M3.5 15h17" className="h-4 w-4 text-emerald-600" />
                      Inspect connected site
                    </span>
                    <Icon d="M9 6l6 6-6 6" className="h-3.5 w-3.5 text-ink-muted" />
                  </button>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!pageSlug.trim()) return;
                      onTriggerPageRead(pageSlug.trim());
                    }}
                    className="flex items-center gap-2 rounded-xl border border-line bg-white p-1.5 pl-3"
                  >
                    <Icon d="M4 5h16v14H4z M4 9h16" className="h-4 w-4 shrink-0 text-ink-muted" />
                    <input
                      value={pageSlug}
                      onChange={(event) => setPageSlug(event.target.value)}
                      placeholder="Read a page by slug…"
                      aria-label="Page slug to read"
                      className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-muted focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!pageSlug.trim()}
                      className="shrink-0 rounded-lg bg-ink px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-30"
                    >
                      Read
                    </button>
                  </form>
                </div>

                <p className="mt-4 flex items-center gap-1.5 text-[10px] text-ink-muted">
                  <Icon d="M12 3l7 3v5c0 4.4-3 8.4-7 9.5C8 19.4 5 15.4 5 11V6l7-3z" className="h-3 w-3 text-emerald-600" />
                  Nothing is published without your approval.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {activeCanvasTab === 'live' ? (
          <div className="flex h-full w-full flex-col justify-center" style={viewportStyle}>
            {/* Notice for cross-origin live iframe */}
            <div className="mb-2 flex items-center justify-between rounded-lg border border-line bg-white/90 px-3 py-1.5 text-[11px] text-ink-soft shadow-xs backdrop-blur-xs">
              <span className="flex items-center gap-1.5">
                <Icon d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="h-3.5 w-3.5 text-pink-600" />
                <span>Live view is rendered in an isolated sandbox. Use <strong>Preview</strong> mode or the <strong>Routes</strong> tree to visually select and edit block sections.</span>
              </span>
              <button
                type="button"
                onClick={() => onCanvasTabChange?.('preview')}
                className="ml-2 shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold text-pink-600 hover:bg-pink-50"
              >
                Switch to Preview
              </button>
            </div>
            <iframe
              key={iframeKey}
              src={selectedLiveUrl}
              className="h-full min-h-[500px] w-full rounded-xl border border-line bg-white shadow-lift"
              title="Live WordPress preview"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        ) : null}

        {activeCanvasTab === 'code' ? (
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-stone-800 bg-[#17161a] shadow-lift">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-400">
                Staged source
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(currentCode);
                  setCopiedCode(true);
                  window.setTimeout(() => setCopiedCode(false), 1800);
                }}
                className="rounded-md border border-white/10 px-2 py-1 font-mono text-[10px] text-stone-300 transition hover:bg-white/5"
              >
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 font-mono text-[11.5px] leading-6 text-emerald-300/90">
              {currentCode}
            </pre>
          </div>
        ) : null}
        </div>
      </div>
    </main>
  );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { SitePageSummary } from '../lib/types';
import { fetchPageSections, listSitePages, type PageSectionsResult } from '../lib/api-client';

export interface RouteTreeProps {
  targetSite: string;
  selectedPageId?: number;
  selectedSectionId?: string;
  onSelectPage?: (page: SitePageSummary) => void;
  onSelectSection?: (pageId: number, sectionId: string) => void;
  onReorderSections?: (pageId: number, sectionIds: string[]) => Promise<void> | void;
  reorderInFlight?: boolean;
  className?: string;
}

/** Show a performance warning above this count; allow staging up to the server hard limit. */
const REORDER_WARN_THRESHOLD = 100;
/** Must match the server-side MAX_SECTIONS guard in section-editor.ts. */
const REORDER_MAX_SECTIONS = 200;

type ReorderNotice = { tone: 'warning' | 'error' | 'info'; message: string };

function TreeIcon({ d, className = 'h-3.5 w-3.5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

export function RouteTree({
  targetSite,
  selectedPageId,
  selectedSectionId = 'all',
  onSelectPage,
  onSelectSection,
  onReorderSections,
  reorderInFlight = false,
  className = '',
}: RouteTreeProps) {
  const [pages, setPages] = useState<SitePageSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded pages set (which pages have their sections revealed)
  const [expandedPages, setExpandedPages] = useState<Record<number, boolean>>({});
  // Cached sections per page
  const [sectionsByPage, setSectionsByPage] = useState<Record<number, PageSectionsResult['sections']>>({});
  const [loadingSections, setLoadingSections] = useState<Record<number, boolean>>({});
  const [sectionErrors, setSectionErrors] = useState<Record<number, string | null>>({});
  const [reorderDraft, setReorderDraft] = useState<Record<number, string[]>>({});
  const [reorderNotices, setReorderNotices] = useState<Record<number, ReorderNotice | null>>({});

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSitePages(targetSite);
      setPages(res.pages || []);
    } catch (err) {
      setError((err as Error).message || 'Failed to load site pages');
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [targetSite]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const loadSections = useCallback(async (pageId: number) => {
    setLoadingSections((prev) => ({ ...prev, [pageId]: true }));
    setSectionErrors((prev) => ({ ...prev, [pageId]: null }));
    try {
      const res = await fetchPageSections(pageId, targetSite);
      setSectionsByPage((prev) => ({ ...prev, [pageId]: res.sections || [] }));
    } catch (err) {
      setSectionErrors((prev) => ({
        ...prev,
        [pageId]: (err as Error).message || 'Failed to load page sections',
      }));
    } finally {
      setLoadingSections((prev) => ({ ...prev, [pageId]: false }));
    }
  }, [targetSite]);

  const togglePageExpand = (pageId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedPages((prev) => {
      const nextState = !prev[pageId];
      if (nextState && !sectionsByPage[pageId] && !loadingSections[pageId]) {
        void loadSections(pageId);
      }
      return { ...prev, [pageId]: nextState };
    });
  };

  const handlePageClick = (page: SitePageSummary) => {
    onSelectPage?.(page);
    // If not already expanded, expand and fetch sections
    if (!expandedPages[page.id]) {
      setExpandedPages((prev) => ({ ...prev, [page.id]: true }));
      if (!sectionsByPage[page.id] && !loadingSections[page.id]) {
        void loadSections(page.id);
      }
    }
  };

  const handleSectionClick = (pageId: number, sectionId: string) => {
    const page = pages.find((item) => item.id === pageId);
    if (page) onSelectPage?.(page);
    onSelectSection?.(pageId, sectionId);
  };

  const setReorderNotice = (pageId: number, notice: ReorderNotice | null) => {
    setReorderNotices((prev) => ({ ...prev, [pageId]: notice }));
  };

  const moveSection = (pageId: number, index: number, direction: -1 | 1) => {
    const current = reorderDraft[pageId] || sectionsByPage[pageId]?.map((s) => s.id) || [];
    if (current.length === 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= current.length) return;

    // Hard guard: never stage beyond the server's supported maximum.
    const pageSectionCount = sectionsByPage[pageId]?.length || current.length;
    if (pageSectionCount > REORDER_MAX_SECTIONS) {
      setReorderNotice(pageId, {
        tone: 'error',
        message: `This page has ${pageSectionCount} sections, above the supported maximum of ${REORDER_MAX_SECTIONS}. Reordering is disabled to protect page integrity.`,
      });
      return;
    }

    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);

    // Safety check: the resulting order must always be a permutation of the original.
    if (new Set(next).size !== next.length) {
      setReorderNotice(pageId, {
        tone: 'error',
        message: 'Invalid section order — discard the draft and try again.',
      });
      return;
    }

    setReorderDraft((prev) => ({ ...prev, [pageId]: next }));

    // Non-blocking performance hint for very large pages (still allowed up to the hard limit).
    setReorderNotice(
      pageId,
      pageSectionCount > REORDER_WARN_THRESHOLD
        ? {
            tone: 'warning',
            message: `Large page: ${pageSectionCount} sections. Reordering still works, but staging may take longer.`,
          }
        : null
    );
  };

  const discardReorder = (pageId: number) => {
    setReorderDraft((prev) => {
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
    setReorderNotice(pageId, null);
  };

  const stageReorder = async (pageId: number) => {
    const draft = reorderDraft[pageId];
    if (!draft || !onReorderSections) return;
    if (draft.length > REORDER_MAX_SECTIONS) {
      setReorderNotice(pageId, {
        tone: 'error',
        message: `Cannot stage ${draft.length} sections — the maximum is ${REORDER_MAX_SECTIONS}.`,
      });
      return;
    }
    try {
      await onReorderSections(pageId, draft);
      // Only clear the draft once staging succeeded; keep it on failure so the user can retry.
      setReorderDraft((prev) => {
        const next = { ...prev };
        delete next[pageId];
        return next;
      });
      setReorderNotice(pageId, null);
    } catch (err) {
      setReorderNotice(pageId, {
        tone: 'error',
        message: (err as Error).message || 'Failed to stage reorder. Your draft order was kept so you can retry.',
      });
    }
  };

  return (
    <div className={`flex flex-col text-[11px] text-ink ${className}`} data-testid="route-tree">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex items-center gap-1.5 font-semibold text-ink">
          <TreeIcon d="M4 6h16M4 12h10M4 18h14" className="h-3.5 w-3.5 text-pink-600" />
          <span>Pages & Sections</span>
          {!loading && !error && (
            <span className="rounded-full bg-paper-deep px-1.5 py-0.2 text-[9.5px] font-mono text-ink-muted">
              {pages.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadPages()}
          disabled={loading}
          className="focus-ring rounded p-1 text-ink-muted hover:bg-paper-deep hover:text-ink disabled:opacity-50"
          title="Refresh tree"
          aria-label="Refresh pages and sections tree"
        >
          <TreeIcon d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Body content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-6 text-ink-muted" data-testid="route-tree-loading">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-pink-500 mb-2" />
            <span>Loading pages & routes…</span>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-rose-900" data-testid="route-tree-error">
            <div className="font-semibold mb-1 flex items-center gap-1.5">
              <TreeIcon d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" className="h-3.5 w-3.5 text-rose-600 shrink-0" />
              <span>Failed to load pages</span>
            </div>
            <p className="text-[10px] text-rose-800 break-words mb-2">{error}</p>
            <button
              type="button"
              onClick={() => void loadPages()}
              className="rounded bg-rose-100 px-2 py-1 text-[10px] font-medium text-rose-800 hover:bg-rose-200 transition"
            >
              Retry
            </button>
          </div>
        ) : pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-ink-muted" data-testid="route-tree-empty">
            <TreeIcon d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" className="h-6 w-6 text-ink-muted/50 mb-1" />
            <span className="font-medium text-ink">No pages found</span>
            <span className="text-[10px] mt-0.5">This site does not currently have any pages.</span>
          </div>
        ) : (
          <div className="space-y-0.5" data-testid="route-tree-list">
            {pages.map((page) => {
              const isSelected = selectedPageId === page.id;
              const isExpanded = Boolean(expandedPages[page.id]);
              const sections = sectionsByPage[page.id];
              const isLoadingSec = Boolean(loadingSections[page.id]);
              const secError = sectionErrors[page.id];

              return (
                <div key={page.id} className="rounded-lg border border-transparent transition">
                  {/* Page row */}
                  <div
                    onClick={() => handlePageClick(page)}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer select-none transition ${
                      isSelected
                        ? 'bg-ink text-white font-medium shadow-sm'
                        : 'hover:bg-paper-deep text-ink'
                    }`}
                    data-testid={`page-row-${page.id}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => togglePageExpand(page.id, e)}
                      className={`p-0.5 rounded hover:bg-black/10 transition ${isSelected ? 'text-white' : 'text-ink-muted'}`}
                      aria-label={isExpanded ? `Collapse ${page.title}` : `Expand ${page.title}`}
                    >
                      <TreeIcon
                        d="M9 5l7 7-7 7"
                        className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </button>

                    <TreeIcon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="h-3.5 w-3.5 shrink-0 opacity-70" />

                    <span className="min-w-0 flex-1 truncate">{page.title || `Page #${page.id}`}</span>

                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-mono shrink-0 uppercase ${
                        page.status === 'publish'
                          ? isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                          : isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {page.status}
                    </span>
                  </div>

                  {/* Section sub-items */}
                  {isExpanded && (
                    <div className="ml-5 border-l border-line pl-2 py-1 space-y-0.5" data-testid={`page-sections-${page.id}`}>
                      {isLoadingSec ? (
                        <div className="flex items-center gap-1.5 py-1 text-[10px] text-ink-muted">
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-line-strong border-t-pink-500" />
                          <span>Inspecting sections…</span>
                        </div>
                      ) : secError ? (
                        <div className="text-[10px] text-rose-700 py-1">
                          <span>{secError}</span>
                          <button
                            type="button"
                            onClick={() => void loadSections(page.id)}
                            className="ml-2 underline hover:text-rose-900"
                          >
                            Retry
                          </button>
                        </div>
                      ) : sections && sections.length > 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSectionClick(page.id, 'all')}
                            className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[10.5px] transition ${
                              isSelected && (!selectedSectionId || selectedSectionId === 'all')
                                ? 'bg-pink-100 text-pink-900 font-semibold'
                                : 'text-ink-soft hover:bg-paper-deep'
                            }`}
                            data-testid={`section-${page.id}-all`}
                          >
                            <TreeIcon d="M4 6h16M4 12h16M4 18h16" className="h-3 w-3 opacity-60 shrink-0" />
                            <span className="truncate">Entire page (all sections)</span>
                          </button>

                          <div aria-live="polite" data-testid={`reorder-notice-${page.id}`}>
                            {reorderNotices[page.id] ? (
                              <div
                                className={`mt-1 rounded border px-2 py-1 text-[9.5px] leading-tight ${
                                  reorderNotices[page.id]!.tone === 'error'
                                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                                    : reorderNotices[page.id]!.tone === 'warning'
                                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                                      : 'border-line bg-paper-deep text-ink-soft'
                                }`}
                                role={reorderNotices[page.id]!.tone === 'error' ? 'alert' : 'status'}
                              >
                                {reorderNotices[page.id]!.message}
                              </div>
                            ) : null}
                          </div>

                          {(() => {
                            const orderedIds = reorderDraft[page.id] || sections.map((s) => s.id);
                            const sectionMap = new Map(sections.map((s) => [s.id, s]));
                            const displaySections = orderedIds.map((id) => sectionMap.get(id)).filter(Boolean) as typeof sections;
                            const isDirty = Boolean(
                              reorderDraft[page.id] &&
                              JSON.stringify(reorderDraft[page.id]) !== JSON.stringify(sections.map((s) => s.id))
                            );
                            const canReorder = sections.length > 1;
                            return (
                              <>
                                {canReorder ? (
                                  <p className="px-1.5 pb-0.5 text-[9px] text-ink-muted" data-testid={`reorder-hint-${page.id}`}>
                                    Drag-free reorder: use ↑/↓ (or Alt+↑/↓ on a focused section). Changes stay local until you stage and approve.
                                  </p>
                                ) : null}
                                {displaySections.map((section, idx) => {
                                  const isSecActive = isSelected && selectedSectionId === section.id;
                                  return (
                                    <div
                                      key={section.id}
                                      className={`flex w-full items-center justify-between gap-1 rounded px-1.5 py-1 text-left text-[10.5px] transition ${
                                        isSecActive
                                          ? 'bg-pink-100 text-pink-900 font-semibold'
                                          : 'text-ink-soft hover:bg-paper-deep'
                                      }`}
                                      data-testid={`section-${page.id}-${section.id}`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => handleSectionClick(page.id, section.id)}
                                        onKeyDown={(e) => {
                                          if (!e.altKey) return;
                                          if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            moveSection(page.id, idx, -1);
                                          } else if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            moveSection(page.id, idx, 1);
                                          }
                                        }}
                                        className="flex items-center gap-1.5 min-w-0 flex-1 text-left focus-ring rounded"
                                        aria-label={`${section.name} — position ${idx + 1} of ${displaySections.length}. Alt+Arrow keys reorder.`}
                                      >
                                        <span className="w-3 shrink-0 text-right font-mono text-[9px] opacity-50">{idx + 1}</span>
                                        <TreeIcon d="M4 7h16M4 12h8m-8 5h12" className="h-3 w-3 opacity-60 shrink-0" />
                                        <span className="truncate">{section.name}</span>
                                        <span className="font-mono text-[9px] opacity-60 shrink-0">#{section.id}</span>
                                      </button>
                                      <div className="flex items-center gap-0.5">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveSection(page.id, idx, -1);
                                          }}
                                          disabled={idx === 0 || reorderInFlight}
                                          className="focus-ring rounded p-0.5 hover:bg-black/10 disabled:opacity-30"
                                          aria-label="Move section up"
                                          title={idx === 0 ? 'Already first' : 'Move up'}
                                        >
                                          <TreeIcon d="M18 15l-6-6-6 6" className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveSection(page.id, idx, 1);
                                          }}
                                          disabled={idx === displaySections.length - 1 || reorderInFlight}
                                          className="focus-ring rounded p-0.5 hover:bg-black/10 disabled:opacity-30"
                                          aria-label="Move section down"
                                          title={idx === displaySections.length - 1 ? 'Already last' : 'Move down'}
                                        >
                                          <TreeIcon d="M6 9l6 6 6-6" className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                {isDirty ? (
                                  <div className="mt-1 flex items-center gap-1" data-testid={`reorder-actions-${page.id}`}>
                                    <button
                                      type="button"
                                      onClick={() => discardReorder(page.id)}
                                      disabled={reorderInFlight}
                                      className="focus-ring rounded px-1.5 py-0.5 text-[9.5px] text-ink-muted hover:bg-paper-deep disabled:opacity-40"
                                    >
                                      Reset order
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void stageReorder(page.id)}
                                      disabled={reorderInFlight}
                                      className="focus-ring rounded bg-ink px-1.5 py-0.5 text-[9.5px] font-semibold text-white hover:bg-stone-800 disabled:opacity-40"
                                    >
                                      {reorderInFlight ? 'Staging…' : 'Stage reorder'}
                                    </button>
                                    <span className="text-[9px] text-ink-muted">Not applied yet — approval required.</span>
                                  </div>
                                ) : null}
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <div className="py-1 text-[10px] text-ink-muted italic">
                          No distinct block sections detected.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

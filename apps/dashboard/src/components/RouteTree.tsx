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
  className?: string;
}

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

                          {sections.map((section) => {
                            const isSecActive = isSelected && selectedSectionId === section.id;
                            return (
                              <button
                                key={section.id}
                                type="button"
                                onClick={() => handleSectionClick(page.id, section.id)}
                                className={`flex w-full items-center justify-between gap-1.5 rounded px-2 py-1 text-left text-[10.5px] transition ${
                                  isSecActive
                                    ? 'bg-pink-100 text-pink-900 font-semibold'
                                    : 'text-ink-soft hover:bg-paper-deep'
                                }`}
                                data-testid={`section-${page.id}-${section.id}`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <TreeIcon d="M4 7h16M4 12h8m-8 5h12" className="h-3 w-3 opacity-60 shrink-0" />
                                  <span className="truncate">{section.name}</span>
                                </div>
                                <span className="font-mono text-[9px] opacity-60 shrink-0">#{section.id}</span>
                              </button>
                            );
                          })}
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

'use client';

import React from 'react';
import { AgentMode, ViewportMode } from '../lib/types';
import { BuilderCapabilities } from '@wp-agent/contracts';
import { signOut } from '../app/auth/actions';

interface HeaderProps {
  selectedSite: string;
  onSelectSite?: (site: string) => void;
  availableSites?: Array<{ id: string; name: string; url: string }>;
  viewport: ViewportMode;
  onViewportChange: (viewport: ViewportMode) => void;
  apiConnected: boolean;
  agentMode: AgentMode;
  onAgentModeChange?: (mode: AgentMode) => void;
  capabilities?: BuilderCapabilities;
  showSignOut?: boolean;
  /** Called when the Publish button is clicked */
  onPublish?: () => void;
  /** Whether a publish proposal is actively being processed */
  activePublishProposal?: boolean;
  /** Active preview canvas mode tab */
  activeCanvasTab?: 'preview' | 'live' | 'code';
  onCanvasTabChange?: (tab: 'preview' | 'live' | 'code') => void;
  /** Current route / path being previewed */
  currentRoute?: string;
  /** Whether publish action is currently enabled */
  canPublish?: boolean;
}

export function Header({
  selectedSite,
  onSelectSite,
  availableSites,
  viewport,
  onViewportChange,
  apiConnected,
  agentMode,
  onAgentModeChange,
  capabilities,
  showSignOut = false,
  onPublish,
  activePublishProposal = false,
  activeCanvasTab = 'preview',
  onCanvasTabChange,
  currentRoute = '/',
  canPublish = true,
}: HeaderProps) {
  // Derive a short project/site name for the pill
  const sitePill = selectedSite
    .replace(/https?:\/\//, '')
    .replace(/\/$/, '');

  return (
    <header className="h-12 border-b border-slate-800 bg-[#12131a] px-3.5 flex items-center justify-between select-none shrink-0 z-20 gap-3 text-slate-200">
      {/* ── LEFT: Brand Logo + Project Selector ── */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center shadow-md font-bold text-white text-xs shrink-0">
          KP
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative group">
            <button
              className="flex items-center gap-1 text-xs font-semibold text-slate-100 hover:text-white transition-colors py-1 px-1.5 rounded hover:bg-slate-800/60"
              title="Select Project / Local Site"
            >
              <span className="truncate max-w-[130px] sm:max-w-[180px] font-sans">
                {sitePill === 'test.local' ? 'Hearth & Clay / test.local' : sitePill}
              </span>
              <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {availableSites && availableSites.length > 0 && onSelectSite && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 hidden group-hover:block z-50">
                <div className="text-[10px] uppercase font-mono text-slate-500 px-2 py-1">Available LocalWP Sites</div>
                {availableSites.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelectSite(s.url)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      selectedSite === s.url ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] font-mono text-slate-500">{s.url.replace(/https?:\/\//, '')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Small history icons like in Lovable screenshot */}
        <div className="hidden lg:flex items-center gap-1 text-slate-500 ml-1">
          <button className="p-1 rounded hover:bg-slate-800 hover:text-slate-300" title="Undo">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2m0 0l-3-3m3 3l3-3" />
            </svg>
          </button>
          <button className="p-1 rounded hover:bg-slate-800 hover:text-slate-300" title="Redo">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m0 0l3-3m-3 3l-3-3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── CENTER: Lovable-Style Mode Tabs & Route URL Bar ── */}
      <div className="flex items-center gap-2">
        {/* View Tabs: Preview | Live Site | Code */}
        {onCanvasTabChange && (
          <div className="flex items-center bg-[#1a1b24] p-0.5 rounded-lg border border-slate-800/90 shadow-inner">
            <button
              onClick={() => onCanvasTabChange('preview')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeCanvasTab === 'preview'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Preview</span>
            </button>

            <button
              onClick={() => onCanvasTabChange('live')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeCanvasTab === 'live'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Live WordPress Site Iframe"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="hidden sm:inline">Live Site</span>
            </button>

            <button
              onClick={() => onCanvasTabChange('code')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeCanvasTab === 'code'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Code & Diff View"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span className="hidden sm:inline">Code</span>
            </button>
          </div>
        )}

        {/* Route / URL input pill like `/auth` in Lovable screenshot */}
        <div className="hidden md:flex items-center gap-1.5 bg-[#171822] border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-400 font-mono">
          <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-slate-300 font-semibold">{currentRoute || '/'}</span>
          <a
            href={`${selectedSite}${currentRoute === '/' ? '' : currentRoute}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-300 ml-1"
            title="Open in new tab"
          >
            ↗
          </a>
        </div>
      </div>

      {/* ── RIGHT: Viewports, Share, Mode & Prominent PUBLISH Button ── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Device Viewport Selector */}
        <div
          className="hidden sm:flex items-center bg-[#171822] border border-slate-800 rounded-lg p-0.5"
          role="group"
          aria-label="Canvas Viewport"
        >
          <button
            onClick={() => onViewportChange('desktop')}
            className={`p-1 rounded transition-colors ${
              viewport === 'desktop' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500 hover:text-slate-200'
            }`}
            title="Desktop View (Full)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={() => onViewportChange('tablet')}
            className={`p-1 rounded transition-colors ${
              viewport === 'tablet' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500 hover:text-slate-200'
            }`}
            title="Tablet View (768px)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={() => onViewportChange('mobile')}
            className={`p-1 rounded transition-colors ${
              viewport === 'mobile' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500 hover:text-slate-200'
            }`}
            title="Mobile View (375px)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        {/* Share Button (Lovable screenshot) */}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(window.location.href);
            alert('Workspace URL copied to clipboard!');
          }}
          className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-medium transition-colors bg-[#171822]"
          title="Share workspace link"
        >
          Share
        </button>

        {/* Upgrade / Mode Pill (Lovable screenshot purple button) */}
        {onAgentModeChange ? (
          <button
            onClick={() => {
              const nextMode: AgentMode = agentMode === 'writes' ? 'agent' : agentMode === 'agent' ? 'chat' : 'writes';
              onAgentModeChange(nextMode);
            }}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border border-purple-500/40 text-purple-200 hover:text-white text-xs font-medium transition-all"
            title="Click to toggle agent mode"
          >
            <span>⚡</span>
            <span>{agentMode === 'writes' ? 'Controlled Writes' : agentMode === 'agent' ? 'Read-Only' : 'AI Chat'}</span>
          </button>
        ) : null}

        {/* ── TOP RIGHT: PROMINENT PUBLISH BUTTON (Like Lovable screenshot) ── */}
        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish || activePublishProposal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Publish live to WordPress (http://test.local)"
        >
          {activePublishProposal ? (
            <>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Publishing…</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span>Publish</span>
            </>
          )}
        </button>

        {/* Sign-out if configured */}
        {showSignOut && (
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:text-white"
            >
              Sign out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}

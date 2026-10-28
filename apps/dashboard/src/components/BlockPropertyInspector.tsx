'use client';

import React, { useEffect, useState } from 'react';
import type { PageSectionSummary } from '../lib/types';

export interface BlockPropertyInspectorProps {
  section?: PageSectionSummary;
  pageId: number;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onStageProposal?: (patch: Record<string, string | number | boolean>) => Promise<void>;
  isStaging?: boolean;
}

const ALIGN_OPTIONS = [
  { value: 'none', label: 'Default (None)' },
  { value: 'wide', label: 'Wide width' },
  { value: 'full', label: 'Full width' },
  { value: 'center', label: 'Align center' },
  { value: 'left', label: 'Align left' },
  { value: 'right', label: 'Align right' },
];

const PRESET_COLORS = [
  { value: '#0f172a', label: 'Slate 900 (#0f172a)' },
  { value: '#1e293b', label: 'Slate 800 (#1e293b)' },
  { value: '#2563eb', label: 'Blue 600 (#2563eb)' },
  { value: '#020617', label: 'Deep Black (#020617)' },
  { value: '#ffffff', label: 'Pure White (#ffffff)' },
  { value: '#f8fafc', label: 'Light Slate (#f8fafc)' },
  { value: '#edf7ed', label: 'Soft Green (#edf7ed)' },
];

const FONT_SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'x-large', label: 'Extra Large' },
  { value: '16px', label: '16px' },
  { value: '20px', label: '20px' },
  { value: '24px', label: '24px' },
  { value: '32px', label: '32px' },
  { value: '48px', label: '48px' },
];

const PADDING_OPTIONS = [
  { value: '0', label: 'None (0)' },
  { value: '8px', label: 'Compact (8px)' },
  { value: '16px', label: 'Medium (16px)' },
  { value: '24px', label: 'Comfortable (24px)' },
  { value: '32px', label: 'Spacious (32px)' },
  { value: '48px', label: 'Expanded (48px)' },
];

function formatAttributeLabel(key: string): string {
  return key
    .replace(/^style\./, '')
    .split(/[._]/)
    .map((part) => part.replace(/([a-z])([A-Z])/g, '$1 $2'))
    .join(' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAttributeValue(value: string | number | boolean): string {
  return typeof value === 'string' ? value : String(value);
}

export function BlockPropertyInspector({
  section,
  pageId,
  loading = false,
  error,
  onClose,
  onStageProposal,
  isStaging = false,
}: BlockPropertyInspectorProps) {
  const attributes = section?.attributes ?? {};

  // Local draft state for editable fields
  const [draftAlign, setDraftAlign] = useState<string>('none');
  const [draftBgColor, setDraftBgColor] = useState<string>('');
  const [draftTextColor, setDraftTextColor] = useState<string>('');
  const [draftFontSize, setDraftFontSize] = useState<string>('');
  const [draftPadding, setDraftPadding] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync draft values when selected section changes or initial attributes arrive
  useEffect(() => {
    if (!section) return;
    const initialAlign = String(attributes['align'] || 'none').toLowerCase();
    setDraftAlign(ALIGN_OPTIONS.some((o) => o.value === initialAlign) ? initialAlign : 'none');

    const initialBg = String(
      attributes['style.color.background'] || attributes['backgroundColor'] || ''
    );
    setDraftBgColor(initialBg);

    const initialText = String(
      attributes['style.color.text'] || attributes['textColor'] || ''
    );
    setDraftTextColor(initialText);

    const initialSize = String(
      attributes['style.typography.fontSize'] || attributes['fontSize'] || ''
    );
    setDraftFontSize(initialSize);

    const initialPad = String(attributes['style.spacing.padding'] || '');
    setDraftPadding(initialPad);

    setValidationError(null);
  }, [section?.id, section?.attributes]);

  // Compute diff against saved attributes
  const currentAlign = String(attributes['align'] || 'none').toLowerCase();
  const currentBg = String(attributes['style.color.background'] || attributes['backgroundColor'] || '');
  const currentText = String(attributes['style.color.text'] || attributes['textColor'] || '');
  const currentSize = String(attributes['style.typography.fontSize'] || attributes['fontSize'] || '');
  const currentPad = String(attributes['style.spacing.padding'] || '');

  const hasDraftChanges = Boolean(
    (draftAlign !== currentAlign && !(currentAlign === 'none' && !draftAlign)) ||
    (draftBgColor !== currentBg && draftBgColor.trim() !== currentBg.trim()) ||
    (draftTextColor !== currentText && draftTextColor.trim() !== currentText.trim()) ||
    (draftFontSize !== currentSize && draftFontSize.trim() !== currentSize.trim()) ||
    (draftPadding !== currentPad && draftPadding.trim() !== currentPad.trim())
  );

  const handleDiscard = () => {
    setDraftAlign(currentAlign);
    setDraftBgColor(currentBg);
    setDraftTextColor(currentText);
    setDraftFontSize(currentSize);
    setDraftPadding(currentPad);
    setValidationError(null);
  };

  const handleStage = async () => {
    if (!onStageProposal || !hasDraftChanges || isStaging) return;
    setValidationError(null);

    const patch: Record<string, string | number | boolean> = {};

    if (draftAlign !== currentAlign) {
      patch['align'] = draftAlign;
    }
    if (draftBgColor !== currentBg && draftBgColor.trim()) {
      patch['style.color.background'] = draftBgColor.trim();
    }
    if (draftTextColor !== currentText && draftTextColor.trim()) {
      patch['style.color.text'] = draftTextColor.trim();
    }
    if (draftFontSize !== currentSize && draftFontSize.trim()) {
      patch['style.typography.fontSize'] = draftFontSize.trim();
    }
    if (draftPadding !== currentPad && draftPadding.trim()) {
      patch['style.spacing.padding'] = draftPadding.trim();
    }

    try {
      await onStageProposal(patch);
    } catch (err: any) {
      setValidationError(err.message || 'Failed to stage section property proposal.');
    }
  };

  // Identify read-only attributes that aren't one of the directly editable properties
  const readOnlyAttributeEntries = Object.entries(attributes).filter(
    ([key]) =>
      key !== 'align' &&
      key !== 'backgroundColor' &&
      key !== 'textColor' &&
      key !== 'fontSize' &&
      key !== 'style.color.background' &&
      key !== 'style.color.text' &&
      key !== 'style.typography.fontSize' &&
      key !== 'style.spacing.padding'
  );

  return (
    <aside
      className="flex h-full w-72 shrink-0 flex-col border-l border-line bg-white shadow-sm"
      aria-label="Block property inspector"
      data-testid="block-property-inspector"
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-3.5 py-3 bg-paper/30">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[12px] font-semibold text-ink">Block properties</h2>
            {hasDraftChanges ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider text-amber-800">
                Draft
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[10px] text-ink-muted">Page #{pageId}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring rounded-md p-1 text-ink-muted hover:bg-paper-deep hover:text-ink"
          aria-label="Close block property inspector"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5 space-y-4">
        {loading ? (
          <p className="text-[11px] text-ink-muted" role="status">Loading block properties…</p>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800" role="alert">
            Could not load block properties: {error}
          </div>
        ) : !section ? (
          <p className="rounded-lg border border-line bg-paper/60 p-3 text-[11px] leading-relaxed text-ink-muted">
            Select a section in the canvas or Pages &amp; Sections tree to inspect and stage edits for its Gutenberg properties.
          </p>
        ) : (
          <>
            {/* Header / Meta */}
            <div className="border-b border-line pb-3">
              <p className="text-[12px] font-semibold text-ink">{section.name}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <code className="inline-block rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                  {section.blockName}
                </code>
                <span className="text-[10px] text-ink-muted">#{section.id}</span>
              </div>
              {section.excerpt ? (
                <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">{section.excerpt}</p>
              ) : null}
            </div>

            {/* Validation Error Message */}
            {validationError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[10.5px] text-rose-800" role="alert">
                {validationError}
              </div>
            ) : null}

            {/* Editable Properties Section */}
            <section aria-labelledby="inspector-editable-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 id="inspector-editable-heading" className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-pink-700">
                  Editable Controls
                </h3>
                <span className="text-[9px] text-ink-muted">Requires approval</span>
              </div>

              {/* Alignment */}
              <div>
                <label htmlFor="inspector-field-align" className="block text-[10px] font-medium text-ink-muted">
                  Alignment
                </label>
                <select
                  id="inspector-field-align"
                  value={draftAlign}
                  onChange={(e) => setDraftAlign(e.target.value)}
                  disabled={isStaging}
                  className="mt-1 block w-full rounded-md border border-line bg-white px-2 py-1 text-[11px] text-ink focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                >
                  {ALIGN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Background Color */}
              <div>
                <label htmlFor="inspector-field-bg" className="block text-[10px] font-medium text-ink-muted">
                  Background Color
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  <select
                    id="inspector-field-bg"
                    value={PRESET_COLORS.some((p) => p.value === draftBgColor) ? draftBgColor : (draftBgColor ? 'custom' : '')}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        setDraftBgColor(e.target.value);
                      }
                    }}
                    disabled={isStaging}
                    className="flex-1 rounded-md border border-line bg-white px-2 py-1 text-[11px] text-ink focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  >
                    <option value="">Default (None)</option>
                    {PRESET_COLORS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                    {draftBgColor && !PRESET_COLORS.some((p) => p.value === draftBgColor) ? (
                      <option value="custom">Custom ({draftBgColor})</option>
                    ) : null}
                  </select>
                  <input
                    type="text"
                    value={draftBgColor}
                    onChange={(e) => setDraftBgColor(e.target.value)}
                    placeholder="#RRGGBB"
                    disabled={isStaging}
                    className="w-20 rounded-md border border-line bg-white px-1.5 py-1 font-mono text-[10px] text-ink focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                    title="Hex color code"
                  />
                </div>
              </div>

              {/* Text Color */}
              <div>
                <label htmlFor="inspector-field-text" className="block text-[10px] font-medium text-ink-muted">
                  Text Color
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  <select
                    id="inspector-field-text"
                    value={PRESET_COLORS.some((p) => p.value === draftTextColor) ? draftTextColor : (draftTextColor ? 'custom' : '')}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        setDraftTextColor(e.target.value);
                      }
                    }}
                    disabled={isStaging}
                    className="flex-1 rounded-md border border-line bg-white px-2 py-1 text-[11px] text-ink focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  >
                    <option value="">Default (None)</option>
                    {PRESET_COLORS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                    {draftTextColor && !PRESET_COLORS.some((p) => p.value === draftTextColor) ? (
                      <option value="custom">Custom ({draftTextColor})</option>
                    ) : null}
                  </select>
                  <input
                    type="text"
                    value={draftTextColor}
                    onChange={(e) => setDraftTextColor(e.target.value)}
                    placeholder="#RRGGBB"
                    disabled={isStaging}
                    className="w-20 rounded-md border border-line bg-white px-1.5 py-1 font-mono text-[10px] text-ink focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                    title="Hex color code"
                  />
                </div>
              </div>

              {/* Font Size */}
              <div>
                <label htmlFor="inspector-field-fontsize" className="block text-[10px] font-medium text-ink-muted">
                  Font Size
                </label>
                <select
                  id="inspector-field-fontsize"
                  value={draftFontSize}
                  onChange={(e) => setDraftFontSize(e.target.value)}
                  disabled={isStaging}
                  className="mt-1 block w-full rounded-md border border-line bg-white px-2 py-1 text-[11px] text-ink focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                >
                  <option value="">Inherit / Theme default</option>
                  {FONT_SIZE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Padding */}
              <div>
                <label htmlFor="inspector-field-padding" className="block text-[10px] font-medium text-ink-muted">
                  Padding (Spacing)
                </label>
                <select
                  id="inspector-field-padding"
                  value={draftPadding}
                  onChange={(e) => setDraftPadding(e.target.value)}
                  disabled={isStaging}
                  className="mt-1 block w-full rounded-md border border-line bg-white px-2 py-1 text-[11px] text-ink focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                >
                  <option value="">Default (None)</option>
                  {PADDING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-line">
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={!hasDraftChanges || isStaging}
                  className="rounded px-2.5 py-1 text-[10.5px] font-medium text-ink-muted hover:bg-paper-deep hover:text-ink disabled:opacity-40"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleStage}
                  disabled={!hasDraftChanges || isStaging}
                  className="rounded-md bg-ink px-3 py-1 text-[10.5px] font-semibold text-white shadow-xs hover:bg-stone-800 disabled:opacity-40"
                >
                  {isStaging ? 'Staging…' : 'Stage proposal'}
                </button>
              </div>
            </section>

            {/* Read-Only Raw Attributes Section */}
            <section className="pt-3 border-t border-line" aria-labelledby="inspector-attributes-heading">
              <h3 id="inspector-attributes-heading" className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Other Block Attributes (Read-only)
              </h3>
              {readOnlyAttributeEntries.length > 0 ? (
                <dl className="mt-2 space-y-2">
                  {readOnlyAttributeEntries.map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-[9px] font-medium text-ink-muted">{formatAttributeLabel(key)}</dt>
                      <dd className="mt-0.5 break-words rounded-md bg-paper/70 px-2 py-1 font-mono text-[10px] text-ink">
                        {formatAttributeValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
                  No additional attributes exposed.
                </p>
              )}
            </section>

            <p className="rounded-lg border border-line bg-paper/60 p-2 text-[10px] leading-relaxed text-ink-muted">
              Property edits are staged as change proposals. WordPress is not modified until you review and explicitly click <strong>Approve &amp; save</strong>.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

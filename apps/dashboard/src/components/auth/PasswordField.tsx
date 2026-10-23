'use client';

import { useState } from 'react';

interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  hint,
  minLength,
  maxLength,
  required = true,
  value,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] font-medium text-ink-soft">
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="text-[10.5px] text-ink-muted">
            {hint}
          </span>
        ) : null}
      </div>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          required={required}
          aria-describedby={hintId}
          value={value}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          className="w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 pr-11 text-[13px] text-ink placeholder:text-ink-muted transition focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-ink-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
        >
          {visible ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.9 5.2A10.4 10.4 0 0112 5c5 0 9 4.5 9 7a11.8 11.8 0 01-2.2 3.2M6.2 6.4C3.9 8 2.2 10.4 2 12c0 2.5 4 7 10 7a10.6 10.6 0 004.2-.9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

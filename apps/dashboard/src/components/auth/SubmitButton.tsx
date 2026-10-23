'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
}

export function SubmitButton({ children, pendingLabel, variant = 'primary' }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  const base =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60';
  const styles =
    variant === 'primary'
      ? 'bg-ink text-white shadow-sm hover:bg-stone-800'
      : 'border border-line-strong bg-white text-ink-soft hover:border-ink-muted hover:text-ink';

  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${base} ${styles}`}>
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

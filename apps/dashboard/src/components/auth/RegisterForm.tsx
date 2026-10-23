'use client';

import { useState } from 'react';
import { signUp } from '../../app/auth/actions';
import { generatePassword } from '../../lib/auth/password';
import { PasswordField } from './PasswordField';
import { SubmitButton } from './SubmitButton';

interface RegisterFormProps {
  next: string;
}

export function RegisterForm({ next }: RegisterFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    const value = generatePassword();
    setPassword(value);
    setConfirmPassword(value);
    setGenerated(value);
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the value stays visible for manual copy.
      setCopied(false);
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (generated && value !== generated) setGenerated(null);
  };

  return (
    <form action={signUp} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="register-email" className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
          Email address
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-required="true"
          placeholder="you@example.com"
          className="w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-muted transition focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
        />
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleGenerate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-medium text-pink-700 transition hover:border-pink-300 hover:bg-pink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16 2.3 6.7L22 12l-6.7 2.3L13 21l-2.3-6.7L4 12l6.7-2.3L13 3Z" />
          </svg>
          Generate strong password
        </button>
      </div>

      <div aria-live="polite">
        {generated ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Generated password
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md border border-emerald-300 px-2 py-0.5 text-[10.5px] font-medium text-emerald-700 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <code className="mt-1.5 block break-all font-mono text-[13px] text-emerald-950">{generated}</code>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-emerald-700/80">
              Both password fields are filled. Copy it before submitting — it is not shown again after you leave this page.
            </p>
          </div>
        ) : null}
      </div>

      <PasswordField
        id="register-password"
        name="password"
        label="Password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        hint="12–128 characters"
        value={password}
        onChange={handlePasswordChange}
      />

      <PasswordField
        id="register-confirm-password"
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        value={confirmPassword}
        onChange={setConfirmPassword}
      />

      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}

'use client';

import { useState } from 'react';

interface DemoAccountCardProps {
  email: string;
  password: string;
}

/**
 * Local demo-account helper shown on the login page.
 *
 * Credentials come from server-side DEMO_ACCOUNT_EMAIL / DEMO_ACCOUNT_PASSWORD.
 * If either value is missing the login page does not render this card.
 * Never enable these values on a public production deployment.
 */
export function DemoAccountCard({ email, password }: DemoAccountCardProps) {
  const [revealed, setRevealed] = useState(true);
  const [copied, setCopied] = useState(false);
  const [filled, setFilled] = useState(false);

  function fillForm() {
    const emailInput = document.getElementById('login-email') as HTMLInputElement | null;
    const passwordInput = document.getElementById('login-password') as HTMLInputElement | null;

    if (!emailInput || !passwordInput) return;

    const setValue = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;

      if (setter) {
        setter.call(input, value);
      } else {
        input.value = value;
      }

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    setValue(emailInput, email);
    setValue(passwordInput, password);

    const submit = document.querySelector(
      'form button[type="submit"]'
    ) as HTMLButtonElement | null;
    submit?.focus();

    setFilled(true);
    window.setTimeout(() => setFilled(false), 4000);
  }

  async function copyCredentials() {
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-line bg-paper/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-100 text-pink-600">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
                aria-hidden="true"
              >
                <circle cx="8" cy="15" r="4" />
                <path d="M10.8 12.2L20 3M17 6l2 2M15 8l2 2" />
              </svg>
            </span>
            <h2 id="demo-account-title" className="text-[12px] font-semibold text-ink">
              Demo account
            </h2>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
            Local test account. Click “Use demo account” to fill the form, then press Sign in.
          </p>
        </div>
        <button
          type="button"
          onClick={copyCredentials}
          className="shrink-0 rounded-lg border border-line bg-white px-2 py-1 text-[10px] font-medium text-ink-soft transition hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <dl className="mt-3 grid gap-2 rounded-xl border border-line bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">Email</dt>
          <dd className="min-w-0 flex-1 break-all text-right font-mono text-[11px] leading-relaxed text-ink">
            {email}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">Password</dt>
          <dd className="flex min-w-0 flex-1 items-center justify-end gap-2 font-mono text-[11px] text-ink">
            <span className="break-all text-right" title={revealed ? password : undefined}>
              {revealed ? password : '•'.repeat(Math.min(password.length, 16))}
            </span>
            <button
              type="button"
              onClick={() => setRevealed((current) => !current)}
              aria-label={revealed ? 'Hide demo password' : 'Show demo password'}
              aria-pressed={revealed}
              className="shrink-0 text-[10px] font-medium text-pink-600 transition hover:text-pink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
            >
              {revealed ? 'Hide' : 'Show'}
            </button>
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={fillForm}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        Use demo account
      </button>

      {filled ? (
        <p role="status" className="mt-2 text-center text-[10.5px] font-medium text-emerald-700">
          Demo details filled. Press “Sign in”.
        </p>
      ) : null}

      <p className="mt-2 text-center text-[9.5px] text-ink-muted">
        Demo only — remove the demo env values before production.
      </p>
    </div>
  );
}

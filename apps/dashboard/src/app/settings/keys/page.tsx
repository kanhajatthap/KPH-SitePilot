'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type ByokProvider = 'gemini' | 'openrouter' | 'groq';

interface KeyView {
  provider: ByokProvider;
  label: string;
  placeholder: string;
  freeTierNote: string;
  defaultModel: string;
  configured: boolean;
  last4: string | null;
  status: 'active' | 'not_configured';
  updatedAt: string | null;
}

interface QuotaSpec {
  limit: number;
  windowSeconds: number;
}

interface KeysPayload {
  keys?: KeyView[];
  encryptionReady?: boolean;
  quotas?: Record<string, QuotaSpec>;
  message?: string;
}

export default function ModelKeysSettingsPage() {
  const [keys, setKeys] = useState<KeyView[]>([]);
  const [encryptionReady, setEncryptionReady] = useState<boolean>(true);
  const [quotas, setQuotas] = useState<Record<string, QuotaSpec> | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [verifyOnSave, setVerifyOnSave] = useState<Record<string, boolean>>({
    gemini: false,
    openrouter: false,
    groq: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, { kind: 'ok' | 'err'; text: string }>>({});

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/connector/keys', { cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as KeysPayload;
      if (!res.ok) {
        setKeys([]);
        setLoadError(body.message ?? 'Model keys could not be loaded.');
        return;
      }
      setKeys(body.keys ?? []);
      setEncryptionReady(body.encryptionReady !== false);
      setQuotas(body.quotas ?? null);
      setLoadError(null);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const setNotice = (provider: string, kind: 'ok' | 'err', text: string) => {
    setNotices((current) => ({ ...current, [provider]: { kind, text } }));
  };

  const handleSave = async (provider: ByokProvider) => {
    const raw = (inputs[provider] ?? '').trim();
    if (!raw) {
      setNotice(provider, 'err', 'Paste an API key first.');
      return;
    }

    setBusy(`save:${provider}`);
    try {
      const res = await fetch('/api/connector/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          provider,
          apiKey: raw,
          testFirst: Boolean(verifyOnSave[provider]),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        verified?: boolean;
        model?: string | null;
      };

      if (!res.ok) {
        setNotice(provider, 'err', body.message ?? 'Could not save key.');
        return;
      }

      // Never retain the raw key in component state once stored.
      setInputs((current) => ({ ...current, [provider]: '' }));
      setNotice(
        provider,
        'ok',
        body.verified
          ? `Verified (${body.model ?? provider}) and encrypted at rest.`
          : 'Encrypted and saved. It will never be displayed again.'
      );
      await loadKeys();
    } catch (error) {
      setNotice(provider, 'err', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async (provider: ByokProvider) => {
    const raw = (inputs[provider] ?? '').trim();
    setBusy(`test:${provider}`);
    try {
      const res = await fetch('/api/connector/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          provider,
          ...(raw ? { apiKey: raw } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        model?: string;
      };

      if (!res.ok) {
        setNotice(provider, 'err', body.message ?? 'Key verification failed.');
        return;
      }

      setNotice(
        provider,
        'ok',
        raw
          ? `Connection verified against ${body.model ?? provider}. Click Save key to store it.`
          : `Stored key verified against ${body.model ?? provider}.`
      );
    } catch (error) {
      setNotice(provider, 'err', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (provider: ByokProvider, label: string) => {
    if (!window.confirm(`Remove your stored ${label} API key?`)) return;

    setBusy(`delete:${provider}`);
    try {
      const res = await fetch(`/api/connector/keys?provider=${encodeURIComponent(provider)}`, {
        method: 'DELETE',
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setNotice(provider, 'err', body.message ?? 'Key could not be removed.');
        return;
      }
      setNotice(provider, 'ok', 'Key removed from storage.');
      await loadKeys();
    } catch (error) {
      setNotice(provider, 'err', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/studio" className="text-sm text-ink-muted underline-offset-4 hover:underline">
          ← Back to Studio
        </Link>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/settings/site" className="text-pink-700 underline">
            Site settings
          </Link>
          <Link href="/connect" className="text-pink-700 underline">
            Connected sites
          </Link>
          <Link href="/" className="text-pink-700 underline">
            Workspace
          </Link>
        </div>
      </div>

      <h1 className="mt-6 text-2xl font-semibold text-ink">Model API keys (BYOK)</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Add your own free-tier Gemini, OpenRouter or Groq key to unlock natural-language planning
        in Studio. Keys are encrypted at rest with AES-256-GCM, used strictly server-side, and
        never shown again after saving.
      </p>

      {!encryptionReady ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            SITEPILOT_ENCRYPTION_KEY is not configured on this deployment
          </p>
          <p className="mt-1 text-xs text-amber-900/80">
            Keys fail closed and cannot be saved until a 32-byte encryption key is set on the
            server.
          </p>
        </section>
      ) : null}

      {loadError ? (
        <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </p>
      ) : null}

      <div className="mt-8 space-y-4">
        {keys.map((item) => {
          const notice = notices[item.provider];
          const typed = inputs[item.provider] ?? '';
          const isSaving = busy === `save:${item.provider}`;
          const isTesting = busy === `test:${item.provider}`;
          const isDeleting = busy === `delete:${item.provider}`;

          return (
            <section
              key={item.provider}
              className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-ink">{item.label}</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {item.freeTierNote} Default model: <code>{item.defaultModel}</code>
                  </p>
                </div>
                {item.configured ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    Active · ••••{item.last4}
                  </span>
                ) : (
                  <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-ink/60">
                    Not configured
                  </span>
                )}
              </div>

              {item.updatedAt ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Saved {new Date(item.updatedAt).toLocaleString()}
                </p>
              ) : null}

              <div className="mt-4">
                <label
                  htmlFor={`key-${item.provider}`}
                  className="block text-xs font-medium uppercase tracking-wide text-ink/50"
                >
                  {item.configured ? 'Replace API key' : 'API key'}
                </label>
                <input
                  id={`key-${item.provider}`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={item.configured ? `Stored (••••${item.last4}) — paste to replace` : item.placeholder}
                  value={typed}
                  onChange={(event) =>
                    setInputs((current) => ({ ...current, [item.provider]: event.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 font-mono text-sm"
                />
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={Boolean(verifyOnSave[item.provider])}
                  onChange={(event) =>
                    setVerifyOnSave((current) => ({
                      ...current,
                      [item.provider]: event.target.checked,
                    }))
                  }
                />
                <span>Verify with a live ping before saving</span>
              </label>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSave(item.provider)}
                  disabled={busy !== null || !encryptionReady || typed.trim().length < 12}
                  className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : item.configured ? 'Replace key' : 'Save key'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleTest(item.provider)}
                  disabled={busy !== null || (!typed.trim() && !item.configured)}
                  className="rounded-lg border border-black/10 px-3 py-2 text-sm text-ink disabled:opacity-60"
                >
                  {isTesting ? 'Testing…' : typed.trim() ? 'Test typed key' : 'Test stored key'}
                </button>

                {item.configured ? (
                  <button
                    type="button"
                    onClick={() => void handleRemove(item.provider, item.label)}
                    disabled={busy !== null}
                    className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-60"
                  >
                    {isDeleting ? 'Removing…' : 'Remove'}
                  </button>
                ) : null}
              </div>

              {notice ? (
                <p
                  className={`mt-3 text-xs ${
                    notice.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {notice.text}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      {quotas ? (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">Free-tier daily guardrails</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Per-account rate limits protect your provider quota and keep the hosted platform free.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Object.entries(quotas).map(([kind, spec]) => (
              <div key={kind} className="rounded-xl border border-black/5 p-3">
                <dt className="text-xs uppercase tracking-wide text-ink/50">{kind}</dt>
                <dd className="mt-1 text-lg font-semibold text-ink">
                  {spec.limit}{' '}
                  <span className="text-xs font-normal text-ink-muted">
                    / {Math.round(spec.windowSeconds / 3600)}h
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}

/**
 * JSON-mode completions & lightweight key probes for structured tasks
 * (currently: prompt → plan and BYOK key verification).
 *
 * This lives in the adapters package on purpose. The dashboard never reads a
 * provider key from the environment (its secret boundary forbids that); it
 * passes a per-user BYOK key that came out of the encrypted `user_api_keys`
 * table. Everything provider-specific — URL, headers, request shape, response
 * shape — is contained here.
 *
 * Failure returns a short reason and nothing else. The key is never placed in
 * a reason, a log line or an error object.
 */

export type PlannerProvider = 'gemini' | 'openrouter' | 'groq';
export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface JsonCompletionInput {
  provider: PlannerProvider;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  /** Provider model id; each provider has a sensible default. */
  model?: string;
  /**
   * Reasoning effort for Gemini 2.5+/3+/4+ thinking models.
   * Defaults to `'low'` so structured JSON plans return in ~1.5–4s rather than
   * spending 15–30s in default `'medium'` long-horizon reasoning.
   */
  thinkingLevel?: GeminiThinkingLevel;
  /** Hard ceiling for the whole request, including body download. */
  timeoutMs?: number;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to the provider's public base URL. */
  baseUrlOverride?: string;
}

export interface KeyVerifyInput {
  provider: PlannerProvider;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrlOverride?: string;
}

export type JsonCompletionResult =
  | { ok: true; text: string; provider: PlannerProvider; model: string }
  | { ok: false; reason: string };

/** Request ceiling for JSON completions (Vercel Fluid Compute allows up to 300s). */
export const PLANNER_TIMEOUT_MS = 45_000;
/** Request ceiling for lightweight metadata / auth key verification probes. */
export const KEY_VERIFY_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 256 * 1024;

const DEFAULT_MODELS: Record<PlannerProvider, string> = {
  gemini: 'gemini-3.8-flash',
  openrouter: 'google/gemini-3.8-flash',
  groq: 'llama-3.3-70b-versatile',
};

const BASE_URLS: Record<PlannerProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai/api',
  groq: 'https://api.groq.com',
};

export function defaultPlannerModel(provider: PlannerProvider): string {
  return DEFAULT_MODELS[provider];
}

interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Gemini 2.5, 3.x, and 4.x models support `thinkingConfig.thinkingLevel`.
 * Gemini 3.5+ deprecated sampling parameters (`temperature`, `top_p`, `top_k`).
 */
function buildGeminiGenerationConfig(
  model: string,
  thinkingLevel?: GeminiThinkingLevel
): Record<string, unknown> {
  const normalized = model.trim().toLowerCase();
  const isGemini3OrNewer = /^gemini-(?:3|4)(?:[.-]|$)/.test(normalized);
  const supportsThinkingLevel = /^gemini-(?:2\.5|3|4)(?:[.-]|$)/.test(normalized);

  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
  };

  if (!isGemini3OrNewer) {
    generationConfig.temperature = 0.2;
  }

  if (supportsThinkingLevel) {
    // Note: gemini-3.8-flash supports low | medium | high (minimal returns 400).
    const safeLevel: GeminiThinkingLevel =
      thinkingLevel === 'minimal' && normalized.startsWith('gemini-3.8')
        ? 'low'
        : (thinkingLevel ?? 'low');
    generationConfig.thinkingConfig = { thinkingLevel: safeLevel };
  }

  return generationConfig;
}

function buildRequest(
  provider: PlannerProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  base: string,
  thinkingLevel?: GeminiThinkingLevel
): ProviderRequest {
  if (provider === 'gemini') {
    return {
      url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: buildGeminiGenerationConfig(model, thinkingLevel),
      },
    };
  }

  const url =
    provider === 'openrouter'
      ? `${base}/v1/chat/completions`
      : `${base}/openai/v1/chat/completions`;

  return {
    url,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: {
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
  };
}

/** Pulls the assistant text out of either provider's response envelope. */
function extractText(provider: PlannerProvider, payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (provider === 'gemini') {
    const candidates = (
      payload as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        }>;
      }
    ).candidates;
    const parts = candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .filter((part) => !part?.thought)
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
    return text.trim() || null;
  }

  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' && content.trim() ? content.trim() : null;
}

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String((error as { name?: unknown }).name) : '';
  return name === 'AbortError' || name === 'TimeoutError';
}

function describeHttpFailure(provider: PlannerProvider, status: number): string {
  if (status === 401 || status === 403) {
    return `${provider} returned HTTP ${status} (invalid or unauthorized API key).`;
  }
  if (status === 400 && provider === 'gemini') {
    return `${provider} returned HTTP 400 (check API key and model parameters).`;
  }
  if (status === 429) {
    return `${provider} returned HTTP 429 (rate limit or quota reached).`;
  }
  return `${provider} returned HTTP ${status}.`;
}

/**
 * Verifies a provider API key against its lightweight auth/models endpoint
 * without running an LLM completion (consumes zero tokens and avoids reasoning
 * latency timeouts during key setup).
 */
export async function verifyProviderKey(input: KeyVerifyInput): Promise<JsonCompletionResult> {
  const { provider, apiKey } = input;
  if (!apiKey || apiKey.trim().length < 8) {
    return { ok: false, reason: 'No usable model key was provided.' };
  }

  const trimmedKey = apiKey.trim();
  const base = (input.baseUrlOverride || BASE_URLS[provider]).replace(/\/+$/, '');
  const doFetch = input.fetchImpl ?? fetch;

  let url: string;
  let headers: Record<string, string>;
  if (provider === 'gemini') {
    url = `${base}/v1beta/models?pageSize=50`;
    headers = { 'x-goog-api-key': trimmedKey };
  } else if (provider === 'openrouter') {
    url = `${base}/v1/auth/key`;
    headers = { authorization: `Bearer ${trimmedKey}` };
  } else {
    url = `${base}/openai/v1/models`;
    headers = { authorization: `Bearer ${trimmedKey}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? KEY_VERIFY_TIMEOUT_MS);

  try {
    const response = await doFetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: describeHttpFailure(provider, response.status) };
    }

    let resolvedModel = DEFAULT_MODELS[provider];
    const raw = await response.text().catch(() => '');
    if (provider === 'gemini' && raw && raw.length <= MAX_RESPONSE_BYTES) {
      try {
        const parsed = JSON.parse(raw) as { models?: Array<{ name?: string }> };
        const names = (parsed.models ?? [])
          .map((entry) => (typeof entry?.name === 'string' ? entry.name.replace(/^models\//, '') : ''))
          .filter(Boolean);
        const preferred = [
          DEFAULT_MODELS.gemini,
          'gemini-3.6-flash',
          'gemini-2.5-flash',
          'gemini-3.5-flash-lite',
        ];
        const match = preferred.find((candidate) => names.includes(candidate));
        if (match) resolvedModel = match;
      } catch {
        // Ignore non-JSON body if status was 2xx; default model label remains safe.
      }
    }

    return {
      ok: true,
      text: '{"ok":true}',
      provider,
      model: resolvedModel,
    };
  } catch (error) {
    return {
      ok: false,
      reason: isAbortLikeError(error)
        ? `${provider} timed out.`
        : `${provider} could not be reached.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Asks the provider for a single JSON object.
 *
 * Anything other than a clean 2xx with text comes back as `{ ok: false }` with
 * a reason safe to show a user ("groq returned HTTP 429"), so the caller can
 * fall back to the deterministic planner instead of failing the request.
 */
export async function requestJsonCompletion(input: JsonCompletionInput): Promise<JsonCompletionResult> {
  const { provider, apiKey, systemPrompt, userPrompt } = input;

  if (!apiKey || apiKey.trim().length < 8) {
    return { ok: false, reason: 'No usable model key was provided.' };
  }

  const model = input.model?.trim() || DEFAULT_MODELS[provider];
  const base = (input.baseUrlOverride || BASE_URLS[provider]).replace(/\/+$/, '');
  const doFetch = input.fetchImpl ?? fetch;
  const request = buildRequest(
    provider,
    apiKey.trim(),
    model,
    systemPrompt,
    userPrompt,
    base,
    input.thinkingLevel
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? PLANNER_TIMEOUT_MS);

  try {
    const response = await doFetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: describeHttpFailure(provider, response.status) };
    }

    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_BYTES) {
      return { ok: false, reason: `${provider} returned an oversized response.` };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false, reason: `${provider} returned a non-JSON envelope.` };
    }

    const text = extractText(provider, payload);
    if (!text) {
      return { ok: false, reason: `${provider} returned no text content.` };
    }

    return { ok: true, text, provider, model };
  } catch (error) {
    return {
      ok: false,
      reason: isAbortLikeError(error)
        ? `${provider} timed out.`
        : `${provider} could not be reached.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

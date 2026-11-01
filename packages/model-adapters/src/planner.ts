/**
 * JSON-mode completions for structured tasks (currently: prompt → plan).
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

export interface JsonCompletionInput {
  provider: PlannerProvider;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  /** Provider model id; each provider has a sensible default. */
  model?: string;
  /** Hard ceiling for the whole request, including body download. */
  timeoutMs?: number;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to the provider's public base URL. */
  baseUrlOverride?: string;
}

export type JsonCompletionResult =
  | { ok: true; text: string; provider: PlannerProvider; model: string }
  | { ok: false; reason: string };

/** Request ceiling for JSON completions (the Gemini adapter has its own). */
export const PLANNER_TIMEOUT_MS = 12_000;
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

function buildRequest(
  provider: PlannerProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  base: string
): ProviderRequest {
  if (provider === 'gemini') {
    return {
      url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
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
    const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      .candidates;
    const parts = candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
    return text.trim() || null;
  }

  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' && content.trim() ? content.trim() : null;
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
  const request = buildRequest(provider, apiKey, model, systemPrompt, userPrompt, base);

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
      return { ok: false, reason: `${provider} returned HTTP ${response.status}.` };
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
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, reason: aborted ? `${provider} timed out.` : `${provider} could not be reached.` };
  } finally {
    clearTimeout(timeout);
  }
}

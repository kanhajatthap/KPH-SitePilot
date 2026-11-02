import { createHash } from 'node:crypto';

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
  /**
   * Controls dynamic `/v1beta/models` discovery for Gemini.
   * Defaults to `true` in production (`!fetchImpl`) and `false` when a unit
   * test injects a single-shot `fetchImpl`, unless explicitly set to `true`.
   */
  discoverModels?: boolean;
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
  openrouter: 'openrouter/auto',
  groq: 'llama-3.3-70b-versatile',
};

const BASE_URLS: Record<PlannerProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai/api',
  groq: 'https://api.groq.com',
};

/**
 * Priority order when selecting among live `generateContent`-capable Gemini
 * models returned by `GET /v1beta/models` for a user's API key.
 */
const PREFERRED_GEMINI_ORDER: readonly string[] = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-2.5-pro',
  'gemini-pro-latest',
  'gemini-1.5-pro',
];

const NON_TEXT_GEMINI_PATTERN =
  /(?:^|[-.])(tts|embedding|embeddings|imagen|image|audio|veo|lyria|aqa|bisheng|live|transcribe|robotics|computer-use|learnlm)(?:[-.]|$)/i;

const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
const geminiModelCache = new Map<string, { models: string[]; expiresAt: number }>();

export function defaultPlannerModel(provider: PlannerProvider): string {
  return DEFAULT_MODELS[provider];
}

interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Ranks a raw `/v1beta/models` payload into ordered `generateContent`-capable
 * text/JSON Gemini model ids.
 */
export function rankGeminiGenerateModels(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const entries = (
    payload as {
      models?: Array<{
        name?: unknown;
        supportedGenerationMethods?: unknown;
      }>;
    }
  ).models;
  if (!Array.isArray(entries)) return [];

  const available = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string') continue;
    const id = entry.name.replace(/^models\//, '').trim();
    if (!id || !id.toLowerCase().startsWith('gemini-')) continue;
    if (NON_TEXT_GEMINI_PATTERN.test(id)) continue;

    if (Array.isArray(entry.supportedGenerationMethods)) {
      const methods = entry.supportedGenerationMethods.map((m) => String(m));
      if (!methods.includes('generateContent')) continue;
    }

    available.add(id);
  }

  const ordered: string[] = [];
  for (const preferred of PREFERRED_GEMINI_ORDER) {
    if (available.has(preferred)) {
      ordered.push(preferred);
      available.delete(preferred);
    }
  }

  // Remaining flash models next, then any other gemini generateContent models.
  const rest = [...available];
  const flashRest = rest.filter((id) => id.toLowerCase().includes('flash')).sort();
  const otherRest = rest.filter((id) => !id.toLowerCase().includes('flash')).sort();
  return [...ordered, ...flashRest, ...otherRest];
}

function hashKeyForCache(apiKey: string, base: string): string {
  return createHash('sha256').update(`${base}|${apiKey}`, 'utf8').digest('hex');
}

async function discoverGeminiGenerateModels(
  apiKey: string,
  base: string,
  doFetch: typeof fetch
): Promise<string[]> {
  const cacheKey = hashKeyForCache(apiKey, base);
  const now = Date.now();
  const cached = geminiModelCache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.models.length > 0) {
    return cached.models;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await doFetch(`${base}/v1beta/models?pageSize=100`, {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const raw = await res.text();
    if (!raw || raw.length > MAX_RESPONSE_BYTES) return [];
    const models = rankGeminiGenerateModels(JSON.parse(raw));
    if (models.length > 0) {
      if (geminiModelCache.size > 200) geminiModelCache.clear();
      geminiModelCache.set(cacheKey, { models, expiresAt: now + MODEL_CACHE_TTL_MS });
    }
    return models;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Gemini 2.5, 3.x, and 4.x models support `thinkingConfig.thinkingLevel`.
 * Gemini 3.5+ deprecated sampling parameters (`temperature`, `top_p`, `top_k`).
 * When `minimalCompat` is true (fallback on HTTP 400), sends only `responseMimeType`
 * so older/variant models never reject unfamiliar fields.
 */
function buildGeminiGenerationConfig(
  model: string,
  thinkingLevel?: GeminiThinkingLevel,
  minimalCompat = false
): Record<string, unknown> {
  if (minimalCompat) {
    return { responseMimeType: 'application/json' };
  }

  const normalized = model.trim().toLowerCase();
  const supportsThinkingLevel = /^gemini-(?:2\.5|3|4)(?:[.-]|$)/.test(normalized);

  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
  };

  if (supportsThinkingLevel) {
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
  thinkingLevel?: GeminiThinkingLevel,
  minimalGeminiCompat = false
): ProviderRequest {
  if (provider === 'gemini') {
    return {
      url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: buildGeminiGenerationConfig(model, thinkingLevel, minimalGeminiCompat),
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
        const ranked = rankGeminiGenerateModels(JSON.parse(raw));
        if (ranked.length > 0) {
          resolvedModel = ranked[0];
          if (geminiModelCache.size > 200) geminiModelCache.clear();
          geminiModelCache.set(hashKeyForCache(trimmedKey, base), {
            models: ranked,
            expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
          });
        }
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

async function runSingleCompletionAttempt(input: {
  provider: PlannerProvider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  base: string;
  doFetch: typeof fetch;
  timeoutMs: number;
  thinkingLevel?: GeminiThinkingLevel;
  minimalGeminiCompat?: boolean;
}): Promise<
  | { ok: true; text: string; provider: PlannerProvider; model: string }
  | { ok: false; reason: string; status?: number }
> {
  const request = buildRequest(
    input.provider,
    input.apiKey,
    input.model,
    input.systemPrompt,
    input.userPrompt,
    input.base,
    input.thinkingLevel,
    input.minimalGeminiCompat ?? false
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.doFetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: describeHttpFailure(input.provider, response.status),
      };
    }

    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_BYTES) {
      return { ok: false, reason: `${input.provider} returned an oversized response.` };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false, reason: `${input.provider} returned a non-JSON envelope.` };
    }

    const text = extractText(input.provider, payload);
    if (!text) {
      return { ok: false, reason: `${input.provider} returned no text content.` };
    }

    return { ok: true, text, provider: input.provider, model: input.model };
  } catch (error) {
    return {
      ok: false,
      reason: isAbortLikeError(error)
        ? `${input.provider} timed out.`
        : `${input.provider} could not be reached.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Asks the provider for a single JSON object.
 *
 * When calling live Gemini (`!input.fetchImpl` and default model), dynamically
 * discovers which `generateContent` models the caller's API key actually has
 * access to via `GET /v1beta/models` and falls back across live Flash models
 * on 404/429/503 or parameter compatibility 400s.
 */
export async function requestJsonCompletion(input: JsonCompletionInput): Promise<JsonCompletionResult> {
  const { provider, apiKey, systemPrompt, userPrompt } = input;

  if (!apiKey || apiKey.trim().length < 8) {
    return { ok: false, reason: 'No usable model key was provided.' };
  }

  const trimmedKey = apiKey.trim();
  const explicitModel = input.model?.trim() || '';
  const base = (input.baseUrlOverride || BASE_URLS[provider]).replace(/\/+$/, '');
  const doFetch = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? PLANNER_TIMEOUT_MS;

  // Unit tests inject `fetchImpl` expecting exact 1-to-1 request assertions
  // unless `discoverModels: true` is opted into explicitly.
  const shouldDiscover = provider === 'gemini' && (input.discoverModels ?? !input.fetchImpl);
  if (!shouldDiscover) {
    const model = explicitModel || DEFAULT_MODELS[provider];
    const attempt = await runSingleCompletionAttempt({
      provider,
      apiKey: trimmedKey,
      model,
      systemPrompt,
      userPrompt,
      base,
      doFetch,
      timeoutMs,
      thinkingLevel: input.thinkingLevel,
    });
    return attempt.ok ? attempt : { ok: false, reason: attempt.reason };
  }

  // Live Gemini execution: query `/v1beta/models` (cached 10m per key) so we
  // never hit 404 from retired or region-unavailable model IDs.
  const discovered = await discoverGeminiGenerateModels(trimmedKey, base, doFetch);
  const candidates: string[] = [];

  if (explicitModel && explicitModel !== DEFAULT_MODELS.gemini) {
    if (discovered.length === 0 || discovered.includes(explicitModel)) {
      candidates.push(explicitModel);
    }
  }
  for (const m of discovered) {
    if (!candidates.includes(m)) candidates.push(m);
  }
  if (candidates.length === 0) {
    for (const fallback of [
      explicitModel || DEFAULT_MODELS.gemini,
      'gemini-2.0-flash',
      'gemini-flash-latest',
      'gemini-1.5-flash',
    ]) {
      if (fallback && !candidates.includes(fallback)) candidates.push(fallback);
    }
  }

  let lastReason = 'gemini could not be reached.';
  const modelsToTry = candidates.slice(0, 3);

  for (const candidateModel of modelsToTry) {
    let attempt = await runSingleCompletionAttempt({
      provider: 'gemini',
      apiKey: trimmedKey,
      model: candidateModel,
      systemPrompt,
      userPrompt,
      base,
      doFetch,
      timeoutMs,
      thinkingLevel: input.thinkingLevel,
    });

    if (attempt.ok) return attempt;

    // If a model rejected `thinkingConfig` or `temperature` with HTTP 400,
    // retry once with minimal `{ responseMimeType: 'application/json' }`
    // before concluding the key itself is invalid.
    if (attempt.status === 400) {
      const compatAttempt = await runSingleCompletionAttempt({
        provider: 'gemini',
        apiKey: trimmedKey,
        model: candidateModel,
        systemPrompt,
        userPrompt,
        base,
        doFetch,
        timeoutMs,
        minimalGeminiCompat: true,
      });
      if (compatAttempt.ok) return compatAttempt;
      attempt = compatAttempt;
    }

    lastReason = attempt.reason;

    // Auth errors (401/403) won't succeed on another model; stop immediately.
    if (attempt.status === 401 || attempt.status === 403) {
      break;
    }
  }

  return { ok: false, reason: lastReason };
}

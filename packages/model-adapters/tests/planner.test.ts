import { describe, expect, it, vi } from 'vitest';
import {
  defaultPlannerModel,
  rankGeminiGenerateModels,
  requestJsonCompletion,
  verifyProviderKey,
} from '../src/planner';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const geminiEnvelope = {
  candidates: [{ content: { parts: [{ text: '{"summary":"ok","steps":[]}' }] } }],
};

describe('requestJsonCompletion', () => {
  it('calls Gemini with the key in a header, never in the URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(geminiEnvelope));
    const result = await requestJsonCompletion({
      provider: 'gemini',
      apiKey: 'test-key-1234567890',
      systemPrompt: 'sys',
      userPrompt: 'user',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('"summary"');
    expect(result.model).toBe(defaultPlannerModel('gemini'));

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v1beta/models/');
    expect(url).toContain(':generateContent');
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key-1234567890');

    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.temperature).toBeUndefined();
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('ignores thought parts in Gemini responses so JSON remains clean', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: 'Let me reason carefully first...' },
                { text: '{"summary":"clean","steps":[]}' },
              ],
            },
          },
        ],
      })
    );

    const result = await requestJsonCompletion({
      provider: 'gemini',
      apiKey: 'test-key-1234567890',
      systemPrompt: 'sys',
      userPrompt: 'user',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      text: '{"summary":"clean","steps":[]}',
      provider: 'gemini',
      model: defaultPlannerModel('gemini'),
    });
  });

  it('calls OpenRouter with a bearer token and JSON response format', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: '{"summary":"ok","steps":[]}' } }] })
    );

    const result = await requestJsonCompletion({
      provider: 'openrouter',
      apiKey: 'or-key-1234567890',
      systemPrompt: 'sys',
      userPrompt: 'user',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer or-key-1234567890');
    expect(JSON.parse(String(init.body)).response_format).toEqual({ type: 'json_object' });
  });

  it('uses the OpenAI-compatible path for Groq', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '{"a":1}' } }] }));
    await requestJsonCompletion({
      provider: 'groq',
      apiKey: 'gsk-key-1234567890',
      systemPrompt: 'sys',
      userPrompt: 'user',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('reports an HTTP error without echoing the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }));
    const result = await requestJsonCompletion({
      provider: 'gemini',
      apiKey: 'secret-key-should-not-appear',
      systemPrompt: 'sys',
      userPrompt: 'user',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('HTTP 429');
    expect(result.reason).not.toContain('secret-key-should-not-appear');
  });

  it('reports a network failure as unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const result = await requestJsonCompletion({
      provider: 'gemini',
      apiKey: 'k-1234567890',
      systemPrompt: 'sys',
      userPrompt: 'user',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('could not be reached');
  });

  it('aborts a slow provider', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );

    const result = await requestJsonCompletion({
      provider: 'gemini',
      apiKey: 'k-1234567890',
      systemPrompt: 'sys',
      userPrompt: 'user',
      timeoutMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('timed out');
  });

  it('rejects a missing key before calling anything', async () => {
    const fetchImpl = vi.fn();
    const result = await requestJsonCompletion({
      provider: 'gemini',
      apiKey: '',
      systemPrompt: 'sys',
      userPrompt: 'user',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('verifyProviderKey', () => {
  it('verifies Gemini keys via GET /v1beta/models without running inference or leaking the key', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-3.8-flash' }],
      })
    );

    const result = await verifyProviderKey({
      provider: 'gemini',
      apiKey: 'AIzaSySecretKey9999',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      text: '{"ok":true}',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=50');
    expect(url).not.toContain('AIzaSySecretKey9999');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIzaSySecretKey9999');
  });

  it('verifies OpenRouter via /v1/auth/key and Groq via /openai/v1/models', async () => {
    const orFetch = vi.fn(async () => jsonResponse({ data: { label: 'test' } }));
    const orRes = await verifyProviderKey({
      provider: 'openrouter',
      apiKey: 'sk-or-v1-test-key-1234',
      fetchImpl: orFetch as unknown as typeof fetch,
    });
    expect(orRes.ok).toBe(true);
    expect((orFetch.mock.calls[0] as unknown as [string])[0]).toBe('https://openrouter.ai/api/v1/auth/key');

    const groqFetch = vi.fn(async () => jsonResponse({ data: [{ id: 'llama-3.3-70b-versatile' }] }));
    const groqRes = await verifyProviderKey({
      provider: 'groq',
      apiKey: 'gsk_test_key_12345678',
      fetchImpl: groqFetch as unknown as typeof fetch,
    });
    expect(groqRes.ok).toBe(true);
    expect((groqFetch.mock.calls[0] as unknown as [string])[0]).toBe('https://api.groq.com/openai/v1/models');
  });

  it('returns clear HTTP error reason without echoing the API key', async () => {
    const fetchImpl = vi.fn(async () => new Response('invalid key', { status: 400 }));
    const result = await verifyProviderKey({
      provider: 'gemini',
      apiKey: 'AIzaSyInvalidKeyDoNotLeak',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('HTTP 400');
    expect(result.reason).not.toContain('AIzaSyInvalidKeyDoNotLeak');
  });
});

describe('rankGeminiGenerateModels & live Gemini model discovery', () => {
  it('filters out non-generateContent and non-text models when ranking /v1beta/models', () => {
    const ranked = rankGeminiGenerateModels({
      models: [
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-2.5-flash-tts', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['interactions'] },
        { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
      ],
    });

    expect(ranked).toEqual(['gemini-2.0-flash', 'gemini-flash-latest']);
  });

  it('discovers live generateContent models and avoids HTTP 404 when default model is unavailable', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1beta/models?pageSize=100')) {
        return jsonResponse({
          models: [
            { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['interactions'] },
            { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] },
          ],
        });
      }
      if (url.includes('gemini-2.0-flash:generateContent')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (body.generationConfig?.thinkingConfig) {
          return new Response('thinkingConfig unsupported', { status: 400 });
        }
        return jsonResponse(geminiEnvelope);
      }
      return new Response('not found', { status: 404 });
    });

    const result = await requestJsonCompletion({
      provider: 'gemini',
      apiKey: 'AIzaSyDiscoveryTest1234',
      model: defaultPlannerModel('gemini'),
      systemPrompt: 'sys',
      userPrompt: 'user',
      discoverModels: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      text: '{"summary":"ok","steps":[]}',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    });
  });

  it('falls back to the next discovered Gemini model if the primary returns HTTP 404', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1beta/models?pageSize=100')) {
        return jsonResponse({
          models: [
            { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
          ],
        });
      }
      if (url.includes('gemini-2.5-flash:generateContent')) {
        return new Response('retired model', { status: 404 });
      }
      if (url.includes('gemini-2.0-flash:generateContent')) {
        return jsonResponse(geminiEnvelope);
      }
      return new Response('unexpected', { status: 500 });
    });

    const result = await requestJsonCompletion({
      provider: 'gemini',
      apiKey: 'AIzaSyFallback404Test99',
      systemPrompt: 'sys',
      userPrompt: 'user',
      discoverModels: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model).toBe('gemini-2.0-flash');
  });
});


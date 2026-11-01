import { describe, expect, it, vi } from 'vitest';
import { defaultPlannerModel, requestJsonCompletion } from '../src/planner';

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

import { describe, it, expect, vi } from 'vitest';
import {
  OpenRouterModelAdapter,
  DEFAULT_OPENROUTER_MODEL,
  convertToolContractsToOpenRouterTools,
} from '../src/openrouter-adapter.js';
import { AgentError, ErrorCode, ToolContract } from '@wp-agent/contracts';

describe('OpenRouterModelAdapter (Unit Tests with Mocks - Zero Live Quota)', () => {
  it('validates credentials accurately', async () => {
    const adapterWithKey = new OpenRouterModelAdapter({
      apiKey: 'sk-or-v1-mock-test-key-12345',
    });
    expect(await adapterWithKey.validateCredentials()).toBe(true);

    const adapterWithEmptyKey = new OpenRouterModelAdapter({
      apiKey: '   ',
    });
    expect(await adapterWithEmptyKey.validateCredentials()).toBe(false);

    const adapterWithoutKey = new OpenRouterModelAdapter({});
    expect(await adapterWithoutKey.validateCredentials()).toBe(false);
  });

  it('fails safely with UNAUTHORIZED when API key is missing on generate()', async () => {
    const adapter = new OpenRouterModelAdapter({ apiKey: '' });

    await expect(
      adapter.generate([{ role: 'user', content: 'Hello' }])
    ).rejects.toThrowError(AgentError);

    try {
      await adapter.generate([{ role: 'user', content: 'Hello' }]);
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.UNAUTHORIZED);
      expect((err as AgentError).message).toContain('Missing OpenRouter API key');
    }
  });

  it('rejects empty messages array with VALIDATION_FAILED', async () => {
    const adapter = new OpenRouterModelAdapter({ apiKey: 'sk-mock' });

    await expect(adapter.generate([])).rejects.toThrowError(AgentError);
    try {
      await adapter.generate([]);
    } catch (err) {
      expect((err as AgentError).code).toBe(ErrorCode.VALIDATION_FAILED);
      expect((err as AgentError).message).toContain('cannot be empty');
    }
  });

  it('rejects input exceeding maxPromptLength with VALIDATION_FAILED', async () => {
    const adapter = new OpenRouterModelAdapter({
      apiKey: 'sk-mock',
      maxPromptLength: 50,
    });

    const hugePrompt = 'X'.repeat(100);

    await expect(
      adapter.generate([{ role: 'user', content: hugePrompt }])
    ).rejects.toThrowError(AgentError);

    try {
      await adapter.generate([{ role: 'user', content: hugePrompt }]);
    } catch (err) {
      expect((err as AgentError).code).toBe(ErrorCode.VALIDATION_FAILED);
      expect((err as AgentError).message).toContain('exceeds maximum allowed size');
    }
  });

  it('successfully generates text completion via mock transport with zero quota consumed', async () => {
    const mockTransport = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'gen-123',
        model: DEFAULT_OPENROUTER_MODEL,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'KPH SitePilot analysis via free Gemma model is complete.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 18,
          completion_tokens: 12,
        },
      }),
    });

    const adapter = new OpenRouterModelAdapter({
      apiKey: 'sk-or-v1-mock-test-key',
      transport: mockTransport as unknown as typeof fetch,
      modelName: DEFAULT_OPENROUTER_MODEL,
    });

    expect(adapter.providerId).toBe('openrouter');
    expect(adapter.modelName).toBe(DEFAULT_OPENROUTER_MODEL);

    const res = await adapter.generate([
      { role: 'system', content: 'You are an agent' },
      { role: 'user', content: 'Inspect the website' },
    ]);

    expect(res.content).toBe('KPH SitePilot analysis via free Gemma model is complete.');
    expect(res.toolCalls).toBeUndefined();
    expect(res.usage?.promptTokens).toBe(18);
    expect(res.usage?.completionTokens).toBe(12);

    expect(mockTransport).toHaveBeenCalledTimes(1);
    const [callUrl, callInit] = mockTransport.mock.calls[0];
    expect(callUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(callInit.headers['Authorization']).toBe('Bearer sk-or-v1-mock-test-key');
    expect(callInit.headers['Content-Type']).toBe('application/json');

    const sentPayload = JSON.parse(callInit.body);
    expect(sentPayload.model).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(sentPayload.messages).toEqual([
      { role: 'system', content: 'You are an agent' },
      { role: 'user', content: 'Inspect the website' },
    ]);
  });

  it('correctly converts monorepo tool contracts to OpenRouter schemas', () => {
    const mockInspectTool: ToolContract = {
      name: 'site.inspect',
      description: 'Inspect WordPress site metadata',
      parameters: {} as unknown as ToolContract['parameters'],
      isReadOnly: true,
      execute: vi.fn(),
    };

    const mockReadTool: ToolContract = {
      name: 'page.read',
      description: 'Read WordPress page content',
      parameters: {} as unknown as ToolContract['parameters'],
      isReadOnly: true,
      execute: vi.fn(),
    };

    const tools = convertToolContractsToOpenRouterTools([
      mockInspectTool,
      mockReadTool,
    ]);

    expect(tools).toHaveLength(2);
    expect(tools[0].type).toBe('function');
    expect(tools[0].function.name).toBe('site_inspect');
    expect(tools[0].function.parameters.required).toEqual(['siteSlug']);

    expect(tools[1].type).toBe('function');
    expect(tools[1].function.name).toBe('page_read');
    expect(tools[1].function.parameters.required).toEqual(['siteSlug', 'pageIdOrSlug']);
  });

  it('handles tool call response from OpenRouter model and un-aliases tool names', async () => {
    const mockTransport = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'gen-tool-1',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_site_inspect_1',
                  type: 'function',
                  function: {
                    name: 'site_inspect',
                    arguments: '{"siteSlug":"test.local","includePlugins":true}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    });

    const mockTool: ToolContract = {
      name: 'site.inspect',
      description: 'Inspect site',
      parameters: {} as unknown as ToolContract['parameters'],
      isReadOnly: true,
      execute: vi.fn(),
    };

    const adapter = new OpenRouterModelAdapter({
      apiKey: 'sk-mock',
      transport: mockTransport as unknown as typeof fetch,
    });

    const res = await adapter.generate(
      [{ role: 'user', content: 'Inspect test.local' }],
      { tools: [mockTool] }
    );

    expect(res.toolCalls).toBeDefined();
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0]).toEqual({
      id: 'call_site_inspect_1',
      name: 'site.inspect',
      arguments: {
        siteSlug: 'test.local',
        includePlugins: true,
      },
    });

    const [_, init] = mockTransport.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.tools).toBeDefined();
    expect(body.tool_choice).toBe('auto');
  });

  it('formats tool result messages properly in conversation history', async () => {
    const mockTransport = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'The site is running WordPress 6.7.',
            },
          },
        ],
      }),
    });

    const adapter = new OpenRouterModelAdapter({
      apiKey: 'sk-mock',
      transport: mockTransport as unknown as typeof fetch,
    });

    await adapter.generate([
      { role: 'user', content: 'Inspect test.local' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'site.inspect',
            arguments: { siteSlug: 'test.local' },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call_1',
        content: '{"name":"Test Site","version":"6.7"}',
      },
    ]);

    const sentBody = JSON.parse(mockTransport.mock.calls[0][1].body);
    expect(sentBody.messages[1].role).toBe('assistant');
    expect(sentBody.messages[1].tool_calls[0].id).toBe('call_1');
    expect(sentBody.messages[1].tool_calls[0].function.name).toBe('site_inspect');

    expect(sentBody.messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"name":"Test Site","version":"6.7"}',
    });
  });

  it('normalizes HTTP 429 quota exhaustion into MODEL_ERROR', async () => {
    const mockTransport = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          message: 'Free-models rate limit exceeded. Please wait a moment.',
          code: 429,
        },
      }),
    });

    const adapter = new OpenRouterModelAdapter({
      apiKey: 'sk-mock',
      transport: mockTransport as unknown as typeof fetch,
    });

    try {
      await adapter.generate([{ role: 'user', content: 'Hello' }]);
      expect.unreachable('Should have thrown 429');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.MODEL_ERROR);
      expect((err as AgentError).message).toContain('quota exceeded or rate limit');
      expect((err as AgentError).details?.status).toBe(429);
    }
  });

  it('normalizes HTTP 401 unauthorized and never leaks the API key', async () => {
    const sensitiveKey = 'sk-or-v1-secret-sensitive-token-12345';
    const mockTransport = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: 'Invalid API key provided.',
          code: 401,
        },
      }),
    });

    const adapter = new OpenRouterModelAdapter({
      apiKey: sensitiveKey,
      transport: mockTransport as unknown as typeof fetch,
    });

    try {
      await adapter.generate([{ role: 'user', content: 'Hello' }]);
      expect.unreachable('Should have thrown 401');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.UNAUTHORIZED);
      expect((err as AgentError).message).not.toContain(sensitiveKey);
      expect((err as AgentError).message).toContain('authentication failed');
    }
  });

  it('handles request timeout safely with NETWORK_ERROR', async () => {
    const mockTransport = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('The operation was aborted (timeout)')), 50)
        )
    );

    const adapter = new OpenRouterModelAdapter({
      apiKey: 'sk-mock',
      timeoutMs: 30,
      transport: mockTransport as unknown as typeof fetch,
    });

    try {
      await adapter.generate([{ role: 'user', content: 'Hello' }]);
      expect.unreachable('Should have timed out');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.NETWORK_ERROR);
      expect((err as AgentError).message).toContain('timed out');
    }
  });

  it('handles malformed tool call JSON arguments gracefully', async () => {
    const mockTransport = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_broken',
                  type: 'function',
                  function: {
                    name: 'site_inspect',
                    arguments: '{ not-valid-json ...',
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const adapter = new OpenRouterModelAdapter({
      apiKey: 'sk-mock',
      transport: mockTransport as unknown as typeof fetch,
    });

    const res = await adapter.generate([{ role: 'user', content: 'Inspect' }]);
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0].arguments).toEqual({});
  });

  it('streams response chunks via stream generator', async () => {
    const mockTransport = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Word one two three',
            },
          },
        ],
      }),
    });

    const adapter = new OpenRouterModelAdapter({
      apiKey: 'sk-mock',
      transport: mockTransport as unknown as typeof fetch,
    });

    const chunks: string[] = [];
    for await (const chunk of adapter.stream([{ role: 'user', content: 'Hi' }])) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toContain('Word one two three');
  });
});

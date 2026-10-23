import { describe, it, expect, vi } from 'vitest';
import {
  GeminiModelAdapter,
  DEFAULT_GEMINI_MODEL,
} from '../src/gemini-adapter.js';
import { AgentError, ErrorCode } from '@wp-agent/contracts';
import { GoogleGenAI } from '@google/genai';

describe('GeminiModelAdapter (Unit Tests with Mocks)', () => {
  it('validates credentials correctly', async () => {
    const adapterWithKey = new GeminiModelAdapter({
      apiKey: 'test-dummy-key',
    });
    expect(await adapterWithKey.validateCredentials()).toBe(true);

    const adapterWithoutKey = new GeminiModelAdapter({
      apiKey: '',
    });
    expect(await adapterWithoutKey.validateCredentials()).toBe(false);
  });

  it('fails safely with UNAUTHORIZED when API key is missing', async () => {
    const adapter = new GeminiModelAdapter({ apiKey: '' });

    await expect(
      adapter.generate([{ role: 'user', content: 'Hello' }])
    ).rejects.toThrowError(AgentError);

    try {
      await adapter.generate([{ role: 'user', content: 'Hello' }]);
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.UNAUTHORIZED);
      expect((err as AgentError).message).toContain('Missing Gemini API key');
    }
  });

  it('rejects input exceeding maxPromptLength with VALIDATION_FAILED', async () => {
    const adapter = new GeminiModelAdapter({
      apiKey: 'test-key',
      maxPromptLength: 50,
    });

    const hugePrompt = 'A'.repeat(100);

    await expect(
      adapter.generate([{ role: 'user', content: hugePrompt }])
    ).rejects.toThrowError(AgentError);

    try {
      await adapter.generate([{ role: 'user', content: hugePrompt }]);
    } catch (err) {
      expect((err as AgentError).code).toBe(ErrorCode.VALIDATION_FAILED);
      expect((err as AgentError).message).toContain('exceeds maximum');
    }
  });

  it('rejects empty messages array with VALIDATION_FAILED', async () => {
    const adapter = new GeminiModelAdapter({ apiKey: 'test-key' });

    await expect(adapter.generate([])).rejects.toThrowError(AgentError);
    try {
      await adapter.generate([]);
    } catch (err) {
      expect((err as AgentError).code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('successfully generates response using injected mock GoogleGenAI client (zero quota consumed)', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: 'Mocked Gemini response text',
      usageMetadata: {
        promptTokenCount: 15,
        candidatesTokenCount: 25,
      },
    });

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    const adapter = new GeminiModelAdapter({
      apiKey: 'test-key',
      client: mockClient,
      modelName: DEFAULT_GEMINI_MODEL,
    });

    const response = await adapter.generate([
      { role: 'system', content: 'You are an assistant' },
      { role: 'user', content: 'Summarize test' },
    ]);

    expect(response.content).toBe('Mocked Gemini response text');
    expect(response.usage?.promptTokens).toBe(15);
    expect(response.usage?.completionTokens).toBe(25);

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: DEFAULT_GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: 'Summarize test' }] }],
      config: {
        systemInstruction: 'You are an assistant',
      },
    });
  });

  it('normalizes 400 API_KEY_INVALID error into UNAUTHORIZED without leaking key', async () => {
    const mockGenerateContent = vi.fn().mockRejectedValue({
      status: 400,
      message: 'API key not valid. Please pass a valid API key.',
    });

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    const adapter = new GeminiModelAdapter({
      apiKey: 'invalid-test-key-12345',
      client: mockClient,
    });

    try {
      await adapter.generate([{ role: 'user', content: 'Hello' }]);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.UNAUTHORIZED);
      expect((err as AgentError).message).not.toContain('invalid-test-key-12345');
      expect((err as AgentError).message).toContain('Invalid API key');
    }
  });

  it('normalizes 429 quota exceeded into MODEL_ERROR', async () => {
    const mockGenerateContent = vi.fn().mockRejectedValue({
      status: 429,
      message: 'RESOURCE_EXHAUSTED: quota exceeded',
    });

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    const adapter = new GeminiModelAdapter({
      apiKey: 'test-key',
      client: mockClient,
    });

    try {
      await adapter.generate([{ role: 'user', content: 'Hello' }]);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.MODEL_ERROR);
      expect((err as AgentError).message).toContain('quota exceeded');
    }
  });

  it('handles request timeout safely', async () => {
    // Mock a call that hangs longer than timeoutMs
    const mockGenerateContent = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 200))
    );

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    const adapter = new GeminiModelAdapter({
      apiKey: 'test-key',
      client: mockClient,
      timeoutMs: 50, // 50ms timeout
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
});

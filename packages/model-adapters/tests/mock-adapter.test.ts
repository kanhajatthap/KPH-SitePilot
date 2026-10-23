import { describe, it, expect } from 'vitest';
import { MockModelAdapter } from '../src/index.js';
import { AgentError, ErrorCode } from '@wp-agent/contracts';

describe('MockModelAdapter', () => {
  it('generates a successful response without requiring an API key', async () => {
    const adapter = new MockModelAdapter({
      cannedResponses: ['Analysis of plugin-test is complete.'],
    });

    const isAuthed = await adapter.validateCredentials();
    expect(isAuthed).toBe(true);

    const res = await adapter.generate([
      { role: 'user', content: 'Inspect the test site' },
    ]);

    expect(res.content).toBe('Analysis of plugin-test is complete.');
    expect(res.usage?.promptTokens).toBeGreaterThan(0);
  });

  it('handles scripted tool calls correctly', async () => {
    const adapter = new MockModelAdapter({
      scriptedToolCalls: [
        [
          {
            id: 'call_1',
            name: 'site.inspect',
            arguments: { siteSlug: 'plugin-test' },
          },
        ],
      ],
    });

    const res = await adapter.generate([{ role: 'user', content: 'Run check' }]);
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0].name).toBe('site.inspect');
  });

  it('fails safely with normalized AgentError when credentials are missing', async () => {
    const adapter = new MockModelAdapter({
      hasCredentials: false,
    });

    const isAuthed = await adapter.validateCredentials();
    expect(isAuthed).toBe(false);

    await expect(
      adapter.generate([{ role: 'user', content: 'hello' }])
    ).rejects.toThrowError(AgentError);

    try {
      await adapter.generate([{ role: 'user', content: 'hello' }]);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.UNAUTHORIZED);
    }
  });

  it('returns normalized MODEL_ERROR when simulated provider error triggers', async () => {
    const adapter = new MockModelAdapter({
      shouldError: true,
      errorMessage: 'Rate limit exceeded on mock provider',
    });

    try {
      await adapter.generate([{ role: 'user', content: 'hello' }]);
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.MODEL_ERROR);
      expect((err as AgentError).message).toContain('Rate limit exceeded');
    }
  });
});

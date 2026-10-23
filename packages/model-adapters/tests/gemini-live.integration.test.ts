import { describe, it, expect } from 'vitest';
import { initEnvFiles } from '@wp-agent/config';
import { AgentError, ErrorCode } from '@wp-agent/contracts';
import { GeminiModelAdapter } from '../src/gemini-adapter.js';

// Attempt to load .env.local if present in monorepo root
initEnvFiles();

const apiKey =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

describe('Gemini Live Integration Test (Optional & Explicit)', () => {
  it.skipIf(!apiKey)(
    'executes a minimal single prompt against the live Gemini API and returns normalized response',
    async () => {
      // Create adapter with the configured key and model
      const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      const adapter = new GeminiModelAdapter({
        apiKey,
        modelName,
        timeoutMs: 15000,
      });

      const isValid = await adapter.validateCredentials();
      expect(isValid).toBe(true);

      // Execute exactly one minimal prompt to conserve API quota
      try {
        const response = await adapter.generate([
          {
            role: 'user',
            content: 'Respond with exactly: PONG',
          },
        ]);

        expect(response).toBeDefined();
        expect(typeof response.content).toBe('string');
        expect(response.content.trim().length).toBeGreaterThan(0);
        expect(response.usage).toBeDefined();
        expect(response.usage?.promptTokens).toBeGreaterThan(0);
        expect(response.usage?.completionTokens).toBeGreaterThan(0);
      } catch (err) {
        // If Google AI Studio endpoint is experiencing a transient free-tier capacity spike,
        // verify that the error was normalized safely without exposing secrets.
        if (
          err instanceof AgentError &&
          err.code === ErrorCode.MODEL_ERROR &&
          (err.details?.status === 503 || err.details?.status === 429)
        ) {
          expect(err.message).toMatch(/(high demand|quota|rate limit|temporarily unavailable)/i);
        } else {
          throw err;
        }
      }
    },
    20000 // 20s test timeout for external API call
  );
});

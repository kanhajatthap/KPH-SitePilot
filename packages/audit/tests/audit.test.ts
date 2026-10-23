import { describe, it, expect } from 'vitest';
import { AuditLogger, redactSensitiveData } from '../src/index.js';

describe('AuditLogger & Redaction', () => {
  it('redacts sensitive keys including password, token, authorization, and secret', () => {
    const rawPayload = {
      siteSlug: 'plugin-test',
      user_password: 'super-secret-password-123',
      api_token: 'tok_live_998877',
      authorization: 'Basic YWRtaW46c2VjcmV0',
      nested: {
        app_password: 'abcd efgh ijkl mnop',
        normalField: 'safe data',
      },
    };

    const redacted = redactSensitiveData(rawPayload);

    expect(redacted.user_password).toBe('[REDACTED]');
    expect(redacted.api_token).toBe('[REDACTED]');
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.nested.app_password).toBe('[REDACTED]');
    expect(redacted.nested.normalField).toBe('safe data');
    expect(redacted.siteSlug).toBe('plugin-test');
  });

  it('redacts sensitive headers within string values', () => {
    const text = 'Sending request with header Authorization: Basic dXNlcjpwYXNz and Bearer token123';
    const redacted = redactSensitiveData(text);

    expect(redacted).not.toContain('dXNlcjpwYXNz');
    expect(redacted).not.toContain('token123');
    expect(redacted).toContain('Authorization: Basic [REDACTED]');
    expect(redacted).toContain('Bearer [REDACTED]');
  });

  it('logs audit events with isRedacted=true and unique IDs', () => {
    const logger = new AuditLogger();
    const event = logger.log({
      type: 'tool_invocation',
      actor: 'agent_core',
      targetSite: 'http://plugin-test.local',
      action: 'site.inspect',
      payload: {
        siteSlug: 'plugin-test',
        authToken: 'secret_token_abc',
      },
    });

    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.isRedacted).toBe(true);
    expect(event.payload?.authToken).toBe('[REDACTED]');
    expect(event.payload?.siteSlug).toBe('plugin-test');

    expect(logger.getEvents()).toHaveLength(1);
  });

  it('redacts AI provider API keys embedded in strings', () => {
    // Fake keys are assembled at runtime so static secret scanners do not flag this fixture.
    const fakeOpenRouterKey = `sk-or-v1-${'0'.repeat(64)}`;
    const fakeGeminiKey = `AIzaSy${'a'.repeat(33)}`;
    const fakeGroqKey = `gsk_${'b'.repeat(48)}`;
    const textWithKeys = `OpenRouter: ${fakeOpenRouterKey}, Gemini: ${fakeGeminiKey}, Groq: ${fakeGroqKey}`;
    const redacted = redactSensitiveData(textWithKeys);

    expect(redacted).not.toContain('sk-or-v1-');
    expect(redacted).not.toContain('AIzaSy');
    expect(redacted).not.toContain('gsk_');
    expect(redacted).toContain('[REDACTED_API_KEY]');
  });
});

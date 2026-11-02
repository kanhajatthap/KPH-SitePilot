import { describe, it, expect } from 'vitest';
import { loadConfig, validateHostedEnv } from '../src/index.js';
import { AgentError, ErrorCode } from '@wp-agent/contracts';

describe('Config Package', () => {
  it('applies safe defaults when no environment variables are set', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('info');
    expect(config.wpSiteUrl).toBe('http://plugin-test.local');
    expect(config.aiProvider).toBe('mock');
    expect(config.aiModel).toBe('mock-v1');
    expect(config.wpUsername).toBeUndefined();
    expect(config.wpApplicationPassword).toBeUndefined();
  });

  it('loads valid custom environment settings', () => {
    const config = loadConfig({
      PORT: '8080',
      NODE_ENV: 'test',
      LOG_LEVEL: 'debug',
      WP_SITE_URL: 'http://test.local',
      WP_APPLICATION_USERNAME: 'agent_user',
      WP_APPLICATION_PASSWORD: 'app-pass-placeholder',
      AI_PROVIDER: 'custom-provider',
      AI_MODEL: 'custom-model',
    });

    expect(config.port).toBe(8080);
    expect(config.nodeEnv).toBe('test');
    expect(config.logLevel).toBe('debug');
    expect(config.wpSiteUrl).toBe('http://test.local');
    expect(config.wpUsername).toBe('agent_user');
    expect(config.aiModel).toBe('custom-model');
    expect(config.geminiModel).toBe('gemini-3.8-flash');
  });

  it('fails safely with AgentError when PORT is out of range', () => {
    expect(() => loadConfig({ PORT: '99999' })).toThrowError(AgentError);
    try {
      loadConfig({ PORT: '70' });
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe(ErrorCode.CONFIGURATION_ERROR);
    }
  });

  it('fails safely when WP_SITE_URL is not a valid URL', () => {
    expect(() => loadConfig({ WP_SITE_URL: 'not-a-valid-url' })).toThrowError(
      AgentError
    );
  });

  it('fails safely in production when GEMINI_API_KEY is missing for gemini provider', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        AI_PROVIDER: 'gemini',
        WP_SITE_URL: 'https://example.com',
      })
    ).toThrowError(/GEMINI_API_KEY is required/);
  });

  it('fails safely in production when OPENROUTER_API_KEY is missing for openrouter provider', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        AI_PROVIDER: 'openrouter',
        WP_SITE_URL: 'https://example.com',
      })
    ).toThrowError(/OPENROUTER_API_KEY is required/);
  });

  it('fails safely in production when AI_PROVIDER is mock without override', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        AI_PROVIDER: 'mock',
        WP_SITE_URL: 'https://example.com',
      })
    ).toThrowError(/cannot be "mock" in production mode/);
  });

  it('fails safely in production when WP_SITE_URL is non-local HTTP', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'test-key',
        WP_SITE_URL: 'http://insecure-production-site.com',
      })
    ).toThrowError(/must use HTTPS protocol/);
  });

  it('passes in production when valid credentials and secure HTTPS are configured', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'valid-gemini-key',
      WP_SITE_URL: 'https://secure-site.com',
    });
    expect(config.nodeEnv).toBe('production');
    expect(config.aiProvider).toBe('gemini');
    expect(config.geminiApiKey).toBe('valid-gemini-key');
    expect(config.wpSiteUrl).toBe('https://secure-site.com');
  });

  describe('validateHostedEnv (E0-06)', () => {
    it('returns local mode when Supabase env vars are unset', () => {
      const status = validateHostedEnv({});
      expect(status.mode).toBe('local');
      expect(status.plannerMode).toBe('auto');
      expect(status.cronProtected).toBe(false);
    });

    it('rejects partial Supabase configuration or missing service role / encryption key', () => {
      expect(() =>
        validateHostedEnv({
          NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
        })
      ).toThrowError(AgentError);

      expect(() =>
        validateHostedEnv({
          NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
        })
      ).toThrowError(/SUPABASE_SERVICE_ROLE_KEY is required/);

      expect(() =>
        validateHostedEnv({
          NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role',
          SITEPILOT_ENCRYPTION_KEY: 'too-short',
        })
      ).toThrowError(/SITEPILOT_ENCRYPTION_KEY must be a 32-byte key/);
    });

    it('requires CRON_SECRET in production SaaS mode and accepts valid full configuration', () => {
      expect(() =>
        validateHostedEnv({
          NODE_ENV: 'production',
          NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role',
          SITEPILOT_ENCRYPTION_KEY: 'a'.repeat(64),
        })
      ).toThrowError(/CRON_SECRET/);

      const ok = validateHostedEnv({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
        SITEPILOT_ENCRYPTION_KEY: 'b'.repeat(64),
        CRON_SECRET: 'c'.repeat(32),
        RESEND_API_KEY: 're_test',
        SITEPILOT_MAIL_FROM: 'SitePilot <noreply@example.com>',
      });
      expect(ok).toEqual({
        mode: 'saas',
        supabaseUrl: 'https://proj.supabase.co',
        plannerMode: 'auto',
        cronProtected: true,
        appMailerConfigured: true,
      });
    });
  });
});

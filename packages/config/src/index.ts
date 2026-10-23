import { z } from 'zod';
import { AgentError, ErrorCode } from '@wp-agent/contracts';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const AppConfigSchema = z.object({
  port: z.coerce.number().int().min(1024).max(65535).default(3000),
  nodeEnv: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  wpSiteUrl: z
    .string()
    .url()
    .default('http://plugin-test.local'),
  wpUsername: z.string().optional(),
  wpApplicationPassword: z.string().optional(),
  aiProvider: z.string().default('mock'),
  aiModel: z.string().default('gemini-3.8-flash'),
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().default('gemini-3.8-flash'),
  openrouterApiKey: z.string().optional(),
  openrouterModel: z.string().default('minimax/minimax-m3.1-flash:free'),
  googleProjectId: z.string().optional(),
  googleProjectNumber: z.string().optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Searches for and loads local .env files into process.env using Node's native loader.
 */
export function initEnvFiles(startDir: string = process.cwd()): void {
  if (typeof process.loadEnvFile !== 'function') {
    return;
  }

  // Look for .env.local first, then .env up to 3 levels
  let currentDir = path.resolve(startDir);
  for (let i = 0; i < 4; i++) {
    const envLocal = path.join(currentDir, '.env.local');
    if (fs.existsSync(envLocal)) {
      try {
        process.loadEnvFile(envLocal);
        return;
      } catch {
        // Continue to fallback
      }
    }

    const envFile = path.join(currentDir, '.env');
    if (fs.existsSync(envFile)) {
      try {
        process.loadEnvFile(envFile);
        return;
      } catch {
        // Continue to fallback
      }
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
}

export interface LoadConfigOptions {
  autoLoadEnv?: boolean;
}

/**
 * Loads and validates configuration from process.env or an explicit dictionary.
 * Fails safely with structured AgentError if invalid.
 */
export function loadConfig(
  envSource: Record<string, string | undefined> = process.env,
  options: LoadConfigOptions = {}
): AppConfig {
  if (options.autoLoadEnv !== false && envSource === process.env) {
    initEnvFiles();
  }

  const openrouterApiKey = envSource.OPENROUTER_API_KEY;
  const openrouterModel =
    envSource.OPENROUTER_MODEL || 'minimax/minimax-m3.1-flash:free';

  const geminiApiKey =
    envSource.GEMINI_API_KEY ||
    envSource.GOOGLE_GENAI_API_KEY ||
    envSource.GOOGLE_API_KEY;
  const geminiModel = envSource.GEMINI_MODEL || 'gemini-3.8-flash';

  const aiProvider =
    envSource.AI_PROVIDER ||
    (openrouterApiKey ? 'openrouter' : geminiApiKey ? 'gemini' : 'mock');

  const defaultModel =
    aiProvider === 'openrouter'
      ? openrouterModel
      : aiProvider === 'gemini'
      ? geminiModel
      : 'mock-v1';
  const aiModel = envSource.AI_MODEL || defaultModel;

  const raw = {
    port: envSource.PORT,
    nodeEnv: envSource.NODE_ENV,
    logLevel: envSource.LOG_LEVEL,
    wpSiteUrl: envSource.WP_SITE_URL,
    wpUsername: envSource.WP_APPLICATION_USERNAME,
    wpApplicationPassword: envSource.WP_APPLICATION_PASSWORD,
    aiProvider,
    aiModel,
    geminiApiKey,
    geminiModel,
    openrouterApiKey,
    openrouterModel,
    googleProjectId: envSource.GOOGLE_PROJECT_ID,
    googleProjectNumber: envSource.GOOGLE_PROJECT_NUMBER,
  };

  const parsed = AppConfigSchema.safeParse(raw);

  if (!parsed.success) {
    const errorIssues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new AgentError(
      ErrorCode.CONFIGURATION_ERROR,
      `Environment configuration invalid: ${errorIssues}`,
      { issues: parsed.error.issues }
    );
  }

  // Production Fail-Safe Validation (Phase 8 Task 11)
  if (parsed.data.nodeEnv === 'production') {
    if (parsed.data.aiProvider === 'gemini' && !parsed.data.geminiApiKey) {
      throw new AgentError(
        ErrorCode.CONFIGURATION_ERROR,
        'Production configuration error: GEMINI_API_KEY is required when AI_PROVIDER is "gemini"'
      );
    }

    if (parsed.data.aiProvider === 'openrouter' && !parsed.data.openrouterApiKey) {
      throw new AgentError(
        ErrorCode.CONFIGURATION_ERROR,
        'Production configuration error: OPENROUTER_API_KEY is required when AI_PROVIDER is "openrouter"'
      );
    }

    if (parsed.data.aiProvider === 'mock' && envSource.ALLOW_MOCK_IN_PRODUCTION !== 'true') {
      throw new AgentError(
        ErrorCode.CONFIGURATION_ERROR,
        'Production configuration error: AI_PROVIDER cannot be "mock" in production mode without explicit ALLOW_MOCK_IN_PRODUCTION=true override'
      );
    }

    try {
      const parsedUrl = new URL(parsed.data.wpSiteUrl);
      const isLocalHost =
        ['localhost', '127.0.0.1'].includes(parsedUrl.hostname) ||
        parsedUrl.hostname.endsWith('.local');
      if (parsedUrl.protocol === 'http:' && !isLocalHost) {
        throw new AgentError(
          ErrorCode.CONFIGURATION_ERROR,
          `Production configuration error: Non-local WP_SITE_URL "${parsed.data.wpSiteUrl}" must use HTTPS protocol`
        );
      }
    } catch (e) {
      if (e instanceof AgentError) throw e;
      throw new AgentError(
        ErrorCode.CONFIGURATION_ERROR,
        `Production configuration error: Invalid WP_SITE_URL format "${parsed.data.wpSiteUrl}"`
      );
    }
  }

  return parsed.data;
}

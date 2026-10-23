import { GoogleGenAI } from '@google/genai';
import {
  AgentError,
  ErrorCode,
  ToolCall,
  ToolContract,
} from '@wp-agent/contracts';
import {
  ModelAdapter,
  ModelMessage,
  GenerateOptions,
  ModelResponse,
} from './index.js';

export interface GeminiModelAdapterOptions {
  apiKey?: string;
  modelName?: string;
  timeoutMs?: number;
  maxPromptLength?: number;
  client?: GoogleGenAI;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_PROMPT_LENGTH = 32768; // 32 KB character limit

/**
 * Converts monorepo ToolContract definitions into Gemini function declarations.
 */
export function convertToolContractsToGeminiFunctions(
  tools: readonly ToolContract[]
): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return tools.map((tool) => {
    const name = tool.name.replace(/\./g, '_');

    if (tool.name === 'site.inspect') {
      return {
        name,
        description: tool.description,
        parameters: {
          type: 'OBJECT',
          properties: {
            siteSlug: {
              type: 'STRING',
              description:
                'The local WordPress site slug or domain (e.g. plugin-test or plugin-test.local)',
            },
            includePlugins: {
              type: 'BOOLEAN',
              description: 'Whether to include active plugins list in response',
            },
          },
          required: ['siteSlug'],
        },
      };
    }

    if (tool.name === 'page.read') {
      return {
        name,
        description: tool.description,
        parameters: {
          type: 'OBJECT',
          properties: {
            siteSlug: {
              type: 'STRING',
              description:
                'The local WordPress site slug or domain (e.g. plugin-test)',
            },
            pageIdOrSlug: {
              type: 'STRING',
              description:
                'The WordPress page ID or page slug to read (e.g. sample-page, about, or numeric ID 2)',
            },
          },
          required: ['pageIdOrSlug'],
        },
      };
    }

    return {
      name,
      description: tool.description,
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
    };
  });
}

/**
 * Real Google Gemini model adapter using the official @google/genai SDK.
 * Implements strict request validation, timeout protection, function calling, and normalized errors.
 */
export class GeminiModelAdapter implements ModelAdapter {
  public readonly providerId = 'gemini';
  public readonly modelName: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxPromptLength: number;
  private client?: GoogleGenAI;

  constructor(options: GeminiModelAdapterOptions = {}) {
    this.apiKey =
      options.apiKey ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_GENAI_API_KEY;

    this.modelName =
      options.modelName ??
      process.env.GEMINI_MODEL ??
      DEFAULT_GEMINI_MODEL;

    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxPromptLength =
      options.maxPromptLength ?? DEFAULT_MAX_PROMPT_LENGTH;

    if (options.client) {
      this.client = options.client;
    } else if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  /**
   * Checks whether the Gemini API key is configured and non-empty.
   */
  async validateCredentials(): Promise<boolean> {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Validates input messages and enforces length boundaries and role formatting.
   */
  private validateMessages(messages: ModelMessage[]): {
    systemPrompt?: string;
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
    totalLength: number;
  } {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new AgentError(
        ErrorCode.VALIDATION_FAILED,
        'Cannot generate response from empty messages array.'
      );
    }

    let totalLength = 0;
    let systemPrompt: string | undefined;
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{ text: string }>;
    }> = [];

    for (const msg of messages) {
      if (!msg.content || typeof msg.content !== 'string') {
        throw new AgentError(
          ErrorCode.VALIDATION_FAILED,
          'Each message must contain a valid string content.'
        );
      }

      totalLength += msg.content.length;
      if (totalLength > this.maxPromptLength) {
        throw new AgentError(
          ErrorCode.VALIDATION_FAILED,
          `Input exceeds maximum allowed prompt length of ${this.maxPromptLength} characters.`,
          { maxPromptLength: this.maxPromptLength, actualLength: totalLength }
        );
      }

      if (msg.role === 'system') {
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n${msg.content}`
          : msg.content;
      } else if (msg.role === 'tool') {
        const toolName = msg.name || msg.toolCallId || 'tool';
        contents.push({
          role: 'user',
          parts: [
            {
              text: `Tool Result for [${toolName}]:\n<UNTRUSTED_CONTENT source="${toolName}">\n${msg.content}\n</UNTRUSTED_CONTENT>`,
            },
          ],
        });
      } else if (msg.role === 'assistant') {
        const text =
          msg.content ||
          (msg.toolCalls?.length
            ? `I will invoke tool ${msg.toolCalls.map((t) => t.name).join(', ')}.`
            : 'Acknowledged.');
        contents.push({
          role: 'model',
          parts: [{ text }],
        });
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    if (contents.length === 0 && systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }],
      });
      systemPrompt = undefined;
    }

    return { systemPrompt, contents, totalLength };
  }

  /**
   * Normalizes raw SDK and network errors into structured AgentError instances.
   * Guarantees that raw credentials or secret keys are never exposed.
   */
  private normalizeError(err: unknown): AgentError {
    if (err instanceof AgentError) {
      return err;
    }

    const message = (err as Error)?.message ?? String(err);
    const status = (err as { status?: number })?.status;

    // Check for API key authentication failure
    if (
      status === 400 &&
      (message.includes('API key') || message.includes('API_KEY_INVALID'))
    ) {
      return new AgentError(
        ErrorCode.UNAUTHORIZED,
        'Gemini API authentication failed: Invalid API key.',
        { provider: this.providerId }
      );
    }

    if (status === 401 || status === 403) {
      return new AgentError(
        ErrorCode.UNAUTHORIZED,
        'Gemini API authentication failed: Unauthorized or forbidden.',
        { provider: this.providerId, status }
      );
    }

    // Check for quota exhaustion / rate limiting
    if (
      status === 429 ||
      message.includes('RESOURCE_EXHAUSTED') ||
      message.includes('quota')
    ) {
      return new AgentError(
        ErrorCode.MODEL_ERROR,
        'Gemini API quota exceeded or rate limit reached. Please try again later.',
        { provider: this.providerId, status: 429 }
      );
    }

    // Check for temporary service unavailability / high demand
    if (
      status === 503 ||
      message.includes('UNAVAILABLE') ||
      message.includes('high demand')
    ) {
      return new AgentError(
        ErrorCode.MODEL_ERROR,
        'Gemini service temporarily unavailable due to high demand. Please retry shortly.',
        { provider: this.providerId, status: 503 }
      );
    }

    // Check for timeout
    if (
      message.includes('timeout') ||
      message.includes('ETIMEDOUT') ||
      message.includes('abort')
    ) {
      return new AgentError(
        ErrorCode.NETWORK_ERROR,
        `Gemini request timed out after ${this.timeoutMs}ms.`,
        { provider: this.providerId, timeoutMs: this.timeoutMs }
      );
    }

    // Model not found or deprecated
    if (status === 404 || message.includes('not found')) {
      return new AgentError(
        ErrorCode.MODEL_ERROR,
        `Requested Gemini model "${this.modelName}" is not available or unsupported.`,
        { provider: this.providerId, model: this.modelName }
      );
    }

    return new AgentError(
      ErrorCode.MODEL_ERROR,
      `Gemini request failed: ${message}`,
      { provider: this.providerId, model: this.modelName }
    );
  }

  /**
   * Generates a normalized response from messages using the Gemini SDK.
   */
  async generate(
    messages: ModelMessage[],
    options?: GenerateOptions
  ): Promise<ModelResponse> {
    if (!this.apiKey || !this.client) {
      throw new AgentError(
        ErrorCode.UNAUTHORIZED,
        'Missing Gemini API key. Ensure GEMINI_API_KEY is configured in .env.local.',
        { provider: this.providerId }
      );
    }

    const { systemPrompt, contents } = this.validateMessages(messages);

    // Prepare configuration
    const config: Record<string, unknown> = {};
    if (systemPrompt) {
      config.systemInstruction = systemPrompt;
    }
    if (options?.temperature !== undefined) {
      config.temperature = options.temperature;
    }
    if (options?.maxTokens !== undefined) {
      config.maxOutputTokens = options.maxTokens;
    }

    // Pass tool definitions to Gemini function declarations if provided
    if (options?.tools && options.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: convertToolContractsToGeminiFunctions(
            options.tools
          ),
        },
      ];
    }

    const maxAttempts = 2;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }

      // Wrap SDK call with timeout protection
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new AgentError(
              ErrorCode.NETWORK_ERROR,
              `Gemini request timed out after ${this.timeoutMs}ms.`
            )
          );
        }, this.timeoutMs);
      });

      try {
        const apiCall = this.client.models.generateContent({
          model: this.modelName,
          contents,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        const response = await Promise.race([apiCall, timeoutPromise]);
        clearTimeout(timeoutId);

        const content = response.text ?? '';
        const promptTokens =
          response.usageMetadata?.promptTokenCount ?? 0;
        const completionTokens =
          response.usageMetadata?.candidatesTokenCount ?? 0;

        // Extract function calls from Gemini response if present
        const rawFunctionCalls = response.functionCalls as Array<{
          id?: string;
          name: string;
          args?: Record<string, unknown>;
        }> | undefined;

        const toolCalls: ToolCall[] | undefined =
          rawFunctionCalls && rawFunctionCalls.length > 0
            ? rawFunctionCalls.map((fc, index) => ({
                id: fc.id || `call_${index + 1}`,
                name: fc.name.replace(/_/g, '.'),
                arguments: (fc.args as Record<string, unknown>) || {},
              }))
            : undefined;

        return {
          content,
          toolCalls,
          usage: {
            promptTokens,
            completionTokens,
          },
        };
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;

        const msg = (err as Error)?.message ?? String(err);
        const status = (err as { status?: number })?.status;
        const isTransient =
          status === 503 ||
          status === 429 ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (!isTransient || attempt === maxAttempts) {
          throw this.normalizeError(err);
        }
      }
    }

    throw this.normalizeError(lastError);
  }

  /**
   * Optional streaming response generator.
   */
  async *stream(
    messages: ModelMessage[],
    options?: GenerateOptions
  ): AsyncIterable<string> {
    const res = await this.generate(messages, options);
    const words = res.content.split(' ');
    for (const word of words) {
      yield word + ' ';
    }
  }
}

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

export interface OpenRouterModelAdapterOptions {
  apiKey?: string;
  modelName?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxPromptLength?: number;
  transport?: typeof fetch;
  siteUrl?: string;
  appName?: string;
}

export const DEFAULT_OPENROUTER_MODEL = 'minimax/minimax-m3.1-flash:free';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENROUTER_TIMEOUT_MS = 30000;
export const DEFAULT_OPENROUTER_MAX_PROMPT_LENGTH = 32768; // 32 KB character limit
interface OpenRouterChatCompletionResponse {
  id?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: {
          name: string;
          arguments?: string | Record<string, unknown>;
        };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message?: string;
    code?: number | string;
  };
}

/**
 * Converts monorepo ToolContract definitions into OpenRouter / OpenAI function calling schemas.
 */
export function convertToolContractsToOpenRouterTools(
  tools: readonly ToolContract[]
): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return tools.map((tool) => {
    const name = tool.name.replace(/\./g, '_');

    if (tool.name === 'site.inspect') {
      return {
        type: 'function',
        function: {
          name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: {
              siteSlug: {
                type: 'string',
                description:
                  'The local WordPress site slug or domain (e.g. test or test.local)',
              },
              includePlugins: {
                type: 'boolean',
                description: 'Whether to include active plugins list in response',
              },
            },
            required: ['siteSlug'],
          },
        },
      };
    }

    if (tool.name === 'page.read') {
      return {
        type: 'function',
        function: {
          name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: {
              siteSlug: {
                type: 'string',
                description:
                  'The local WordPress site slug or domain (e.g. test or test.local)',
              },
              pageIdOrSlug: {
                type: 'string',
                description: 'The page numeric ID or slug (e.g. "hello-world")',
              },
            },
            required: ['siteSlug', 'pageIdOrSlug'],
          },
        },
      };
    }

    return {
      type: 'function',
      function: {
        name,
        description: tool.description,
        parameters: { type: 'object', properties: {} },
      },
    };
  });
}

/**
 * OpenRouter Model Adapter implementation conforming to ModelAdapter contract.
 */
export class OpenRouterModelAdapter implements ModelAdapter {
  public readonly providerId = 'openrouter';
  public readonly modelName: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxPromptLength: number;
  private readonly transport: typeof fetch;
  private readonly siteUrl: string;
  private readonly appName: string;

  constructor(options: OpenRouterModelAdapterOptions = {}) {
    this.apiKey = options.apiKey;
    this.modelName = options.modelName ?? DEFAULT_OPENROUTER_MODEL;
    this.baseUrl = (options.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_OPENROUTER_TIMEOUT_MS;
    this.maxPromptLength = options.maxPromptLength ?? DEFAULT_OPENROUTER_MAX_PROMPT_LENGTH;
    this.transport = options.transport ?? fetch;
    this.siteUrl = options.siteUrl ?? 'http://localhost:3002';
    this.appName = options.appName ?? 'KPH SitePilot';
  }

  async validateCredentials(): Promise<boolean> {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private normalizeError(error: unknown, status?: number): AgentError {
    if (error instanceof AgentError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    // Authentication failure
    if (status === 401 || status === 403 || message.includes('Unauthorized') || message.includes('auth')) {
      return new AgentError(
        ErrorCode.UNAUTHORIZED,
        'OpenRouter API authentication failed: Invalid or missing API key.',
        { provider: this.providerId, status }
      );
    }

    // Quota exhaustion or rate limiting
    if (status === 429 || message.includes('rate limit') || message.includes('quota') || message.includes('credits')) {
      return new AgentError(
        ErrorCode.MODEL_ERROR,
        'OpenRouter API quota exceeded or rate limit reached. Please try again later.',
        { provider: this.providerId, status: 429 }
      );
    }

    // Timeouts
    if (message.includes('timeout') || message.includes('ETIMEDOUT') || message.includes('abort')) {
      return new AgentError(
        ErrorCode.NETWORK_ERROR,
        `OpenRouter request timed out after ${this.timeoutMs}ms.`,
        { provider: this.providerId, timeoutMs: this.timeoutMs }
      );
    }

    // Model not found or unavailable
    if (status === 404 || message.includes('not found')) {
      return new AgentError(
        ErrorCode.MODEL_ERROR,
        `Requested OpenRouter model "${this.modelName}" is not available or unsupported.`,
        { provider: this.providerId, model: this.modelName }
      );
    }

    return new AgentError(
      ErrorCode.MODEL_ERROR,
      `OpenRouter request failed: ${message}`,
      { provider: this.providerId, model: this.modelName, status }
    );
  }

  /**
   * Generates a normalized response from messages using the OpenRouter chat completions API.
   */
  async generate(
    messages: ModelMessage[],
    options?: GenerateOptions
  ): Promise<ModelResponse> {
    if (!this.apiKey) {
      throw new AgentError(
        ErrorCode.UNAUTHORIZED,
        'Missing OpenRouter API key. Ensure OPENROUTER_API_KEY is configured in .env.local.',
        { provider: this.providerId }
      );
    }

    if (!messages || messages.length === 0) {
      throw new AgentError(
        ErrorCode.VALIDATION_FAILED,
        'Messages array cannot be empty.'
      );
    }

    // Validate prompt byte length
    const totalPromptChars = messages.reduce(
      (acc, m) => acc + (m.content?.length || 0),
      0
    );
    if (totalPromptChars > this.maxPromptLength) {
      throw new AgentError(
        ErrorCode.VALIDATION_FAILED,
        `Total prompt size (${totalPromptChars} chars) exceeds maximum allowed size of ${this.maxPromptLength} characters.`,
        { totalPromptChars, maxPromptLength: this.maxPromptLength }
      );
    }

    // Format OpenAI-compatible messages payload
    const openAiMessages = messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId || 'call_default',
          content: m.content,
        };
      }

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name.replace(/\./g, '_'),
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }

      return {
        role: m.role,
        content: m.content,
      };
    });

    const requestBody: Record<string, unknown> = {
      model: this.modelName,
      messages: openAiMessages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
    };

    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = convertToolContractsToOpenRouterTools(options.tools);
      requestBody.tool_choice = 'auto';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let rawResponse: Response;
    try {
      rawResponse = await this.transport(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      throw this.normalizeError(err);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!rawResponse.ok) {
      let errorBody: string;
      try {
        const errJson = (await rawResponse.json()) as OpenRouterChatCompletionResponse;
        errorBody = errJson?.error?.message || JSON.stringify(errJson);
      } catch {
        errorBody = await rawResponse.text();
      }
      throw this.normalizeError(new Error(errorBody), rawResponse.status);
    }

    const data = (await rawResponse.json()) as OpenRouterChatCompletionResponse;
    const choice = data.choices?.[0];

    if (!choice || !choice.message) {
      throw new AgentError(
        ErrorCode.MODEL_ERROR,
        'OpenRouter returned an empty or malformed completion response.',
        { provider: this.providerId, model: this.modelName }
      );
    }

    const message = choice.message;
    const content = message.content || '';
    const toolCalls: ToolCall[] = [];

    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function' && tc.function) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs =
              typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments || {};
          } catch {
            parsedArgs = {};
          }

          // Un-alias function name from site_inspect -> site.inspect
          const normalizedName = tc.function.name.replace(/_/g, '.');

          toolCalls.push({
            id: tc.id || `call_${Date.now()}`,
            name: normalizedName,
            arguments: parsedArgs,
          });
        }
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
          }
        : undefined,
    };
  }

  async *stream(
    messages: ModelMessage[],
    options?: GenerateOptions
  ): AsyncIterable<string> {
    const response = await this.generate(messages, options);
    const words = response.content.split(' ');
    for (const word of words) {
      yield word + ' ';
    }
  }
}

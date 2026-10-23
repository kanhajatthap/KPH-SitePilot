import {
  ToolCall,
  ToolContract,
  AgentError,
  ErrorCode,
} from '@wp-agent/contracts';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolContract[];
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * Standard provider-independent model adapter contract.
 */
export interface ModelAdapter {
  readonly providerId: string;
  readonly modelName: string;

  /**
   * Generates a normalized response from messages.
   */
  generate(
    messages: ModelMessage[],
    options?: GenerateOptions
  ): Promise<ModelResponse>;

  /**
   * Optional streaming response generator.
   */
  stream?(
    messages: ModelMessage[],
    options?: GenerateOptions
  ): AsyncIterable<string>;

  /**
   * Checks whether the adapter credentials/configuration are present and valid.
   */
  validateCredentials(): Promise<boolean>;
}

export interface MockModelAdapterOptions {
  providerId?: string;
  modelName?: string;
  hasCredentials?: boolean;
  cannedResponses?: string[];
  scriptedToolCalls?: ToolCall[][];
  shouldError?: boolean;
  errorMessage?: string;
}

/**
 * In-memory Mock Model Adapter for deterministic, keyless tests.
 */
export class MockModelAdapter implements ModelAdapter {
  public readonly providerId: string;
  public readonly modelName: string;
  private hasCredentials: boolean;
  private cannedResponses: string[];
  private scriptedToolCalls: ToolCall[][];
  private shouldError: boolean;
  private errorMessage: string;
  private callCount = 0;

  constructor(options: MockModelAdapterOptions = {}) {
    this.providerId = options.providerId ?? 'mock';
    this.modelName = options.modelName ?? 'mock-v1';
    this.hasCredentials = options.hasCredentials ?? true;
    this.cannedResponses = options.cannedResponses ?? [
      'I am a read-only mock model response.',
    ];
    this.scriptedToolCalls = options.scriptedToolCalls ?? [];
    this.shouldError = options.shouldError ?? false;
    this.errorMessage = options.errorMessage ?? 'Simulated model provider failure';
  }

  async validateCredentials(): Promise<boolean> {
    return this.hasCredentials;
  }

  async generate(
    _messages: ModelMessage[],
    _options?: GenerateOptions
  ): Promise<ModelResponse> {
    if (!this.hasCredentials) {
      throw new AgentError(
        ErrorCode.UNAUTHORIZED,
        `Missing credentials for model provider: ${this.providerId}`,
        { providerId: this.providerId }
      );
    }

    if (this.shouldError) {
      throw new AgentError(
        ErrorCode.MODEL_ERROR,
        this.errorMessage,
        { providerId: this.providerId, modelName: this.modelName }
      );
    }

    const toolCalls = this.scriptedToolCalls[this.callCount];
    const content =
      this.cannedResponses[this.callCount % this.cannedResponses.length];
    this.callCount++;

    return {
      content,
      toolCalls,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
      },
    };
  }

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

export * from './gemini-adapter.js';
export * from './openrouter-adapter.js';


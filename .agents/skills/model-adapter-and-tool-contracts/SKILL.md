---
name: model-adapter-and-tool-contracts
description: >-
  Defines provider-independent LLM adapter interfaces, standardized tool contracts, schema validation with Zod,
  and normalized function-calling workflows. Use when creating or modifying AI model adapters, tool schemas, or provider integrations.
---

# Model Adapters & Tool Contracts

This skill defines the provider-independent architecture for connecting LLMs to local WordPress tools using standardized contracts.

## Architecture Overview

```text
[Agent Reasoning Engine]
         │
         ▼
[ModelAdapter Interface] ────► [GeminiAdapter | OpenAIAdapter | ClaudeAdapter | OllamaAdapter]
         │
         ▼
[Normalized Tool Dispatcher]
         │
         ▼
[Tool Contracts & Zod Schemas] ────► [WordPress Read-Only Tools / WP-CLI Adapters]
```

## Standard ModelAdapter Interface

```typescript
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  output: unknown;
  isError?: boolean;
}

export interface ModelAdapter {
  readonly providerId: string;
  readonly modelName: string;
  
  generate(messages: Message[], options?: GenerateOptions): Promise<ModelResponse>;
  stream?(messages: Message[], options?: GenerateOptions): AsyncIterable<StreamChunk>;
}
```

## Standard Tool Contract Schema

Use Zod for runtime parameter validation and automatic JSON Schema generation:

```typescript
import { z } from 'zod';

export interface ToolContract<TParams extends z.ZodTypeAny = z.ZodTypeAny, TResult = unknown> {
  name: string;
  description: string;
  parameters: TParams;
  isReadOnly: boolean;
  requiresConfirmation: boolean;
  execute(params: z.infer<TParams>, context: ExecutionContext): Promise<TResult>;
}

// Example Read-Only Tool Definition
export const InspectSiteHealthContract: ToolContract = {
  name: 'inspect_site_health',
  description: 'Queries WordPress site health status, core version, and active theme from the local test environment.',
  parameters: z.object({
    siteSlug: z.string().describe('The slug of the local test site, e.g. plugin-test'),
    includePlugins: z.boolean().default(false).describe('Whether to enumerate active plugins'),
  }),
  isReadOnly: true,
  requiresConfirmation: false,
  async execute(params, context) {
    // Implemented via read-only bridge endpoint or WP-CLI
    return { status: 'healthy', version: '6.7' };
  },
};
```

## Normalized Tool Execution Lifecycle

1. **Validation**: Validate LLM arguments against `parameters` schema using `schema.safeParse()`.
2. **Permission Check**: Verify `isReadOnly` flag. If false, block execution until explicit confirmation is provided.
3. **Execution**: Execute tool inside sandbox with error boundary and timeout guards.
4. **Result Sanitization**: Scrub any sensitive information before returning `ToolResult` to the LLM context.

## Official References

- [Model Context Protocol (MCP) Specification](https://modelcontextprotocol.io/)
- [Zod TypeScript Documentation](https://zod.dev/)

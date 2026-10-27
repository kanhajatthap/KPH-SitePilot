import {
  ToolContract,
  ToolCall,
  ToolResult,
  ToolExecutionContext,
  PermissionLevel,
  AgentError,
  ErrorCode,
  SiteInspectInputSchema,
  SiteInspectResult,
  PageReadInputSchema,
  PageReadResult,
  PostCreateDraftInputSchema,
  PostCreateDraftResult,
  BuilderDetectInputSchema,
  BuilderInspectInputSchema,
  AgentRequest,
  AgentResponse,
} from '@wp-agent/contracts';
import { ModelAdapter, ModelMessage, ModelResponse } from '@wp-agent/model-adapters';
import { AuditLogger } from '@wp-agent/audit';
import { WordPressClient } from '@wp-agent/wp-client';
import { buildSitePilotPrompt } from './prompts.js';

export * from './planner.js';
export * from './mutation-controller.js';
export * from './intent-detector.js';
export * from './task-engine.js';
export * from './prompts.js';

/**
 * Creates the read-only site.inspect ToolContract.
 */
export function createSiteInspectTool(
  wpClient: WordPressClient
): ToolContract<typeof SiteInspectInputSchema, SiteInspectResult> {
  return {
    name: 'site.inspect',
    description:
      'Inspects a local WordPress site for name, URL, version, active theme and optional plugins (read-only).',
    inputSchema: SiteInspectInputSchema,
    permissionLevel: PermissionLevel.READ_ONLY,
    isReadOnly: true,
    async execute(params, context) {
      return wpClient.inspectSite(params.siteSlug || context.siteUrl, {
        includePlugins: params.includePlugins,
      });
    },
  };
}

/**
 * Creates the read-only page.read ToolContract.
 */
export function createPageReadTool(
  wpClient: WordPressClient
): ToolContract<typeof PageReadInputSchema, PageReadResult> {
  return {
    name: 'page.read',
    description: 'Reads page title and content excerpt from a local WordPress site (read-only).',
    inputSchema: PageReadInputSchema,
    permissionLevel: PermissionLevel.READ_ONLY,
    isReadOnly: true,
    async execute(params, context) {
      return wpClient.readPage(
        params.siteSlug || context.siteUrl,
        params.pageIdOrSlug
      );
    },
  };
}

/**
 * Creates the controlled safe-write post.createDraft ToolContract.
 */
export function createPostDraftTool(
  wpClient: WordPressClient
): ToolContract<typeof PostCreateDraftInputSchema, PostCreateDraftResult> {
  return {
    name: 'post.createDraft',
    description: 'Creates a WordPress post strictly in draft status with human approval verification.',
    inputSchema: PostCreateDraftInputSchema,
    permissionLevel: PermissionLevel.SAFE_WRITE,
    isReadOnly: false,
    async execute(params, context) {
      return wpClient.createDraftPost(params.siteSlug || context.siteUrl, {
        title: params.title,
        content: params.content,
        excerpt: params.excerpt,
      });
    },
  };
}

/**
 * Creates the read-only builder.detect ToolContract.
 */
export function createBuilderDetectTool(
  wpClient: WordPressClient
): ToolContract<typeof BuilderDetectInputSchema, any> {
  return {
    name: 'builder.detect',
    description: 'Detects active WordPress builders (Gutenberg, Elementor, ACF, WooCommerce) and theme capabilities (read-only).',
    inputSchema: BuilderDetectInputSchema,
    permissionLevel: PermissionLevel.READ_ONLY,
    isReadOnly: true,
    async execute(params, context) {
      return wpClient.detectCapabilities(params.siteSlug || context.siteUrl);
    },
  };
}

/**
 * Creates the read-only builder.inspect ToolContract.
 */
export function createBuilderInspectTool(
  wpClient: WordPressClient
): ToolContract<typeof BuilderInspectInputSchema, any> {
  return {
    name: 'builder.inspect',
    description: 'Reads page content and parses builder-native structures (Gutenberg blocks, Elementor elements) preserving custom components (read-only).',
    inputSchema: BuilderInspectInputSchema,
    permissionLevel: PermissionLevel.READ_ONLY,
    isReadOnly: true,
    async execute(params, context) {
      return wpClient.readBuilderContent(
        params.siteSlug || context.siteUrl,
        params.pageIdOrSlug
      );
    },
  };
}

export interface AgentCoreOptions {
  modelAdapter: ModelAdapter;
  auditLogger: AuditLogger;
  wpClient: WordPressClient;
  customTools?: ToolContract[];
  controlledWritesEnabled?: boolean;
}

/**
 * Core Agent Orchestration Boundary.
 * Strictly adheres to deny-by-default execution and read-only boundaries.
 */
export class AgentCore {
  private readonly modelAdapter: ModelAdapter;
  private readonly auditLogger: AuditLogger;
  private readonly wpClient: WordPressClient;
  public readonly controlledWritesEnabled: boolean;
  private readonly toolRegistry = new Map<string, ToolContract>();

  constructor(options: AgentCoreOptions) {
    this.modelAdapter = options.modelAdapter;
    this.auditLogger = options.auditLogger;
    this.wpClient = options.wpClient;
    this.controlledWritesEnabled = options.controlledWritesEnabled ?? false;

    // Register standard read-only foundational tools
    this.registerTool(createSiteInspectTool(this.wpClient));
    this.registerTool(createPageReadTool(this.wpClient));
    this.registerTool(createBuilderDetectTool(this.wpClient));
    this.registerTool(createBuilderInspectTool(this.wpClient));

    // Register safe controlled mutation tool
    this.registerTool(createPostDraftTool(this.wpClient));

    if (options.customTools) {
      for (const tool of options.customTools) {
        this.registerTool(tool);
      }
    }
  }

  registerTool(tool: ToolContract): void {
    this.toolRegistry.set(tool.name, tool);
  }

  getTools(): readonly ToolContract[] {
    return Array.from(this.toolRegistry.values());
  }

  /**
   * Executes a tool invocation under strict security boundaries:
   * 1. Rejects unknown tools.
   * 2. Rejects any tool that is not strictly read-only.
   * 3. Validates parameters against the tool's schema.
   * 4. Audits all invocations, outcomes, and rejections.
   */
  async executeToolCall(
    call: ToolCall,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.toolRegistry.get(call.name);

    // 1. Unknown tool check
    if (!tool) {
      const error = new AgentError(
        ErrorCode.UNKNOWN_TOOL,
        `Tool "${call.name}" is not registered in the agent tool registry.`,
        { toolName: call.name }
      );

      this.auditLogger.log({
        type: 'tool_denial',
        actor: 'agent_core',
        targetSite: context.siteUrl,
        action: call.name,
        payload: call.arguments,
        result: { error: error.toJSON() },
      });

      return {
        toolCallId: call.id,
        name: call.name,
        output: null,
        isError: true,
        error: error.toJSON(),
      };
    }

    // 2. Deny-by-default write protection check
    if (!tool.isReadOnly || tool.permissionLevel !== PermissionLevel.READ_ONLY) {
      if (!this.controlledWritesEnabled) {
        const error = new AgentError(
          ErrorCode.WRITE_OPERATION_DENIED,
          `Tool "${call.name}" attempted a state-mutating operation. All mutating operations are denied while in read-only mode. Controlled Writes mode is currently disabled. To create draft posts, Controlled Writes mode must be enabled and human approval must be granted.`,
          { toolName: call.name, permissionLevel: tool.permissionLevel }
        );

        this.auditLogger.log({
          type: 'tool_denial',
          actor: 'agent_core',
          targetSite: context.siteUrl,
          action: call.name,
          payload: call.arguments,
          result: { error: error.toJSON() },
        });

        return {
          toolCallId: call.id,
          name: call.name,
          output: null,
          isError: true,
          error: error.toJSON(),
        };
      }
    }

    // 3. Schema parameter validation
    const parsedArgs = tool.inputSchema.safeParse(call.arguments);
    if (!parsedArgs.success) {
      const error = new AgentError(
        ErrorCode.VALIDATION_FAILED,
        `Invalid arguments provided for tool "${call.name}".`,
        { issues: parsedArgs.error.issues }
      );

      this.auditLogger.log({
        type: 'tool_denial',
        actor: 'agent_core',
        targetSite: context.siteUrl,
        action: call.name,
        payload: call.arguments,
        result: { error: error.toJSON() },
      });

      return {
        toolCallId: call.id,
        name: call.name,
        output: null,
        isError: true,
        error: error.toJSON(),
      };
    }

    // 4. Safe read-only execution
    this.auditLogger.log({
      type: 'tool_invocation',
      actor: 'agent_core',
      targetSite: context.siteUrl,
      action: call.name,
      payload: parsedArgs.data as Record<string, unknown>,
    });

    try {
      const output = await tool.execute(parsedArgs.data, context);

      this.auditLogger.log({
        type: 'tool_result',
        actor: 'agent_core',
        targetSite: context.siteUrl,
        action: call.name,
        result: { success: true },
      });

      return {
        toolCallId: call.id,
        name: call.name,
        output,
        isError: false,
      };
    } catch (err) {
      const error =
        err instanceof AgentError
          ? err
          : new AgentError(
              ErrorCode.NETWORK_ERROR,
              `Tool execution failed: ${(err as Error).message}`
            );

      this.auditLogger.log({
        type: 'tool_result',
        actor: 'agent_core',
        targetSite: context.siteUrl,
        action: call.name,
        result: { error: error.toJSON() },
      });

      return {
        toolCallId: call.id,
        name: call.name,
        output: null,
        isError: true,
        error: error.toJSON(),
      };
    }
  }

  /**
   * Orchestrates a validated Agent request.
   */
  async processRequest(request: AgentRequest): Promise<AgentResponse> {
    this.auditLogger.log({
      type: 'agent_request',
      actor: 'user',
      targetSite: request.targetSite,
      action: 'processRequest',
      payload: { correlationId: request.correlationId },
    });

    const systemPrompt = buildSitePilotPrompt(this.controlledWritesEnabled ? 'writes' : 'agent');

    const messages: ModelMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...(request.conversationHistory ?? []),
      { role: 'user', content: request.prompt },
    ];

    const availableTools = this.controlledWritesEnabled
      ? this.getTools()
      : this.getTools().filter((t) => t.isReadOnly);

    let response: ModelResponse;
    try {
      response = await this.modelAdapter.generate(messages, {
        tools: availableTools as unknown as ToolContract[],
      });
    } catch (err) {
      // If model provider is unavailable / quota-limited, check if user request can be fulfilled directly via read-only tools
      const promptLower = request.prompt.toLowerCase();
      const isInspect = promptLower.includes('inspect') || promptLower.includes('health') || promptLower.includes('status') || promptLower.includes('version');
      const isPageRead = promptLower.includes('read') || promptLower.includes('page') || promptLower.includes('sample');

      if (isInspect) {
        const slug = new URL(request.targetSite).hostname.replace(/\.local$/, '');
        const inspectTool = this.toolRegistry.get('site.inspect');
        if (inspectTool) {
          const output = (await inspectTool.execute(
            { siteSlug: slug, includePlugins: true },
            { siteUrl: request.targetSite, correlationId: request.correlationId }
          )) as Record<string, unknown>;

          const executedTools: ToolResult[] = [
            {
              toolCallId: 'direct_call_inspect',
              name: 'site.inspect',
              output,
              isError: false,
            },
          ];

          return {
            correlationId: request.correlationId,
            status: 'success',
            content: `Site inspected successfully: "${output.siteName || slug}" at ${request.targetSite}. Running WordPress ${output.wpVersion || 'detected'}. Status: ${output.status}.`,
            executedTools,
          };
        }
      } else if (isPageRead) {
        const slugMatch =
          request.prompt.match(/(?:page|post)\s+(?:the\s+)?([a-z0-9-_]+)/i) ||
          request.prompt.match(/(?:read|summarize)\s+(?:the\s+)?(?:page\s+|post\s+)?([a-z0-9-_]+)/i) ||
          request.prompt.match(/([a-z0-9-_]+)\s+(?:from|on)\s+http/i);
        const matchedSlug = slugMatch ? slugMatch[1].trim() : 'sample-page';
        const pageSlug = ['the', 'a', 'an', 'this', 'that'].includes(matchedSlug.toLowerCase())
          ? 'hello-world'
          : matchedSlug;
        const pageReadTool = this.toolRegistry.get('page.read');
        if (pageReadTool) {
          const slug = new URL(request.targetSite).hostname.replace(/\.local$/, '');
          try {
            const output = (await pageReadTool.execute(
              { siteSlug: slug, pageIdOrSlug: pageSlug },
              { siteUrl: request.targetSite, correlationId: request.correlationId }
            )) as Record<string, unknown>;

            const executedTools: ToolResult[] = [
              {
                toolCallId: 'direct_call_read',
                name: 'page.read',
                output,
                isError: false,
              },
            ];

            return {
              correlationId: request.correlationId,
              status: 'success',
              content: `Content retrieved for "${output.title || pageSlug}":\n\n${output.content || output.excerpt || 'No content found.'}`,
              executedTools,
            };
          } catch (readErr) {
            return {
              correlationId: request.correlationId,
              status: 'success',
              content: `Could not retrieve content for "${pageSlug}" on ${request.targetSite}: ${(readErr as Error).message}`,
              executedTools: [
                {
                  toolCallId: 'direct_call_read',
                  name: 'page.read',
                  output: null,
                  isError: true,
                  error: { code: ErrorCode.VALIDATION_FAILED, message: (readErr as Error).message },
                },
              ],
            };
          }
        }
      }

      throw err;
    }

    const executedTools: ToolResult[] = [];

    if (response.toolCalls && response.toolCalls.length > 0) {
      const context: ToolExecutionContext = {
        siteUrl: request.targetSite,
        correlationId: request.correlationId,
      };

      for (const call of response.toolCalls) {
        const result = await this.executeToolCall(call, context);
        executedTools.push(result);
      }

      // Check if any tool was denied due to write operations or unknown tools
      const fatalDenial = executedTools.find(
        (t) =>
          t.isError &&
          (t.error?.code === ErrorCode.WRITE_OPERATION_DENIED ||
            t.error?.code === ErrorCode.UNKNOWN_TOOL)
      );

      if (fatalDenial) {
        return {
          correlationId: request.correlationId,
          status: 'denied',
          content: `Operation denied: ${fatalDenial.error?.message || 'Unauthorized tool execution attempted.'}`,
          executedTools,
        };
      }

      // Add assistant turn acknowledging tool call
      messages.push({
        role: 'assistant' as const,
        content:
          response.content ||
          `Executing tools: ${response.toolCalls.map((t) => t.name).join(', ')}`,
        toolCalls: response.toolCalls,
      });

      // Add tool output messages
      for (const toolResult of executedTools) {
        messages.push({
          role: 'tool' as const,
          name: toolResult.name,
          toolCallId: toolResult.toolCallId,
          content: toolResult.isError
            ? `Error: ${toolResult.error?.message || 'Tool execution failed'}`
            : JSON.stringify(toolResult.output),
        });
      }

      // Follow-up model generation: let the model synthesize the answer from the actual WordPress data
      let finalContent: string;
      try {
        const followUpResponse = await this.modelAdapter.generate(messages);
        finalContent = followUpResponse.content;
      } catch {
        finalContent = `Retrieved WordPress data successfully:\n${executedTools.map((t: ToolResult) => JSON.stringify(t.output, null, 2)).join('\n')}`;
      }

      return {
        correlationId: request.correlationId,
        status: 'success',
        content: finalContent,
        executedTools,
      };
    }

    return {
      correlationId: request.correlationId,
      status: 'success',
      content: response.content,
      executedTools,
    };
  }
}

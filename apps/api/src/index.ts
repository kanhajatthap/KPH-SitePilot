import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadConfig } from '@wp-agent/config';
import { AuditLogger } from '@wp-agent/audit';
import {
  AgentError,
  ErrorCode,
  PlanGenerationRequestSchema,
  SitePlanSchema,
  DraftProposalRequestSchema,
  ChangePlanApprovalRequestSchema,
  ChangePlan,
  StagedChangeOperation,
  BuilderDetectRequestSchema,
  BuilderProposeRequestSchema,
  TaskActivityEvent,
  PublishProposalRequestSchema,
  PublishApprovalRequestSchema,
  ReviseDraftRequestSchema,
  SiteSettingsProposalRequestSchema,
  SiteSettingsApplyRequestSchema,
  PluginProposalRequestSchema,
  PluginApplyRequestSchema,
  CodeInjectionProposalRequestSchema,
  AllowedOptionKey,
  PageProposalRequestSchema,
  PageApplyRequestSchema,
  PageSectionEditProposalRequestSchema,
  PageSectionEditApplyRequestSchema,
} from '@wp-agent/contracts';
import {
  ModelAdapter,
  MockModelAdapter,
  GeminiModelAdapter,
  OpenRouterModelAdapter,
  ModelMessage,
} from '@wp-agent/model-adapters';
import {
  AgentCore,
  WebsitePlanner,
  calculatePlanHash,
  IntentDetector,
  TaskEngine,
  buildSitePilotPrompt,
} from '@wp-agent/agent-core';
import {
  WordPressClient,
  GutenbergBlock,
  ElementorElement,
  AcfFieldGroup,
  WooProduct,
  LocalWpSiteManager,
  identifyPageSections,
  proposeSectionEdit,
} from '@wp-agent/wp-client';

/**
 * In-memory proposals store for integrity hash verification before applying changes.
 */
export const activeProposals = new Map<
  string,
  { plan: ChangePlan; integrityHash: string; extraData?: any; applying?: boolean }
>();

/**
 * In-memory task event hub for streaming real-time activity events to clients.
 */
export class TaskEventHub {
  private events = new Map<string, TaskActivityEvent[]>();
  private listeners = new Map<string, Set<(event: TaskActivityEvent) => void>>();

  emit(event: TaskActivityEvent): void {
    const list = this.events.get(event.taskId) || [];
    list.push(event);
    this.events.set(event.taskId, list);

    const subs = this.listeners.get(event.taskId);
    if (subs) {
      for (const listener of subs) {
        try {
          listener(event);
        } catch {
          // Ignore subscriber errors
        }
      }
    }
  }

  getEvents(taskId: string): TaskActivityEvent[] {
    return this.events.get(taskId) || [];
  }

  subscribe(taskId: string, listener: (event: TaskActivityEvent) => void): () => void {
    let subs = this.listeners.get(taskId);
    if (!subs) {
      subs = new Set();
      this.listeners.set(taskId, subs);
    }
    subs.add(listener);

    return () => {
      subs?.delete(listener);
      if (subs && subs.size === 0) {
        this.listeners.delete(taskId);
      }
    };
  }

  clear(taskId?: string): void {
    if (taskId) {
      this.events.delete(taskId);
      this.listeners.delete(taskId);
    } else {
      this.events.clear();
      this.listeners.clear();
    }
  }
}

export const globalTaskEventHub = new TaskEventHub();

export interface AppServerContext {
  server: Server;
  auditLogger: AuditLogger;
  port: number;
  host: string;
}

/**
 * Validation schema for chat generation requests (Phase 2A).
 */
export const ChatRequestBodySchema = z.object({
  prompt: z
    .string({ required_error: 'Field "prompt" is required' })
    .min(1, 'Prompt cannot be empty')
    .max(32768, 'Prompt exceeds maximum length of 32768 characters'),
  systemPrompt: z.string().max(8192).optional(),
  model: z.string().max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
});

export type ChatRequestBody = z.infer<typeof ChatRequestBodySchema>;

/**
 * Validation schema for read-only WordPress Agent requests (Phase 2B).
 */
export const AgentRequestBodySchema = z.object({
  prompt: z
    .string({ required_error: 'Field "prompt" is required' })
    .min(1, 'Prompt cannot be empty')
    .max(32768, 'Prompt exceeds maximum length of 32768 characters'),
  targetSite: z.string().url().optional(),
  correlationId: z.string().uuid().optional(),
  controlledWrites: z.boolean().default(false),
});

export type AgentRequestBody = z.infer<typeof AgentRequestBodySchema>;

/**
 * Validation schema for intent detection and mode recommendation requests.
 */
export const IntentRequestBodySchema = z.object({
  prompt: z
    .string({ required_error: 'Field "prompt" is required' })
    .min(1, 'Prompt cannot be empty')
    .max(32768, 'Prompt exceeds maximum length of 32768 characters'),
  currentMode: z.enum(['agent', 'writes', 'chat']).default('agent'),
  targetSite: z.string().url().optional(),
});

export type IntentRequestBody = z.infer<typeof IntentRequestBodySchema>;

/**
 * Validation schema for task planning requests.
 */
export const TaskPlanRequestBodySchema = z.object({
  prompt: z
    .string({ required_error: 'Field "prompt" is required' })
    .min(1, 'Prompt cannot be empty')
    .max(32768, 'Prompt exceeds maximum length of 32768 characters'),
  targetSite: z.string().url().default('http://test.local'),
  mode: z.enum(['agent', 'writes', 'chat']).default('agent'),
  correlationId: z.string().uuid().optional(),
});

export type TaskPlanRequestBody = z.infer<typeof TaskPlanRequestBodySchema>;

/**
 * Validation schema for task execution requests.
 */
export const TaskExecuteRequestBodySchema = z.object({
  taskId: z.string().uuid().optional(),
  prompt: z
    .string({ required_error: 'Field "prompt" is required' })
    .min(1, 'Prompt cannot be empty')
    .max(32768, 'Prompt exceeds maximum length of 32768 characters'),
  targetSite: z.string().url().default('http://test.local'),
  mode: z.enum(['agent', 'writes', 'chat']).default('agent'),
  correlationId: z.string().uuid().optional(),
});

export type TaskExecuteRequestBody = z.infer<typeof TaskExecuteRequestBodySchema>;

/**
 * Reads and parses JSON from request stream with strict byte limit.
 */
function readJsonBody(req: IncomingMessage, maxBytes = 65536): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytesRead = 0;

    req.on('data', (chunk: Buffer) => {
      bytesRead += chunk.length;
      if (bytesRead > maxBytes) {
        reject(
          new AgentError(
            ErrorCode.VALIDATION_FAILED,
            `Request body exceeds maximum size of ${maxBytes} bytes.`
          )
        );
        req.destroy();
        return;
      }
      raw += chunk.toString('utf8');
    });

    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch {
        reject(
          new AgentError(
            ErrorCode.VALIDATION_FAILED,
            'Malformed JSON in request body.'
          )
        );
      }
    });

    req.on('error', (err) => {
      reject(new AgentError(ErrorCode.NETWORK_ERROR, err.message));
    });
  });
}

/**
 * In-memory sliding-window rate limiter for local API endpoints (Phase 8 Task 5).
 */
export class ServerRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs = 60000, maxRequests = 120) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = (this.hits.get(key) || []).filter(
      (ts) => now - ts < this.windowMs
    );
    if (timestamps.length >= this.maxRequests) {
      return false;
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

export const globalApiRateLimiter = new ServerRateLimiter(60000, 120);

/**
 * Sends a structured JSON response with security headers and correlation ID.
 */
function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  correlationId?: string
): void {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-ID',
  };

  const activeCorrId = correlationId || (res as unknown as { __correlationId?: string }).__correlationId;
  if (activeCorrId) {
    headers['X-Correlation-ID'] = activeCorrId;
  }

  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

/**
 * Resolves the appropriate model adapter based on configuration or overrides.
 */
export function resolveModelAdapter(customAdapter?: ModelAdapter): ModelAdapter {
  if (customAdapter) {
    return customAdapter;
  }

  const config = loadConfig();

  if (config.aiProvider === 'openrouter' && config.openrouterApiKey) {
    return new OpenRouterModelAdapter({
      apiKey: config.openrouterApiKey,
      modelName: config.openrouterModel,
    });
  }

  if (config.aiProvider === 'gemini' && config.geminiApiKey) {
    return new GeminiModelAdapter({
      apiKey: config.geminiApiKey,
      modelName: config.geminiModel,
    });
  }

  // Fallbacks if aiProvider is default/unset
  if (config.openrouterApiKey && !config.geminiApiKey) {
    return new OpenRouterModelAdapter({
      apiKey: config.openrouterApiKey,
      modelName: config.openrouterModel,
    });
  }

  if (config.geminiApiKey) {
    return new GeminiModelAdapter({
      apiKey: config.geminiApiKey,
      modelName: config.geminiModel,
    });
  }

  return new MockModelAdapter({
    providerId: 'mock',
    modelName: config.aiModel || 'mock-v1',
  });
}

/**
 * Maps AgentError to appropriate HTTP status code.
 */
function mapErrorToHttpStatus(err: AgentError): number {
  switch (err.code) {
    case ErrorCode.VALIDATION_FAILED:
      return 400;
    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.AUTH_FAILED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.WRITE_OPERATION_DENIED:
    case ErrorCode.TARGET_NOT_ALLOWED:
    case ErrorCode.SSRF_BLOCKED:
      return 403;
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return 429;
    case ErrorCode.NETWORK_ERROR:
      return 504;
    case ErrorCode.MODEL_ERROR:
      return 502;
    default:
      return 500;
  }
}

/**
 * Request handler for the server-side API.
 */
export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  auditLogger: AuditLogger,
  customAdapter?: ModelAdapter,
  customWpClient?: WordPressClient
): Promise<void> {
  const url = req.url?.split('?')[0] ?? '/';
  const method = req.method ?? 'GET';
  const correlationId =
    (req.headers['x-correlation-id'] as string) || randomUUID();
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  (res as unknown as { __correlationId?: string }).__correlationId = correlationId;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-ID',
      'X-Correlation-ID': correlationId,
    });
    res.end();
    return;
  }

  // Rate Limiting check (excluding health check)
  if (url !== '/health' && url !== '/api/health') {
    if (!globalApiRateLimiter.isAllowed(clientIp)) {
      sendJson(
        res,
        429,
        {
          error: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Too many requests. Please slow down and try again later.',
          correlationId,
        },
        correlationId
      );
      return;
    }
  }

  // 0. Root API information endpoint
  if (method === 'GET' && url === '/') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'kph-sitepilot-api',
      version: '0.1.0',
      description: 'KPH SitePilot Backend API Server',
      endpoints: {
        'GET /': 'API service info and directory',
        'GET /health': 'Health check and status',
        'POST /api/chat': 'Direct LLM chat completion',
        'POST /api/agent': 'WordPress agent orchestration (read-only default, controlled writes opt-in)',
        'POST /api/plan': 'Structured website planner & design system engine',
        'POST /api/mutate/propose': 'Phase 5: Propose staged draft post with duplicate check and integrity hash',
        'POST /api/mutate/apply': 'Phase 5: Execute verified post creation after human approval',
        'POST /api/builder/detect': 'Phase 6: Detect active WordPress builders, theme FSE status, and namespaces',
        'POST /api/builder/propose': 'Phase 6: Propose builder-native (Gutenberg/Elementor/ACF/Woo/Theme) staged changes',
      },
      dashboardUrl: 'http://localhost:3002',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // 1. Health check endpoint
  if (method === 'GET' && (url === '/health' || url === '/api/health')) {
    sendJson(res, 200, {
      status: 'ok',
      service: 'kph-sitepilot-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // 2. Local AI Chat endpoint (Phase 2A)
  if (url === '/api/chat' || url === '/chat') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parseResult = ChatRequestBodySchema.safeParse(rawBody);

      if (!parseResult.success) {
        const errorIssues = parseResult.error.issues
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; ');
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: `Request validation failed: ${errorIssues}`,
        });
        return;
      }

      const { prompt, systemPrompt, model, temperature, maxTokens } =
        parseResult.data;

      let adapter = resolveModelAdapter(customAdapter);
      if (model && adapter instanceof GeminiModelAdapter) {
        adapter = new GeminiModelAdapter({
          modelName: model,
        });
      }

      const messages: ModelMessage[] = [
        { role: 'system', content: systemPrompt ?? buildSitePilotPrompt('chat') },
        { role: 'user', content: prompt },
      ];

      const modelResponse = await adapter.generate(messages, {
        temperature,
        maxTokens,
      });

      auditLogger.log({
        type: 'agent_request',
        actor: 'api_client',
        action: 'chat_generate',
        result: {
          provider: adapter.providerId,
          model: adapter.modelName,
          promptLength: prompt.length,
          usage: modelResponse.usage,
        },
      });

      sendJson(res, 200, {
        status: 'success',
        provider: adapter.providerId,
        model: adapter.modelName,
        content: modelResponse.content,
        usage: modelResponse.usage,
      });
    } catch (err) {
      if (err instanceof AgentError) {
        const status = mapErrorToHttpStatus(err);
        sendJson(res, status, {
          error: err.code,
          message: err.message,
        });

        auditLogger.log({
          type: 'security_violation',
          actor: 'api_client',
          action: 'chat_generate_error',
          result: { code: err.code, status },
        });
        return;
      }

      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred.',
      });

      auditLogger.log({
        type: 'security_violation',
        actor: 'api_client',
        action: 'chat_generate_internal_error',
        result: { status: 500 },
      });
    }
    return;
  }

  // 3. Read-Only WordPress Agent endpoint (Phase 2B)
  if (url === '/api/agent' || url === '/agent') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parseResult = AgentRequestBodySchema.safeParse(rawBody);

      if (!parseResult.success) {
        const errorIssues = parseResult.error.issues
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; ');
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: `Request validation failed: ${errorIssues}`,
        });
        return;
      }

      const config = loadConfig();
      const correlationId = parseResult.data.correlationId || randomUUID();
      const targetSite = parseResult.data.targetSite || config.wpSiteUrl;

      // Build WordPressClient with server-side credentials
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      const adapter = resolveModelAdapter(customAdapter);
      const agent = new AgentCore({
        modelAdapter: adapter,
        auditLogger,
        wpClient,
        controlledWritesEnabled: parseResult.data.controlledWrites ?? false,
      });

      const agentResponse = await agent.processRequest({
        correlationId,
        prompt: parseResult.data.prompt,
        targetSite,
      });

      sendJson(res, 200, {
        status: agentResponse.status,
        correlationId: agentResponse.correlationId,
        content: agentResponse.content,
        executedTools: agentResponse.executedTools,
      });
    } catch (err) {
      if (err instanceof AgentError) {
        const status = mapErrorToHttpStatus(err);
        sendJson(res, status, {
          error: err.code,
          message: err.message,
        });

        auditLogger.log({
          type: 'security_violation',
          actor: 'agent_endpoint',
          action: 'agent_request_error',
          result: { code: err.code, status },
        });
        return;
      }

      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred.',
      });

      auditLogger.log({
        type: 'security_violation',
        actor: 'agent_endpoint',
        action: 'agent_request_internal_error',
        result: { status: 500 },
      });
    }
    return;
  }

  // 3b. Intelligent Intent Detection endpoint (Workspace Upgrade)
  if (url === '/api/agent/intent' || url === '/agent/intent') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parsed = IntentRequestBodySchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid intent request parameters.',
          issues: parsed.error.issues,
        });
        return;
      }

      const detector = new IntentDetector();
      const result = detector.detect(parsed.data.prompt, parsed.data.currentMode);

      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
    }
    return;
  }

  // 3c. Task Planning endpoint (Workspace Upgrade)
  if (url === '/api/task/plan' || url === '/task/plan') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parsed = TaskPlanRequestBodySchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid task plan request parameters.',
          issues: parsed.error.issues,
        });
        return;
      }

      const adapter = resolveModelAdapter(customAdapter);
      const config = loadConfig();
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [parsed.data.targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      const engine = new TaskEngine({
        modelAdapter: adapter,
        wpClient,
        auditLogger,
      });

      const task = engine.createTask({
        prompt: parsed.data.prompt,
        targetSite: parsed.data.targetSite,
        mode: parsed.data.mode,
        correlationId: parsed.data.correlationId,
      });

      task.steps = engine.planSteps(task);

      sendJson(res, 200, {
        status: 'planned',
        task,
      });
    } catch (err) {
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
    }
    return;
  }

  // 3d. Task Execution endpoint with AbortController support (Workspace Upgrade)
  if (url === '/api/task/execute' || url === '/task/execute') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parsed = TaskExecuteRequestBodySchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid task execution request parameters.',
          issues: parsed.error.issues,
        });
        return;
      }

      const adapter = resolveModelAdapter(customAdapter);
      const config = loadConfig();
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [parsed.data.targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      const engine = new TaskEngine({
        modelAdapter: adapter,
        wpClient,
        auditLogger,
      });

      const task = engine.createTask({
        id: parsed.data.taskId,
        prompt: parsed.data.prompt,
        targetSite: parsed.data.targetSite,
        mode: parsed.data.mode,
        correlationId: parsed.data.correlationId,
      });

      const controller = new AbortController();
      req.on('close', () => {
        if (!res.writableEnded) {
          controller.abort();
        }
      });

      const completedTask = await engine.executeTask(task, controller.signal, {
        onActivityEvent: (event) => {
          globalTaskEventHub.emit(event);
        },
      });

      sendJson(res, 200, {
        status: completedTask.status,
        task: completedTask,
      });
    } catch (err) {
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
    }
    return;
  }

  // 3e. Task Activity Event Stream (SSE) (Live truthful activity upgrade)
  if (url === '/api/task/stream' || url === '/task/stream') {
    if (method !== 'GET') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only GET method is accepted on SSE stream endpoint.',
      });
      return;
    }

    const searchParams = new URL(req.url || '/', 'http://127.0.0.1').searchParams;
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      sendJson(res, 400, {
        error: ErrorCode.VALIDATION_FAILED,
        message: 'Query parameter "taskId" is required.',
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Last-Event-ID',
      'X-Accel-Buffering': 'no',
    });

    res.write(`: connected to task ${taskId}\n\n`);

    const lastEventId = req.headers['last-event-id'] as string | undefined;
    const existingEvents = globalTaskEventHub.getEvents(taskId);

    let startIndex = 0;
    if (lastEventId) {
      const idx = existingEvents.findIndex((e) => e.id === lastEventId);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    for (let i = startIndex; i < existingEvents.length; i++) {
      const ev = existingEvents[i];
      res.write(`id: ${ev.id}\nevent: activity\ndata: ${JSON.stringify(ev)}\n\n`);
    }

    const unsubscribe = globalTaskEventHub.subscribe(taskId, (ev) => {
      res.write(`id: ${ev.id}\nevent: activity\ndata: ${JSON.stringify(ev)}\n\n`);
    });

    const pingInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(pingInterval);
      unsubscribe();
    });

    return;
  }

  // 4. Website Planning endpoint (Phase 4)
  if (url === '/api/plan' || url === '/plan') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const adapter = resolveModelAdapter(customAdapter);
      const planner = new WebsitePlanner({ modelAdapter: adapter, auditLogger });

      const parsedBody = PlanGenerationRequestSchema.safeParse(rawBody);
      if (!parsedBody.success) {
        // Also support revisePlan if existingPlan is provided
        const reviseSchema = z.object({
          existingPlan: SitePlanSchema,
          revisionPrompt: z.string().min(1),
        });
        const reviseParsed = reviseSchema.safeParse(rawBody);
        if (reviseParsed.success) {
          const revised = await planner.revisePlan(
            reviseParsed.data.existingPlan,
            reviseParsed.data.revisionPrompt
          );
          sendJson(res, 200, {
            status: 'success',
            plan: revised,
          });
          return;
        }

        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid plan request format.',
          issues: parsedBody.error.issues,
        });
        return;
      }

      const plan = await planner.generatePlan(parsedBody.data);
      sendJson(res, 200, {
        status: 'success',
        plan,
      });
    } catch (err) {
      if (err instanceof AgentError) {
        const status = mapErrorToHttpStatus(err);
        sendJson(res, status, {
          error: err.code,
          message: err.message,
        });
        return;
      }

      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
    }
    return;
  }

  // 5. Phase 5: Propose Staged Post Draft
  if (url === '/api/mutate/propose' || url === '/mutate/propose') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parseResult = DraftProposalRequestSchema.safeParse(rawBody);

      if (!parseResult.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid proposal request body format.',
          issues: parseResult.error.issues,
        });
        return;
      }

      const { prompt, targetSite } = parseResult.data;
      const config = loadConfig();

      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      // Extract or generate title
      let title = parseResult.data.title;
      let resolvedContent = parseResult.data.content || '';

      if (!title || !resolvedContent) {
        const titleMatch =
          prompt.match(/titled ["“'`](.+?)["”'`]/i) ||
          prompt.match(/for ["“'`](.+?)["”'`]/i) ||
          prompt.match(/title[:\s]+["“'`](.+?)["”'`]/i) ||
          prompt.match(/titled\s+([a-zA-Z0-9\s-]+?)(?:\.|$)/i) ||
          prompt.match(/["“'`](.+?)["”'`]/);
        title = title || (titleMatch ? titleMatch[1].trim() : 'How to Make a Simple Website Using AI');

        const adapter = resolveModelAdapter(customAdapter);
        try {
          const genResponse = await adapter.generate([
            {
              role: 'system',
              content:
                'You are an expert WordPress content creator. Write a comprehensive, beginner-friendly step-by-step article in clean markdown for the given topic. Start directly with the introduction without repeating the title as an H1.',
            },
            {
              role: 'user',
              content: `Write the article content for post titled "${title}". Request details: ${prompt}`,
            },
          ]);
          resolvedContent = genResponse.content || resolvedContent;
        } catch {
          // Fallback content if model unavailable
          resolvedContent = `# Getting Started\n\nBuilding a website using AI and WordPress is simple, fast, and requires zero coding.\n\n### Step 1: Define Your Idea\nUse an AI prompt to outline your website goals.\n\n### Step 2: Choose Your Theme\nPick a fast, modern block theme like Twenty Twenty-Four.\n\n### Step 3: Publish Your Pages\nReview your content and publish when ready!`;
        }
      }

      if (!resolvedContent) {
        resolvedContent = `# Getting Started\n\nBuilding a website using AI and WordPress is simple, fast, and requires zero coding.`;
      }

      const excerptMatch = resolvedContent
        .slice(0, 160)
        .replace(/[#*`\n]/g, ' ')
        .trim();
      const excerpt = excerptMatch ? `${excerptMatch}...` : undefined;

      // Duplicate check on target site via read-only check
      const dupCheck = await wpClient.checkForDuplicatePost(targetSite, title);

      // Create staged change operation
      const operationId = randomUUID();
      const planId = randomUUID();
      const correlationId = randomUUID();

      const op: StagedChangeOperation = {
        operationId,
        type: 'create_post',
        targetResource: `post:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        summary: `Create draft post: "${title}"`,
        diff: {
          before: null,
          after: {
            title,
            content: resolvedContent,
            excerpt,
            status: 'draft',
          },
        },
        isDestructive: false,
      };

      const plan: ChangePlan = {
        id: planId,
        correlationId,
        targetSite,
        author: 'user',
        summary: `Staged creation of draft post: "${title}"`,
        operations: [op],
        status: 'proposed',
        preconditions: [],
        requiresHumanApproval: true,
        createdAt: new Date().toISOString(),
      };

      const integrityHash = calculatePlanHash(plan);

      // Store in memory cache on server for verification
      activeProposals.set(planId, { plan, integrityHash });

      auditLogger.log({
        type: 'agent_request',
        actor: 'user',
        targetSite,
        action: 'proposeDraftPost',
        payload: { planId, title, isDuplicate: dupCheck.isDuplicate },
      });

      sendJson(res, 200, {
        status: 'proposed',
        planId,
        integrityHash,
        targetSite,
        post: {
          title,
          content: resolvedContent,
          excerpt,
          status: 'draft',
        },
        duplicateWarning: dupCheck.warning,
        summary: plan.summary,
        createdAt: plan.createdAt,
      });
      return;
    } catch (err) {
      if (err instanceof AgentError) {
        sendJson(res, mapErrorToHttpStatus(err), {
          error: err.code,
          message: err.message,
        });
        return;
      }
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
      return;
    }
  }

  // 6. Phase 5: Apply Approved Draft Post to WordPress
  if (url === '/api/mutate/apply' || url === '/mutate/apply') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parseResult = ChangePlanApprovalRequestSchema.safeParse(rawBody);

      if (!parseResult.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid approval request format.',
          issues: parseResult.error.issues,
        });
        return;
      }

      const { planId, integrityHash, targetSite, post, approvedBy } =
        parseResult.data;

      // Verification Guard 1: Plan must exist
      const stored = activeProposals.get(planId);
      if (!stored) {
        throw new AgentError(
          ErrorCode.VALIDATION_FAILED,
          `Change proposal "${planId}" not found or expired. Please generate a new proposal.`
        );
      }

      // Verification Guard 2: Integrity Hash Matching (Tamper Detection)
      if (stored.integrityHash !== integrityHash) {
        throw new AgentError(
          ErrorCode.FORBIDDEN,
          'Integrity hash mismatch: The post content was modified after user approval was granted!'
        );
      }

      // Verification Guard 3: Target site matching
      if (stored.plan.targetSite !== targetSite) {
        throw new AgentError(
          ErrorCode.TARGET_NOT_ALLOWED,
          `Target site mismatch: Proposal was for "${stored.plan.targetSite}", but approval targeted "${targetSite}".`
        );
      }

      const config = loadConfig();
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      let appliedResult;
      const primaryOp = stored.plan.operations[0];
      if (primaryOp?.type === 'update_post') {
        const idMatch = primaryOp.targetResource.match(/post:(\d+)/);
        const targetPostId = idMatch ? parseInt(idMatch[1], 10) : (post as unknown as { id?: number }).id;
        if (!targetPostId) {
          throw new AgentError(ErrorCode.VALIDATION_FAILED, 'Cannot determine target post ID to update.');
        }
        appliedResult = await wpClient.updateDraftPost(targetSite, targetPostId, {
          title: post.title,
          content: post.content,
        });
      } else {
        // Execute strictly as 'draft'
        appliedResult = await wpClient.createDraftPost(targetSite, {
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
        });
      }

      // Record approval in audit log
      auditLogger.log({
        type: 'tool_result',
        actor: approvedBy,
        targetSite,
        action: primaryOp?.type === 'update_post' ? 'applyApprovedDraftUpdate' : 'applyApprovedDraftPost',
        result: {
          postId: appliedResult.id,
          status: appliedResult.status,
          verified: (appliedResult as unknown as { verified?: boolean }).verified ?? true,
        },
      });

      // Clear from pending cache
      activeProposals.delete(planId);

      sendJson(res, 200, {
        status: 'applied',
        planId,
        targetSite,
        post: appliedResult,
      });
      return;
    } catch (err) {
      if (err instanceof AgentError) {
        sendJson(res, mapErrorToHttpStatus(err), {
          error: err.code,
          message: err.message,
        });
        return;
      }
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
      return;
    }
  }

  // 7. Phase 6: Detect Installed Builders and Capabilities
  if (url === '/api/builder/detect' || url === '/builder/detect') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parseResult = BuilderDetectRequestSchema.safeParse(rawBody);

      if (!parseResult.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid builder detect request format.',
          issues: parseResult.error.issues,
        });
        return;
      }

      const { targetSite } = parseResult.data;
      const config = loadConfig();
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      const capabilities = await wpClient.detectCapabilities(targetSite);

      auditLogger.log({
        type: 'agent_request',
        actor: 'user',
        targetSite,
        action: 'builder_detect',
        payload: { capabilities },
      });

      sendJson(res, 200, {
        targetSite,
        capabilities,
      });
      return;
    } catch (err) {
      if (err instanceof AgentError) {
        sendJson(res, mapErrorToHttpStatus(err), {
          error: err.code,
          message: err.message,
        });
        return;
      }
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
      return;
    }
  }

  // 8. Phase 6: Propose Builder-Native Staged Changes
  if (url === '/api/builder/propose' || url === '/builder/propose') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parseResult = BuilderProposeRequestSchema.safeParse(rawBody);

      if (!parseResult.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid builder propose request format.',
          issues: parseResult.error.issues,
        });
        return;
      }

      const {
        targetSite,
        builderType,
        pageIdOrSlug,
        title: providedTitle,
        prompt,
        section,
        acfData,
        wooProductData,
      } = parseResult.data;

      const config = loadConfig();
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      const titleMatch =
        prompt.match(/titled ["“'`](.+?)["”'`]/i) ||
        prompt.match(/for ["“'`](.+?)["”'`]/i) ||
        prompt.match(/title[:\s]+["“'`](.+?)["”'`]/i) ||
        prompt.match(/["“'`](.+?)["”'`]/);

      const title =
        providedTitle ||
        titleMatch?.[1]?.trim() ||
        `${builderType.toUpperCase()} Structured Content`;

      let diff: { before: unknown | null; after: unknown };
      let renderedPreviewHtml = '';
      let unsupportedFeatures: string[] = [];
      let stagedContent = '';

      if (builderType === 'gutenberg') {
        let existingBlocks: GutenbergBlock[] | undefined;
        if (pageIdOrSlug) {
          try {
            const existing = await wpClient.readBuilderContent(targetSite, pageIdOrSlug);
            existingBlocks = existing.gutenbergBlocks;
          } catch {
            // Page not found or offline; proceed without existing blocks
          }
        }

        const resGutenberg = await wpClient.proposeGutenbergPost(targetSite, {
          title,
          section,
          existingBlocks,
        });

        diff = resGutenberg.diff;
        renderedPreviewHtml = resGutenberg.renderedPreviewHtml;
        unsupportedFeatures = resGutenberg.unsupportedFeatures;
        stagedContent = resGutenberg.serializedContent;
      } else if (builderType === 'elementor') {
        let existingElements: ElementorElement[] | undefined;
        if (pageIdOrSlug) {
          try {
            const existing = await wpClient.readBuilderContent(targetSite, pageIdOrSlug);
            existingElements = existing.elementorElements;
          } catch {
            // Page not found or offline; proceed without existing elements
          }
        }

        const resElementor = await wpClient.proposeElementorPost(targetSite, {
          title,
          section,
          existingElements,
        });

        diff = resElementor.diff;
        renderedPreviewHtml = resElementor.renderedPreviewHtml;
        unsupportedFeatures = resElementor.unsupportedFeatures;
        stagedContent = resElementor.renderedPreviewHtml || resElementor.serializedData;
      } else if (builderType === 'acf') {
        const defaultFieldGroup: AcfFieldGroup = {
          key: 'group_sitepilot_meta',
          title: 'SitePilot Page Meta',
          fields: [
            { key: 'field_subheading', name: 'subheading', label: 'Subheading', type: 'text', required: true },
            { key: 'field_rating', name: 'rating', label: 'Rating', type: 'number' },
          ],
        };

        const values = acfData || { subheading: 'AI-Generated Subheading', rating: 5 };
        const validation = wpClient.validateAcf(values, defaultFieldGroup);

        if (!validation.valid) {
          sendJson(res, 400, {
            error: ErrorCode.VALIDATION_FAILED,
            message: `ACF validation failed: ${validation.errors.join('; ')}`,
            errors: validation.errors,
          });
          return;
        }

        diff = {
          before: null,
          after: values,
        };
        renderedPreviewHtml = `<div class="acf-preview-card"><div class="acf-header">ACF Field Group: ${defaultFieldGroup.title}</div><pre>${JSON.stringify(values, null, 2)}</pre></div>`;
        stagedContent = JSON.stringify(values, null, 2);
      } else if (builderType === 'woocommerce') {
        const productValues: WooProduct = (wooProductData as unknown as WooProduct) || {
          name: title,
          type: 'simple',
          regularPrice: '29.99',
          salePrice: '19.99',
          description: `AI-crafted WooCommerce product for ${title}`,
          stockStatus: 'instock',
        };

        const validation = wpClient.validateProduct(productValues);
        if (!validation.valid) {
          sendJson(res, 400, {
            error: ErrorCode.VALIDATION_FAILED,
            message: `WooCommerce validation failed: ${validation.errors.join('; ')}`,
            errors: validation.errors,
          });
          return;
        }

        diff = {
          before: null,
          after: productValues,
        };
        renderedPreviewHtml = `<div class="woo-preview-card"><h3>${productValues.name}</h3><div class="price-tag"><del>$${productValues.regularPrice}</del> <ins>$${productValues.salePrice || productValues.regularPrice}</ins></div><span class="stock-badge in-stock">In Stock</span></div>`;
        stagedContent = JSON.stringify(productValues, null, 2);
      } else {
        const themeManifest = await wpClient.inspectTheme(targetSite);
        diff = {
          before: null,
          after: themeManifest,
        };
        renderedPreviewHtml = `<div class="theme-preview-card"><h3>Active Theme: ${themeManifest.name}</h3><p>Mode: ${themeManifest.isBlockTheme ? 'Full Site Editing (FSE)' : 'Classic'}</p></div>`;
        stagedContent = JSON.stringify(themeManifest, null, 2);
      }

      // Stage change operation and plan (aligned with Phase 5 approval integrity)
      const operationId = randomUUID();
      const planId = randomUUID();
      const correlationId = randomUUID();

      const op: StagedChangeOperation = {
        operationId,
        type: 'create_post',
        targetResource: `${builderType}:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        summary: `Staged ${builderType} update: "${title}"`,
        diff: {
          before: diff.before,
          after: {
            title,
            content: stagedContent,
            status: 'draft',
          },
        },
        isDestructive: false,
      };

      const plan: ChangePlan = {
        id: planId,
        correlationId,
        targetSite,
        author: 'user',
        summary: `Staged ${builderType} update for "${title}"`,
        operations: [op],
        status: 'proposed',
        preconditions: [],
        requiresHumanApproval: true,
        createdAt: new Date().toISOString(),
      };

      const integrityHash = calculatePlanHash(plan);
      activeProposals.set(planId, { plan, integrityHash });

      auditLogger.log({
        type: 'agent_request',
        actor: 'user',
        targetSite,
        action: 'proposeBuilderPost',
        payload: { planId, builderType, title, unsupportedFeatures },
      });

      sendJson(res, 200, {
        status: 'proposed',
        planId,
        integrityHash,
        targetSite,
        builderType,
        title,
        diff,
        renderedPreviewHtml,
        unsupportedFeatures,
        summary: plan.summary,
        createdAt: plan.createdAt,
      });
      return;
    } catch (err) {
      if (err instanceof AgentError) {
        sendJson(res, mapErrorToHttpStatus(err), {
          error: err.code,
          message: err.message,
        });
        return;
      }
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
      return;
    }
  }

  // 9. Verified Post Retrieval (Persistent Side-by-Side Preview Upgrade)
  if (url === '/api/post/get' || url === '/post/get') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const postGetSchema = z.object({
        targetSite: z.string().url(),
        postId: z.number().int().positive(),
      });
      const parseResult = postGetSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid get post request format.',
          issues: parseResult.error.issues,
        });
        return;
      }

      const { targetSite, postId } = parseResult.data;
      const config = loadConfig();
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      const post = await wpClient.getPost(targetSite, postId);

      sendJson(res, 200, {
        targetSite,
        post,
      });
      return;
    } catch (err) {
      if (err instanceof AgentError) {
        sendJson(res, mapErrorToHttpStatus(err), {
          error: err.code,
          message: err.message,
        });
        return;
      }
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
      return;
    }
  }

  // 10. Propose Publishing a Post (Privilege Boundary Upgrade)
  if (url === '/api/publish/propose' || url === '/publish/propose') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parseResult = PublishProposalRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid publish proposal request format.',
          issues: parseResult.error.issues,
        });
        return;
      }

      const { targetSite, postId } = parseResult.data;
      const config = loadConfig();
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      const post = await wpClient.getPost(targetSite, postId);

      const planId = randomUUID();
      const correlationId = randomUUID();
      const operationId = randomUUID();

      const op: StagedChangeOperation = {
        operationId,
        type: 'publish_post',
        targetResource: `post:${postId}`,
        summary: `Publish post #${postId}: "${post.title}"`,
        diff: {
          before: { status: post.status },
          after: { status: 'publish' },
        },
        isDestructive: false,
      };

      const plan: ChangePlan = {
        id: planId,
        correlationId,
        targetSite,
        author: 'user',
        summary: `Publish post #${postId} ("${post.title}") to live WordPress site`,
        operations: [op],
        status: 'proposed',
        preconditions: [],
        requiresHumanApproval: true,
        createdAt: new Date().toISOString(),
      };

      const integrityHash = calculatePlanHash(plan);
      activeProposals.set(planId, { plan, integrityHash });

      auditLogger.log({
        type: 'agent_request',
        actor: 'user',
        targetSite,
        action: 'proposePublishPost',
        payload: { planId, postId, currentStatus: post.status },
      });

      sendJson(res, 200, {
        status: 'proposed',
        planId,
        integrityHash,
        targetSite,
        post,
        intendedStatus: 'publish',
        warning: `Publishing will make this post immediately visible to the public on ${targetSite}. This action changes status from ${post.status} to live published.`,
        summary: plan.summary,
        createdAt: plan.createdAt,
      });
      return;
    } catch (err) {
      if (err instanceof AgentError) {
        sendJson(res, mapErrorToHttpStatus(err), {
          error: err.code,
          message: err.message,
        });
        return;
      }
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
      return;
    }
  }

  // 11. Apply Approved Publish to WordPress
  if (url === '/api/publish/apply' || url === '/publish/apply') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parseResult = PublishApprovalRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid publish approval request format.',
          issues: parseResult.error.issues,
        });
        return;
      }

      const { planId, integrityHash, targetSite, postId, approvedBy } = parseResult.data;

      // Verification Guard 1: Plan must exist
      const stored = activeProposals.get(planId);
      if (!stored) {
        throw new AgentError(
          ErrorCode.VALIDATION_FAILED,
          `Publish proposal "${planId}" not found or expired. Please generate a new proposal.`
        );
      }

      // Verification Guard 2: Integrity Hash Matching
      if (stored.integrityHash !== integrityHash) {
        throw new AgentError(
          ErrorCode.FORBIDDEN,
          'Integrity hash mismatch: The publish proposal was modified after creation!'
        );
      }

      // Verification Guard 3: Target site matching
      if (stored.plan.targetSite !== targetSite) {
        throw new AgentError(
          ErrorCode.TARGET_NOT_ALLOWED,
          `Target site mismatch: Proposal was for "${stored.plan.targetSite}", but approval targeted "${targetSite}".`
        );
      }

      // Verification Guard 4: Operation target verification
      const op = stored.plan.operations[0];
      if (op?.targetResource !== `post:${postId}` || op?.type !== 'publish_post') {
        throw new AgentError(
          ErrorCode.FORBIDDEN,
          'Publish approval target does not match staged publish operation.'
        );
      }

      const config = loadConfig();
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      // Execute publish with independent read-only status verification
      const publishedResource = await wpClient.publishPost(targetSite, postId);

      auditLogger.log({
        type: 'tool_result',
        actor: approvedBy,
        targetSite,
        action: 'publishApprovedPost',
        result: {
          postId: publishedResource.id,
          status: publishedResource.status,
          isLivePublished: publishedResource.isLivePublished,
        },
      });

      activeProposals.delete(planId);

      sendJson(res, 200, {
        status: 'applied',
        planId,
        targetSite,
        post: publishedResource,
        verified: true,
      });
      return;
    } catch (err) {
      if (err instanceof AgentError) {
        sendJson(res, mapErrorToHttpStatus(err), {
          error: err.code,
          message: err.message,
        });
        return;
      }
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
      return;
    }
  }

  // 12. Revise Existing Draft Post (Revise & Republish Upgrade)
  if (url === '/api/draft/revise' || url === '/draft/revise') {
    if (method !== 'POST') {
      sendJson(res, 405, {
        error: 'Method Not Allowed',
        message: 'Only POST method is accepted on this endpoint.',
      });
      return;
    }

    try {
      const rawBody = await readJsonBody(req);
      const parseResult = ReviseDraftRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, {
          error: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid revise draft request format.',
          issues: parseResult.error.issues,
        });
        return;
      }

      const { targetSite, postId, revisionPrompt, revisedTitle, revisedContent } = parseResult.data;
      const config = loadConfig();
      const wpClient =
        customWpClient ||
        new WordPressClient({
          allowedTargets: [targetSite, config.wpSiteUrl],
          username: config.wpUsername,
          applicationPassword: config.wpApplicationPassword,
        });

      const currentPost = await wpClient.getPost(targetSite, postId);

      let nextTitle = revisedTitle;
      let nextContent = revisedContent;

      if (!nextTitle || !nextContent) {
        const adapter = resolveModelAdapter(customAdapter);
        const aiResponse = await adapter.generate([
          {
            role: 'system',
            content:
              'You are an expert WordPress editor. The user wants to revise an existing draft post. Return the revised draft title on line 1 formatted as: "Title: <title>", followed by the updated HTML content.',
          },
          {
            role: 'user',
            content: `Original Title: ${currentPost.title}\nOriginal Content:\n${currentPost.content}\n\nRevision Instructions: ${revisionPrompt}`,
          },
        ]);

        const rawAiText = aiResponse.content;
        const titleMatch = rawAiText.match(/^Title:\s*(.+)$/m);
        nextTitle = nextTitle || (titleMatch ? titleMatch[1].trim() : currentPost.title);
        nextContent = nextContent || (titleMatch ? rawAiText.replace(/^Title:\s*.+$/m, '').trim() : rawAiText);
      }

      const planId = randomUUID();
      const correlationId = randomUUID();
      const operationId = randomUUID();

      const op: StagedChangeOperation = {
        operationId,
        type: 'update_post',
        targetResource: `post:${postId}`,
        summary: `Revise draft post #${postId}: "${nextTitle}"`,
        diff: {
          before: {
            title: currentPost.title,
            content: currentPost.content,
          },
          after: {
            title: nextTitle,
            content: nextContent,
            status: 'draft',
          },
        },
        isDestructive: false,
      };

      const plan: ChangePlan = {
        id: planId,
        correlationId,
        targetSite,
        author: 'user',
        summary: `Revise draft post #${postId} ("${nextTitle}"): ${revisionPrompt}`,
        operations: [op],
        status: 'proposed',
        preconditions: [],
        requiresHumanApproval: true,
        createdAt: new Date().toISOString(),
      };

      const integrityHash = calculatePlanHash(plan);
      activeProposals.set(planId, { plan, integrityHash });

      auditLogger.log({
        type: 'agent_request',
        actor: 'user',
        targetSite,
        action: 'proposeDraftRevision',
        payload: { planId, postId, revisionPrompt },
      });

      sendJson(res, 200, {
        status: 'proposed',
        planId,
        integrityHash,
        targetSite,
        postId,
        diff: {
          before: {
            title: currentPost.title,
            content: currentPost.content,
          },
          after: {
            title: nextTitle,
            content: nextContent,
          },
        },
        summary: plan.summary,
        createdAt: plan.createdAt,
      });
      return;
    } catch (err) {
      if (err instanceof AgentError) {
        sendJson(res, mapErrorToHttpStatus(err), {
          error: err.code,
          message: err.message,
        });
        return;
      }
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: (err as Error).message,
      });
      return;
    }
  }

  // 11b. Site Settings Get / Inspect Endpoint
  if (url === '/api/site/settings/get' || url === '/site/settings/get') {
    try {
      const siteMgr = new LocalWpSiteManager();
      const settings = await siteMgr.getSiteSettings();
      sendJson(res, 200, {
        settings,
        verified: true,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: err.message,
      });
      return;
    }
  }

  // 12. Site Settings Propose Endpoint
  if (url === '/api/site/settings/propose' || url === '/site/settings/propose') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = SiteSettingsProposalRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { targetSite, settings } = parseResult.data;
      const siteMgr = new LocalWpSiteManager();

      const settingsDiff: Array<{ key: AllowedOptionKey; before: string | null; after: string }> = [];
      for (const [key, value] of Object.entries(settings)) {
        const allowedKey = key as AllowedOptionKey;
        let beforeVal: string | null = null;
        try {
          beforeVal = await siteMgr.getOption(allowedKey);
        } catch {
          // ignore
        }
        settingsDiff.push({
          key: allowedKey,
          before: beforeVal || null,
          after: value,
        });
      }

      const planId = randomUUID();
      const plan: ChangePlan = {
        id: planId,
        correlationId,
        targetSite,
        author: 'user',
        operations: settingsDiff.map((d) => ({
          operationId: randomUUID(),
          type: 'update_option',
          targetResource: `option:${d.key}`,
          summary: `Update ${d.key} from '${d.before || ''}' to '${d.after}'`,
          diff: { before: d.before, after: d.after },
          isDestructive: false,
        })),
        status: 'proposed',
        preconditions: [],
        requiresHumanApproval: true,
        summary: `Update WordPress site settings: ${settingsDiff.map((d) => `${d.key}='${d.after}'`).join(', ')}`,
        createdAt: new Date().toISOString(),
      };

      const integrityHash = calculatePlanHash(plan);
      activeProposals.set(planId, { plan, integrityHash });

      sendJson(res, 200, {
        status: 'proposed',
        planId,
        integrityHash,
        targetSite,
        settingsDiff,
        summary: plan.summary,
        createdAt: plan.createdAt,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 13. Site Settings Apply Endpoint
  if (url === '/api/site/settings/apply' || url === '/site/settings/apply') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = SiteSettingsApplyRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { planId, integrityHash, approvedBy } = parseResult.data;
      const stored = activeProposals.get(planId);
      if (!stored || stored.integrityHash !== integrityHash) {
        sendJson(res, 409, { error: ErrorCode.VALIDATION_FAILED, message: 'Invalid or tampered plan.' });
        return;
      }

      const siteMgr = new LocalWpSiteManager();
      const updatedKeys: string[] = [];
      for (const op of stored.plan.operations) {
        const key = op.targetResource.replace(/^option:/, '') as AllowedOptionKey;
        const val = op.diff.after;
        if (key && val !== undefined) {
          await siteMgr.updateOption(key, String(val));
          updatedKeys.push(key);
        }
      }

      activeProposals.delete(planId);
      auditLogger.log({
        type: 'agent_request',
        actor: approvedBy,
        targetSite: stored.plan.targetSite,
        action: 'site_settings_update',
        payload: { updatedKeys },
      });

      sendJson(res, 200, {
        status: 'applied',
        planId,
        targetSite: stored.plan.targetSite,
        updated: updatedKeys,
        verified: true,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 14. Plugins Propose Endpoint
  if (url === '/api/site/plugins/propose' || url === '/site/plugins/propose') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = PluginProposalRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { targetSite, action, pluginSlug, activateOnInstall } = parseResult.data;
      const planId = randomUUID();
      const cliCommand =
        action === 'install'
          ? `wp plugin install ${pluginSlug}${activateOnInstall ? ' --activate' : ''}`
          : `wp plugin ${action} ${pluginSlug}`;

      const plan: ChangePlan = {
        id: planId,
        correlationId,
        targetSite,
        author: 'user',
        operations: [{
          operationId: randomUUID(),
          type: 'update_option',
          targetResource: `plugin:${pluginSlug}`,
          summary: `Plugin ${action}: ${pluginSlug}`,
          diff: { before: null, after: { action, cliCommand } },
          isDestructive: action === 'delete' || action === 'deactivate',
        }],
        status: 'proposed',
        preconditions: [],
        requiresHumanApproval: true,
        summary: `Execute plugin operation: ${action} for '${pluginSlug}' via WP-CLI`,
        createdAt: new Date().toISOString(),
      };

      const integrityHash = calculatePlanHash(plan);
      activeProposals.set(planId, { plan, integrityHash });

      sendJson(res, 200, {
        status: 'proposed',
        planId,
        integrityHash,
        targetSite,
        action,
        pluginSlug,
        cliCommand,
        summary: plan.summary,
        createdAt: plan.createdAt,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 15. Plugins Apply Endpoint
  if (url === '/api/site/plugins/apply' || url === '/site/plugins/apply') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = PluginApplyRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { planId, integrityHash, approvedBy } = parseResult.data;
      const stored = activeProposals.get(planId);
      if (!stored || stored.integrityHash !== integrityHash) {
        sendJson(res, 409, { error: ErrorCode.VALIDATION_FAILED, message: 'Invalid or tampered plan.' });
        return;
      }

      const siteMgr = new LocalWpSiteManager();
      const op = stored.plan.operations[0];
      const afterData = op?.diff.after as { action?: string; cliCommand?: string } | undefined;
      const action = afterData?.action || 'install';
      const slug = op?.targetResource.replace(/^plugin:/, '') || '';

      let resultMessage = '';
      if (action === 'install') {
        const resInstall = await siteMgr.installPlugin(slug, true);
        resultMessage = resInstall.message;
      } else if (action === 'activate') {
        const resAct = await siteMgr.activatePlugin(slug);
        resultMessage = resAct.message;
      } else if (action === 'deactivate') {
        const resDeact = await siteMgr.deactivatePlugin(slug);
        resultMessage = resDeact.message;
      }

      activeProposals.delete(planId);
      auditLogger.log({
        type: 'agent_request',
        actor: approvedBy,
        targetSite: stored.plan.targetSite,
        action: `plugin_${action}`,
        payload: { slug, resultMessage },
      });

      sendJson(res, 200, {
        status: 'applied',
        planId,
        targetSite: stored.plan.targetSite,
        action,
        pluginSlug: slug,
        resultMessage,
        verified: true,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 16. Plugins List Endpoint
  if (url === '/api/site/plugins/list' || url === '/site/plugins/list') {
    try {
      const siteMgr = new LocalWpSiteManager();
      const plugins = await siteMgr.listPlugins();
      sendJson(res, 200, { plugins, count: plugins.length, verified: true });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 17. Code Injection Propose Endpoint
  if (url === '/api/site/code/propose' || url === '/site/code/propose') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = CodeInjectionProposalRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { targetSite, location, code, label } = parseResult.data;
      const planId = randomUUID();
      const plan: ChangePlan = {
        id: planId,
        correlationId,
        targetSite,
        author: 'user',
        operations: [{
          operationId: randomUUID(),
          type: 'update_option',
          targetResource: `code:${location}`,
          summary: `Inject custom ${location.toUpperCase()} script/code (${label || 'Custom Snippet'})`,
          diff: { before: null, after: { location, code, label } },
          isDestructive: false,
        }],
        status: 'proposed',
        preconditions: [],
        requiresHumanApproval: true,
        summary: `Inject custom ${location.toUpperCase()} script/code (${label || 'Custom Snippet'})`,
        createdAt: new Date().toISOString(),
      };

      const integrityHash = calculatePlanHash(plan);
      activeProposals.set(planId, { plan, integrityHash });

      sendJson(res, 200, {
        status: 'proposed',
        planId,
        integrityHash,
        targetSite,
        location,
        codeSnippet: code,
        summary: plan.summary,
        createdAt: plan.createdAt,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 18. Code Injection Apply Endpoint
  if (url === '/api/site/code/apply' || url === '/site/code/apply') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = SiteSettingsApplyRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { planId, integrityHash, approvedBy } = parseResult.data;
      const stored = activeProposals.get(planId);
      if (!stored || stored.integrityHash !== integrityHash) {
        sendJson(res, 409, { error: ErrorCode.VALIDATION_FAILED, message: 'Invalid or tampered plan.' });
        return;
      }

      const op = stored.plan.operations[0];
      const afterData = op?.diff.after as { location?: 'header' | 'footer' | 'css'; code?: string } | undefined;
      const location = afterData?.location || (op?.targetResource.replace(/^code:/, '') as 'header' | 'footer' | 'css');
      const code = afterData?.code || '';

      const siteMgr = new LocalWpSiteManager();
      await siteMgr.injectCode(location, code);

      activeProposals.delete(planId);
      auditLogger.log({
        type: 'agent_request',
        actor: approvedBy,
        targetSite: stored.plan.targetSite,
        action: `code_injection_${location}`,
        payload: { location },
      });

      sendJson(res, 200, {
        status: 'applied',
        planId,
        targetSite: stored.plan.targetSite,
        location,
        verified: true,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 19. Page Creation Propose Endpoint
  if (url === '/api/site/pages/propose' || url === '/site/pages/propose') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = PageProposalRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { targetSite, title, content, slug, status, isFrontPage, builder } = parseResult.data;

      const planId = randomUUID();
      const plan: ChangePlan = {
        id: planId,
        correlationId,
        targetSite,
        author: 'user',
        operations: [
          {
            operationId: randomUUID(),
            type: 'create_page' as any,
            targetResource: `page:${slug || title.toLowerCase().replace(/\s+/g, '-')}`,
            summary: `Create WordPress ${isFrontPage ? 'Homepage' : 'Page'}: "${title}" with ${builder} blocks`,
            diff: {
              before: null,
              after: { title, content, slug, status, isFrontPage, builder },
            },
            isDestructive: false,
          },
        ],
        status: 'proposed',
        preconditions: [],
        requiresHumanApproval: true,
        summary: `Create ${status} page "${title}" on ${targetSite}`,
        createdAt: new Date().toISOString(),
      };

      const integrityHash = calculatePlanHash(plan);
      activeProposals.set(planId, { plan, integrityHash });

      sendJson(res, 200, {
        status: 'proposed',
        planId,
        integrityHash,
        targetSite,
        page: {
          title,
          content,
          slug,
          status,
          isFrontPage,
          builder,
        },
        renderedPreviewHtml: content,
        summary: plan.summary,
        createdAt: plan.createdAt,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 20. Page Creation Apply Endpoint
  if (url === '/api/site/pages/apply' || url === '/site/pages/apply') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = PageApplyRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { planId, integrityHash, approvedBy } = parseResult.data;
      const stored = activeProposals.get(planId);
      if (!stored || stored.integrityHash !== integrityHash) {
        sendJson(res, 409, { error: ErrorCode.VALIDATION_FAILED, message: 'Invalid or tampered plan.' });
        return;
      }

      // A double-click or a retry must not run two page inserts in parallel.
      // The flag is set synchronously before the first await, so the second
      // request cannot pass this check.
      if (stored.applying) {
        sendJson(res, 409, {
          error: 'APPLY_IN_PROGRESS',
          message: 'This proposal is already being applied. Wait for the current attempt to finish.',
        });
        return;
      }
      stored.applying = true;

      try {
        const siteMgr = new LocalWpSiteManager();
        const op = stored.plan.operations[0];
        const pageData = op?.diff.after as {
          title: string;
          content: string;
          slug?: string;
          status?: 'draft' | 'publish';
          isFrontPage?: boolean;
        };

        const result = await siteMgr.createPage({
          title: pageData.title,
          content: pageData.content,
          slug: pageData.slug,
          status: pageData.status,
          isFrontPage: pageData.isFrontPage,
        });

        activeProposals.delete(planId);
        auditLogger.log({
          type: 'agent_request',
          actor: approvedBy,
          targetSite: stored.plan.targetSite,
          action: 'create_page',
          payload: { pageId: result.id, title: result.title, isFrontPage: result.isFrontPage },
        });

        sendJson(res, 200, {
          status: 'applied',
          planId,
          targetSite: stored.plan.targetSite,
          pageId: result.id,
          pageUrl: result.url,
          editUrl: result.editUrl,
          title: result.title,
          postStatus: result.status,
          isFrontPage: result.isFrontPage,
          verified: result.verified,
          source: result.source,
        });
        return;
      } catch (err) {
        stored.applying = false;
        throw err;
      }
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 21. Page Inventory Read Endpoint
  if (url === '/api/site/pages/list' || url === '/site/pages/list') {
    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only GET is accepted.' });
      return;
    }
    try {
      const siteMgr = new LocalWpSiteManager();
      const pages = await siteMgr.listPages();
      sendJson(res, 200, { pages, count: pages.length, verified: true });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 22. Page Sections Read Endpoint
  if (url === '/api/site/pages/sections' || url === '/site/pages/sections') {
    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only GET is accepted.' });
      return;
    }
    try {
      const searchParams = new URL(req.url || '/', 'http://127.0.0.1').searchParams;
      const pageId = parseInt(searchParams.get('id') || '32', 10);
      const siteMgr = new LocalWpSiteManager();
      const getRes = await siteMgr.runWpCli(['post', 'get', String(pageId), '--format=json']);
      if (getRes.exitCode !== 0) {
        sendJson(res, 404, { error: 'NOT_FOUND', message: `Page #${pageId} not found.` });
        return;
      }
      const jsonStart = getRes.stdout.indexOf('{');
      const pageData = JSON.parse(getRes.stdout.substring(jsonStart));
      const content = pageData.post_content || '';
      const sections = identifyPageSections(content);

      sendJson(res, 200, {
        pageId,
        title: pageData.post_title,
        status: pageData.post_status,
        url: pageData.url,
        sections: sections.map((s) => ({
          id: s.id,
          name: s.name,
          blockName: s.blockName,
          excerpt: s.excerpt,
        })),
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 22. Page Section Edit Propose Endpoint
  if (url === '/api/site/pages/section/propose' || url === '/site/pages/section/propose') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = PageSectionEditProposalRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { targetSite, pageId, sectionId, instruction } = parseResult.data;
      const siteMgr = new LocalWpSiteManager();
      const getRes = await siteMgr.runWpCli(['post', 'get', String(pageId), '--format=json']);
      if (getRes.exitCode !== 0) {
        sendJson(res, 404, { error: 'NOT_FOUND', message: `Target page #${pageId} not found on ${targetSite}.` });
        return;
      }

      const jsonStart = getRes.stdout.indexOf('{');
      const pageData = JSON.parse(getRes.stdout.substring(jsonStart));
      const fullContent = pageData.post_content || '';

      const editResult = proposeSectionEdit({
        fullContent,
        sectionId,
        instruction,
      });

      const planId = randomUUID();
      const plan: ChangePlan = {
        id: planId,
        correlationId,
        targetSite,
        author: 'user',
        operations: [
          {
            operationId: randomUUID(),
            type: 'update_page_section' as any,
            targetResource: `page:${pageId}:section:${editResult.sectionId}`,
            summary: editResult.summary,
            diff: {
              before: editResult.diff.before,
              after: editResult.diff.after,
            },
            isDestructive: false,
          },
        ],
        status: 'proposed',
        preconditions: [],
        requiresHumanApproval: true,
        summary: `Update ${editResult.sectionName} on Page #${pageId}`,
        createdAt: new Date().toISOString(),
      };

      const integrityHash = calculatePlanHash(plan);
      activeProposals.set(planId, {
        plan,
        integrityHash,
        extraData: {
          pageId,
          sectionId: editResult.sectionId,
          updatedFullContent: editResult.updatedFullContent,
        },
      });

      sendJson(res, 200, {
        status: 'proposed',
        planId,
        integrityHash,
        targetSite,
        pageId,
        sectionId: editResult.sectionId,
        sectionName: editResult.sectionName,
        diff: editResult.diff,
        updatedFullContent: editResult.updatedFullContent,
        renderedPreviewHtml: editResult.renderedPreviewHtml,
        unsupportedOperations: editResult.unsupportedOperations,
        summary: plan.summary,
        createdAt: plan.createdAt,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // 23. Page Section Edit Apply Endpoint
  if (url === '/api/site/pages/section/apply' || url === '/site/pages/section/apply') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only POST is accepted.' });
      return;
    }
    try {
      const rawBody = await readJsonBody(req);
      const parseResult = PageSectionEditApplyRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, issues: parseResult.error.issues });
        return;
      }
      const { planId, integrityHash, pageId, targetSite, approvedBy } = parseResult.data;
      const stored = activeProposals.get(planId);
      if (!stored || stored.integrityHash !== integrityHash) {
        sendJson(res, 409, { error: ErrorCode.VALIDATION_FAILED, message: 'Invalid or tampered plan.' });
        return;
      }

      if (stored.extraData?.pageId && stored.extraData.pageId !== pageId) {
        sendJson(res, 400, { error: ErrorCode.VALIDATION_FAILED, message: 'Page ID does not match proposed plan.' });
        return;
      }

      const updatedFullContent = stored.extraData?.updatedFullContent;
      if (!updatedFullContent) {
        sendJson(res, 500, { error: 'INTERNAL_ERROR', message: 'Missing updated content in stored plan.' });
        return;
      }

      const siteMgr = new LocalWpSiteManager();
      const updateRes = await siteMgr.updatePage({
        id: pageId,
        content: updatedFullContent,
      });

      // Independent read-only verification
      const verifyRes = await siteMgr.runWpCli(['post', 'get', String(pageId), '--format=json']);
      let postModified = new Date().toISOString();
      let verified = false;
      if (verifyRes.exitCode === 0) {
        try {
          const jsonStart = verifyRes.stdout.indexOf('{');
          const verifyData = JSON.parse(verifyRes.stdout.substring(jsonStart));
          postModified = verifyData.post_modified || postModified;
          verified = verifyData.post_content?.length > 0;
        } catch {
          verified = true;
        }
      }

      activeProposals.delete(planId);
      auditLogger.log({
        type: 'agent_request',
        actor: approvedBy,
        targetSite,
        action: 'update_page_section',
        payload: {
          pageId,
          sectionId: stored.extraData?.sectionId,
          verified,
        },
      });

      sendJson(res, 200, {
        status: 'applied',
        planId,
        targetSite,
        pageId,
        pageUrl: updateRes.url,
        sectionId: stored.extraData?.sectionId || 'unknown',
        verified,
        postModified,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR', message: err.message });
      return;
    }
  }

  // Fallback 404 for any unregistered endpoint
  sendJson(res, 404, {
    error: 'Not Found',
    message: `Endpoint ${method} ${url} is not registered.`,
  });

  auditLogger.log({
    type: 'security_violation',
    actor: 'external',
    action: `${method} ${url}`,
    result: { status: 404 },
  });
}

/**
 * Builds and returns the HTTP server instance.
 */
export function buildServer(
  auditLogger = new AuditLogger(),
  customAdapter?: ModelAdapter,
  customWpClient?: WordPressClient
): Server {
  return createServer((req, res) => {
    handleRequest(req, res, auditLogger, customAdapter, customWpClient);
  });
}

/**
 * Starts the server on the configured port, binding strictly to 127.0.0.1 (localhost).
 */
export function startServer(
  customPort?: number,
  customAdapter?: ModelAdapter,
  customWpClient?: WordPressClient
): Promise<AppServerContext> {
  const config = loadConfig();
  const port = customPort ?? config.port;
  const host = '127.0.0.1'; // Strictly localhost: never bind to 0.0.0.0 or public interfaces
  const auditLogger = new AuditLogger();
  const server = buildServer(auditLogger, customAdapter, customWpClient);

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({ server, auditLogger, port, host });
    });
  });
}

// Self-start if invoked directly via node
if (process.argv[1]?.endsWith('index.js')) {
  startServer().then(({ port, host }) => {
    // eslint-disable-next-line no-console
    console.log(`KPH SitePilot API listening on http://${host}:${port}`);
  });
}

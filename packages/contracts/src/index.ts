import { z } from 'zod';

/**
 * Standard structured error codes for the agent system.
 */
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  UNKNOWN_TOOL: 'UNKNOWN_TOOL',
  WRITE_OPERATION_DENIED: 'WRITE_OPERATION_DENIED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SSRF_BLOCKED: 'SSRF_BLOCKED',
  TARGET_NOT_ALLOWED: 'TARGET_NOT_ALLOWED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  MODEL_ERROR: 'MODEL_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AUTH_FAILED: 'AUTH_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Structured schema for Agent runtime errors.
 */
export const AgentErrorSchema = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
});

export type AgentErrorPayload = z.infer<typeof AgentErrorSchema>;

export class AgentError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.details = details;
  }

  toJSON(): AgentErrorPayload {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/**
 * Tool Permission levels.
 * In Phase 1, only READ_ONLY tools are executable.
 */
export const PermissionLevel = {
  READ_ONLY: 'read_only',
  SAFE_WRITE: 'safe_write',
  ADMIN_MUTATION: 'admin_mutation',
} as const;

export type PermissionLevel = (typeof PermissionLevel)[keyof typeof PermissionLevel];

/**
 * Tool Execution Context passed into contracts.
 */
export interface ToolExecutionContext {
  readonly siteUrl: string;
  readonly correlationId: string;
  readonly dryRun?: boolean;
}

/**
 * Normalized Tool Invocation Call.
 */
export const ToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.unknown()),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * Normalized Tool Result.
 */
export const ToolResultSchema = z.object({
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  output: z.unknown(),
  isError: z.boolean().default(false),
  error: AgentErrorSchema.optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * Generic interface for a standardized Tool Contract.
 */
export interface ToolContract<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: TInputSchema;
  readonly permissionLevel: PermissionLevel;
  readonly isReadOnly: boolean;
  execute(
    params: z.infer<TInputSchema>,
    context: ToolExecutionContext
  ): Promise<TOutput>;
}

/**
 * 1. Read-Only Tool: site.inspect
 */
export const SiteInspectInputSchema = z.object({
  siteSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-_.]+$/i, 'Invalid site slug characters'),
  includePlugins: z.boolean().default(false),
});

export type SiteInspectInput = z.infer<typeof SiteInspectInputSchema>;

export const SiteInspectResultSchema = z.object({
  siteName: z.string(),
  siteUrl: z.string(),
  wpVersion: z.string(),
  activeTheme: z.string().optional(),
  plugins: z.array(z.string()).optional(),
  status: z.enum(['ok', 'unreachable', 'misconfigured']),
});

export type SiteInspectResult = z.infer<typeof SiteInspectResultSchema>;

/**
 * 2. Read-Only Tool: page.read
 */
export const PageReadInputSchema = z.object({
  siteSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-_.]+$/i, 'Invalid site slug characters'),
  pageIdOrSlug: z.string().min(1),
});

export type PageReadInput = z.infer<typeof PageReadInputSchema>;

export const PageReadResultSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  title: z.string(),
  status: z.string(),
  excerpt: z.string().optional(),
  content: z.string().optional(),
});

export type PageReadResult = z.infer<typeof PageReadResultSchema>;

/**
 * 3. Controlled Mutation Tool: post.createDraft (Phase 5)
 */
export const PostCreateDraftInputSchema = z.object({
  siteSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-_.]+$/i, 'Invalid site slug characters'),
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(200, 'Title exceeds 200 characters'),
  content: z.string().min(1, 'Content cannot be empty'),
  excerpt: z.string().max(500).optional(),
});

export type PostCreateDraftInput = z.infer<typeof PostCreateDraftInputSchema>;

export const PostCreateDraftResultSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  title: z.string(),
  status: z.literal('draft'),
  editLink: z.string().url(),
  duplicateWarning: z.string().optional(),
  verified: z.boolean(),
});

export type PostCreateDraftResult = z.infer<typeof PostCreateDraftResultSchema>;

/**
 * 4. Read-Only Tool: builder.detect (Phase 6)
 */
export const BuilderDetectInputSchema = z.object({
  siteSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-_.]+$/i, 'Invalid site slug characters')
    .optional(),
});

export type BuilderDetectInput = z.infer<typeof BuilderDetectInputSchema>;

/**
 * 5. Read-Only Tool: builder.inspect (Phase 6)
 */
export const BuilderInspectInputSchema = z.object({
  siteSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-_.]+$/i, 'Invalid site slug characters')
    .optional(),
  pageIdOrSlug: z.string().min(1),
});

export type BuilderInspectInput = z.infer<typeof BuilderInspectInputSchema>;

/**
 * Agent Request & Response Contracts.
 */
export const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
});

export const ConversationHistorySchema = z.array(ConversationMessageSchema).max(12);

export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const AgentRequestSchema = z.object({
  correlationId: z.string().uuid(),
  prompt: z.string().min(1),
  targetSite: z.string().url(),
  conversationHistory: ConversationHistorySchema.optional(),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

export const AgentResponseSchema = z.object({
  correlationId: z.string().uuid(),
  status: z.enum(['success', 'denied', 'error']),
  content: z.string(),
  executedTools: z.array(ToolResultSchema),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

/**
 * Phase 4: Structured Website Planning & Design System Contracts.
 */
export const DesignSystemSchema = z.object({
  name: z.string().min(1),
  palette: z.object({
    primary: z.string().regex(/^#[0-9a-f]{6}$/i, 'Primary color must be hex code (e.g. #059669)'),
    secondary: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    text: z.string().regex(/^#[0-9a-f]{6}$/i),
    muted: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  typography: z.object({
    headingFont: z.string().min(1),
    bodyFont: z.string().min(1),
    baseSizePx: z.number().int().min(12).max(24).default(16),
  }),
  borderRadius: z.enum(['none', 'sm', 'md', 'lg', 'full']).default('md'),
  spacingScale: z.enum(['compact', 'normal', 'relaxed']).default('normal'),
});

export type DesignSystem = z.infer<typeof DesignSystemSchema>;

export const SectionSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'hero',
    'features',
    'testimonials',
    'pricing',
    'cta',
    'faq',
    'contact',
    'content',
  ]),
  headline: z.string().min(1).max(200),
  subheadline: z.string().max(500).optional(),
  callToAction: z
    .object({
      label: z.string().min(1),
      href: z.string().min(1),
      style: z.enum(['primary', 'secondary', 'outline']).default('primary'),
    })
    .optional(),
  items: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        icon: z.string().optional(),
        meta: z.string().optional(),
      })
    )
    .optional(),
});

export type Section = z.infer<typeof SectionSchema>;

export const PagePlanSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-_]+$/i),
  title: z.string().min(1).max(100),
  isHome: z.boolean().default(false),
  seo: z.object({
    metaTitle: z.string().max(70),
    metaDescription: z.string().max(160),
    keywords: z.array(z.string()).optional(),
  }),
  sections: z.array(SectionSchema).min(1),
});

export type PagePlan = z.infer<typeof PagePlanSchema>;

export const SitePlanSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  purpose: z.string().min(1).max(1000),
  targetAudience: z.string().min(1).max(500),
  designSystem: DesignSystemSchema,
  navigation: z.array(
    z.object({
      label: z.string().min(1),
      slug: z.string().min(1),
      isCta: z.boolean().optional(),
    })
  ),
  pages: z.array(PagePlanSchema).min(1),
  accessibility: z.object({
    wcagTarget: z.enum(['A', 'AA', 'AAA']).default('AA'),
    highContrastCompliant: z.boolean().default(true),
    notes: z.array(z.string()).default([]),
  }),
  version: z.number().int().default(1),
  createdAt: z.string(),
});

export type SitePlan = z.infer<typeof SitePlanSchema>;

export const PlanGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(8192),
  siteTitle: z.string().max(100).optional(),
  stylePreferences: z
    .object({
      tone: z.string().optional(),
      preferredColors: z.array(z.string()).optional(),
    })
    .optional(),
  existingPlanId: z.string().uuid().optional(),
});

export type PlanGenerationRequest = z.infer<typeof PlanGenerationRequestSchema>;

/**
 * Phase 5: Controlled WordPress Editing & Staged Change Plan Contracts.
 */
export const ChangeOperationTypeSchema = z.enum([
  'create_page',
  'update_page',
  'delete_page',
  'update_option',
  'create_post',
  'update_post',
  'publish_post',
]);

export type ChangeOperationType = z.infer<typeof ChangeOperationTypeSchema>;

export const StagedChangeOperationSchema = z.object({
  operationId: z.string().uuid(),
  type: ChangeOperationTypeSchema,
  targetResource: z.string().min(1), // e.g. "page:sample-page" or "option:blogname"
  summary: z.string().min(1),
  diff: z.object({
    before: z.unknown().optional(),
    after: z.unknown(),
  }),
  isDestructive: z.boolean().default(false),
});

export type StagedChangeOperation = z.infer<typeof StagedChangeOperationSchema>;

export const ChangePlanStatusSchema = z.enum([
  'proposed',
  'validated',
  'approved',
  'rejected',
  'applied',
  'failed',
  'rolled_back',
]);

export type ChangePlanStatus = z.infer<typeof ChangePlanStatusSchema>;

export const PreconditionCheckSchema = z.object({
  resourceId: z.string().min(1),
  expectedHashOrVersion: z.string().min(1),
  status: z.enum(['pending', 'satisfied', 'stale']),
});

export type PreconditionCheck = z.infer<typeof PreconditionCheckSchema>;

export const ChangePlanSchema = z.object({
  id: z.string().uuid(),
  correlationId: z.string().uuid(),
  targetSite: z.string().url(),
  author: z.string().min(1),
  summary: z.string().min(1),
  operations: z.array(StagedChangeOperationSchema).min(1),
  status: ChangePlanStatusSchema.default('proposed'),
  preconditions: z.array(PreconditionCheckSchema).default([]),
  requiresHumanApproval: z.literal(true).default(true),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  appliedAt: z.string().optional(),
  dryRunResult: z
    .object({
      success: z.boolean(),
      warnings: z.array(z.string()),
      estimatedImpact: z.string(),
    })
    .optional(),
  createdAt: z.string(),
});

export type ChangePlan = z.infer<typeof ChangePlanSchema>;

/**
 * Phase 5 Approval and Proposal Schemas
 */
export const DraftProposalRequestSchema = z.object({
  targetSite: z.string().url(),
  prompt: z.string().min(1).max(8192),
  title: z.string().max(200).optional(),
  content: z.string().optional(),
});

export type DraftProposalRequest = z.infer<typeof DraftProposalRequestSchema>;

export const DraftProposalResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  post: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    excerpt: z.string().optional(),
    status: z.literal('draft'),
  }),
  duplicateWarning: z.string().optional(),
  summary: z.string(),
  createdAt: z.string(),
});

export type DraftProposalResponse = z.infer<typeof DraftProposalResponseSchema>;

export const ChangePlanApprovalRequestSchema = z.object({
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  approvedBy: z.string().default('user'),
  post: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    excerpt: z.string().optional(),
  }),
});

export type ChangePlanApprovalRequest = z.infer<typeof ChangePlanApprovalRequestSchema>;

export const ChangePlanApprovalResponseSchema = z.object({
  status: z.literal('applied'),
  planId: z.string().uuid(),
  targetSite: z.string().url(),
  post: PostCreateDraftResultSchema,
});

export type ChangePlanApprovalResponse = z.infer<typeof ChangePlanApprovalResponseSchema>;

/**
 * Phase 6: WordPress Builder Integrations Contracts.
 */
export const BuilderTypeSchema = z.enum([
  'gutenberg',
  'elementor',
  'acf',
  'woocommerce',
  'theme',
]);

export type BuilderType = z.infer<typeof BuilderTypeSchema>;

export const BuilderCapabilitiesSchema = z.object({
  gutenberg: z.boolean(),
  elementor: z.boolean(),
  acf: z.boolean(),
  woocommerce: z.boolean(),
  theme: z.object({
    name: z.string(),
    isBlockTheme: z.boolean(),
    version: z.string().optional(),
  }),
  supportedNamespaces: z.array(z.string()),
});

export type BuilderCapabilities = z.infer<typeof BuilderCapabilitiesSchema>;

export const BuilderDetectRequestSchema = z.object({
  targetSite: z.string().url(),
});

export type BuilderDetectRequest = z.infer<typeof BuilderDetectRequestSchema>;

export const BuilderDetectResponseSchema = z.object({
  targetSite: z.string().url(),
  capabilities: BuilderCapabilitiesSchema,
});

export type BuilderDetectResponse = z.infer<typeof BuilderDetectResponseSchema>;

export const BuilderProposeRequestSchema = z.object({
  targetSite: z.string().url(),
  builderType: BuilderTypeSchema,
  pageIdOrSlug: z.string().optional(),
  title: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).max(8192),
  section: SectionSchema.optional(),
  acfData: z.record(z.unknown()).optional(),
  wooProductData: z.record(z.unknown()).optional(),
});

export type BuilderProposeRequest = z.infer<typeof BuilderProposeRequestSchema>;

export const BuilderProposeResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  builderType: BuilderTypeSchema,
  title: z.string(),
  diff: z.object({
    before: z.unknown().nullable(),
    after: z.unknown(),
  }),
  renderedPreviewHtml: z.string(),
  unsupportedFeatures: z.array(z.string()).default([]),
  summary: z.string(),
  createdAt: z.string(),
});

export type BuilderProposeResponse = z.infer<typeof BuilderProposeResponseSchema>;

/**
 * Phase 7: Supabase & SaaS Multi-Tenant Contracts.
 */
export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']).default('user'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const EncryptedCredentialsPayloadSchema = z.object({
  iv: z.string().regex(/^[0-9a-f]+$/i, 'IV must be hex encoded'),
  ciphertext: z.string().regex(/^[0-9a-f]+$/i, 'Ciphertext must be hex encoded'),
  tag: z.string().regex(/^[0-9a-f]{32}$/i, 'Auth tag must be 128-bit hex encoded'),
  algorithm: z.literal('aes-256-gcm').default('aes-256-gcm'),
});

export type EncryptedCredentialsPayload = z.infer<typeof EncryptedCredentialsPayloadSchema>;

export const WordPressConnectionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  targetSite: z.string().url(),
  environment: z.enum(['local', 'staging', 'production']).default('local'),
  encryptedCredentials: EncryptedCredentialsPayloadSchema,
  status: z.enum(['active', 'revoked']).default('active'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WordPressConnection = z.infer<typeof WordPressConnectionSchema>;

export const ChangeProposalRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  targetSite: z.string().url(),
  planHash: z.string().min(1),
  status: ChangePlanStatusSchema,
  stagedPlan: ChangePlanSchema,
  approvedBy: z.string().uuid().optional(),
  appliedAt: z.string().optional(),
  createdAt: z.string(),
});

export type ChangeProposalRecord = z.infer<typeof ChangeProposalRecordSchema>;

export const AuditEventRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  eventType: z.string().min(1),
  payload: z.record(z.unknown()),
  correlationId: z.string().uuid(),
  createdAt: z.string(),
});

export type AuditEventRecord = z.infer<typeof AuditEventRecordSchema>;

/**
 * Intelligent Agent Workspace Upgrade Contracts
 */
export const TaskStatusSchema = z.enum([
  'queued',
  'planning',
  'running',
  'waiting_for_input',
  'waiting_for_approval',
  'verifying',
  'completed',
  'failed',
  'cancelled',
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskStepSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
  toolName: z.string().optional(),
  toolArgs: z.record(z.unknown()).optional(),
  toolOutput: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});

export type TaskStep = z.infer<typeof TaskStepSchema>;

export const AgentExecutionTaskSchema = z.object({
  id: z.string().uuid(),
  correlationId: z.string().uuid(),
  prompt: z.string().min(1),
  targetSite: z.string().url(),
  mode: z.enum(['agent', 'writes', 'chat']),
  status: TaskStatusSchema,
  steps: z.array(TaskStepSchema).default([]),
  currentStepIndex: z.number().int().default(0),
  waitingFor: z
    .object({
      type: z.enum(['approval', 'credentials', 'clarification']),
      details: z.record(z.unknown()).default({}),
      promptMessage: z.string(),
    })
    .optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentExecutionTask = z.infer<typeof AgentExecutionTaskSchema>;

export const QueuedTaskSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string().min(1),
  targetSite: z.string().url(),
  mode: z.enum(['agent', 'writes', 'chat']),
  queuedAt: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'cancelled', 'failed']).default('queued'),
});

export type QueuedTask = z.infer<typeof QueuedTaskSchema>;

export const IntentCategorySchema = z.enum([
  'informational_chat',
  'site_inspection',
  'content_mutation',
  'builder_structure',
  'clarification_needed',
  'unsupported_request',
]);

export type IntentCategory = z.infer<typeof IntentCategorySchema>;

export const IntentDetectionResultSchema = z.object({
  category: IntentCategorySchema,
  confidence: z.number().min(0).max(1),
  recommendedMode: z.enum(['agent', 'writes', 'chat']),
  reason: z.string(),
  requiresModeSwitch: z.boolean(),
  suggestedActionPill: z
    .object({
      label: z.string(),
      targetMode: z.enum(['agent', 'writes', 'chat']),
      description: z.string(),
    })
    .optional(),
  clarificationQuestion: z.string().optional(),
});

export type IntentDetectionResult = z.infer<typeof IntentDetectionResultSchema>;

export const MissingPrerequisiteSchema = z.object({
  type: z.enum(['wp_application_password', 'site_unreachable', 'unsupported_builder']),
  targetSite: z.string().url(),
  title: z.string(),
  description: z.string(),
  instructions: z.array(z.string()),
  resolutionAction: z.string().optional(),
});

export type MissingPrerequisite = z.infer<typeof MissingPrerequisiteSchema>;

/**
 * Live Agent Activity Feed Contracts
 */
export const TaskActivityEventSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().uuid(),
  stepId: z.string().optional(),
  stepName: z.string().min(1),
  status: z.enum([
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
    'awaiting_approval',
  ]),
  message: z.string().min(1),
  elapsedMs: z.number().int().nonnegative().optional(),
  timestamp: z.string(),
  toolName: z.string().optional(),
  toolArgs: z.record(z.unknown()).optional(),
  toolOutput: z.unknown().optional(),
  error: z.string().optional(),
});

export type TaskActivityEvent = z.infer<typeof TaskActivityEventSchema>;

/**
 * Verified WordPress Resource Contract for Persistent Side-by-Side Preview
 */
export const VerifiedResourceSchema = z.object({
  id: z.number().int(),
  type: z.enum(['post', 'page']).default('post'),
  slug: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'publish', 'pending', 'private']),
  content: z.string(),
  excerpt: z.string().optional(),
  editLink: z.string().url(),
  targetSite: z.string().url(),
  lastVerifiedAt: z.string(),
  isLivePublished: z.boolean().default(false),
});

export type VerifiedResource = z.infer<typeof VerifiedResourceSchema>;

/**
 * Pre-flight Publish / Deploy Checklist Contracts
 */
export const PreflightCheckSeveritySchema = z.enum(['blocking', 'warning', 'info']);
export type PreflightCheckSeverity = z.infer<typeof PreflightCheckSeveritySchema>;

export const PreflightCheckItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  severity: PreflightCheckSeveritySchema,
  passed: z.boolean(),
  details: z.string().optional(),
});
export type PreflightCheckItem = z.infer<typeof PreflightCheckItemSchema>;

export const PreflightChecklistSchema = z.object({
  passed: z.boolean(),
  hasBlockingFailures: z.boolean(),
  warningCount: z.number().int().nonnegative(),
  items: z.array(PreflightCheckItemSchema),
});
export type PreflightChecklist = z.infer<typeof PreflightChecklistSchema>;

/**
 * Separate Privileged Publishing Contracts
 */
export const PublishProposalRequestSchema = z.object({
  targetSite: z.string().url(),
  postId: z.number().int().positive(),
  postType: z.enum(['post', 'page']).default('post'),
});

export type PublishProposalRequest = z.infer<typeof PublishProposalRequestSchema>;

export const PublishProposalResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  post: VerifiedResourceSchema,
  intendedStatus: z.literal('publish'),
  warning: z.string(),
  summary: z.string(),
  createdAt: z.string(),
  checklist: PreflightChecklistSchema.optional(),
});

export type PublishProposalResponse = z.infer<typeof PublishProposalResponseSchema>;

export const PublishApprovalRequestSchema = z.object({
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  postId: z.number().int().positive(),
  intendedStatus: z.literal('publish'),
  approvedBy: z.string().default('user'),
});

export type PublishApprovalRequest = z.infer<typeof PublishApprovalRequestSchema>;

export const PublishApprovalResponseSchema = z.object({
  status: z.literal('applied'),
  planId: z.string().uuid(),
  targetSite: z.string().url(),
  post: VerifiedResourceSchema,
  verified: z.literal(true),
});

export type PublishApprovalResponse = z.infer<typeof PublishApprovalResponseSchema>;

/**
 * Revise Draft Workflow Contracts
 */
export const ReviseDraftRequestSchema = z.object({
  targetSite: z.string().url(),
  postId: z.number().int().positive(),
  revisionPrompt: z.string().min(1).max(8192),
  revisedTitle: z.string().max(200).optional(),
  revisedContent: z.string().optional(),
});

export type ReviseDraftRequest = z.infer<typeof ReviseDraftRequestSchema>;

export const ReviseDraftResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  postId: z.number().int().positive(),
  diff: z.object({
    before: z.object({
      title: z.string(),
      content: z.string(),
    }),
    after: z.object({
      title: z.string(),
      content: z.string(),
    }),
  }),
  summary: z.string(),
  createdAt: z.string(),
});

export type ReviseDraftResponse = z.infer<typeof ReviseDraftResponseSchema>;

/**
 * Prompt-Driven WordPress Site Management Contracts
 */

export const AllowedOptionKeySchema = z.enum([
  'blogname',
  'blogdescription',
  'permalink_structure',
  'show_on_front',
  'page_on_front',
  'page_for_posts',
  'posts_per_page',
  'default_comment_status',
  'default_ping_status',
  'users_can_register',
  'header_scripts',
  'footer_scripts',
  'custom_css',
]);

export type AllowedOptionKey = z.infer<typeof AllowedOptionKeySchema>;

export const SiteSettingsProposalRequestSchema = z.object({
  targetSite: z.string().url(),
  settings: z.record(AllowedOptionKeySchema, z.string()),
  reason: z.string().optional(),
});

export type SiteSettingsProposalRequest = z.infer<typeof SiteSettingsProposalRequestSchema>;

export const SiteSettingsProposalResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  settingsDiff: z.array(
    z.object({
      key: AllowedOptionKeySchema,
      before: z.string().nullable(),
      after: z.string(),
    })
  ),
  summary: z.string(),
  createdAt: z.string(),
});

export type SiteSettingsProposalResponse = z.infer<typeof SiteSettingsProposalResponseSchema>;

export const SiteSettingsApplyRequestSchema = z.object({
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  approvedBy: z.string().default('user'),
});

export type SiteSettingsApplyRequest = z.infer<typeof SiteSettingsApplyRequestSchema>;

export const PluginOperationActionSchema = z.enum([
  'install',
  'activate',
  'deactivate',
  'delete',
  'list',
]);

export type PluginOperationAction = z.infer<typeof PluginOperationActionSchema>;

export const PluginProposalRequestSchema = z.object({
  targetSite: z.string().url(),
  action: PluginOperationActionSchema,
  pluginSlug: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i),
  activateOnInstall: z.boolean().default(true),
});

export type PluginProposalRequest = z.infer<typeof PluginProposalRequestSchema>;

export const PluginProposalResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  action: PluginOperationActionSchema,
  pluginSlug: z.string(),
  summary: z.string(),
  cliCommand: z.string(),
  createdAt: z.string(),
});

export type PluginProposalResponse = z.infer<typeof PluginProposalResponseSchema>;

export const PluginApplyRequestSchema = z.object({
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  approvedBy: z.string().default('user'),
});

export type PluginApplyRequest = z.infer<typeof PluginApplyRequestSchema>;

export const CodeInjectionProposalRequestSchema = z.object({
  targetSite: z.string().url(),
  location: z.enum(['header', 'footer', 'css']),
  code: z.string().min(1).max(65535),
  label: z.string().min(1).max(100).optional(),
});

export type CodeInjectionProposalRequest = z.infer<typeof CodeInjectionProposalRequestSchema>;

export const CodeInjectionProposalResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  location: z.enum(['header', 'footer', 'css']),
  codeSnippet: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});

export type CodeInjectionProposalResponse = z.infer<typeof CodeInjectionProposalResponseSchema>;

/**
 * Page & Website Creation Contracts
 */
export const PageProposalRequestSchema = z.object({
  targetSite: z.string().url(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  slug: z.string().optional(),
  status: z.enum(['draft', 'publish']).default('draft'),
  isFrontPage: z.boolean().default(false),
  builder: z.enum(['gutenberg', 'elementor']).default('gutenberg'),
});

export type PageProposalRequest = z.infer<typeof PageProposalRequestSchema>;

export const PageProposalResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  page: z.object({
    title: z.string(),
    content: z.string(),
    slug: z.string().optional(),
    status: z.enum(['draft', 'publish']),
    isFrontPage: z.boolean(),
    builder: z.enum(['gutenberg', 'elementor']),
  }),
  renderedPreviewHtml: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});

export type PageProposalResponse = z.infer<typeof PageProposalResponseSchema>;

export const PageApplyRequestSchema = z.object({
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  approvedBy: z.string().default('user'),
});

export type PageApplyRequest = z.infer<typeof PageApplyRequestSchema>;

export const PageApplyResponseSchema = z.object({
  status: z.literal('applied'),
  planId: z.string().uuid(),
  targetSite: z.string().url(),
  pageId: z.number().int(),
  pageUrl: z.string(),
  editUrl: z.string(),
  title: z.string(),
  postStatus: z.string(),
  isFrontPage: z.boolean(),
  verified: z.boolean(),
});

export type PageApplyResponse = z.infer<typeof PageApplyResponseSchema>;

export const PageLifecycleProposalRequestSchema = z
  .object({
    targetSite: z.string().url(),
    action: z.enum(['update', 'trash']),
    pageId: z.number().int().positive(),
    title: z.string().min(1).max(200).optional(),
    content: z.string().min(1).max(200000).optional(),
  })
  .superRefine((request, context) => {
    if (request.action === 'update' && !request.title && !request.content) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide a new page title or content for an update.',
      });
    }
    if (request.action === 'trash' && (request.title || request.content)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Trash proposals cannot include page content changes.',
      });
    }
  });

export type PageLifecycleProposalRequest = z.infer<
  typeof PageLifecycleProposalRequestSchema
>;

export const PageDesignGenerationRequestSchema = z.object({
  targetSite: z.string().url(),
  pageId: z.number().int().positive(),
  instruction: z.string().trim().min(1).max(2000),
}).strict();

export type PageDesignGenerationRequest = z.infer<
  typeof PageDesignGenerationRequestSchema
>;

export const PageDesignSectionSchema = z.object({
  type: z.enum(['hero', 'content', 'features', 'cta']),
  heading: z.string().trim().min(1).max(120),
  body: z.string().trim().max(1000).optional(),
  items: z.array(z.string().trim().min(1).max(180)).min(2).max(4).optional(),
}).strict().superRefine((section, context) => {
  if (section.type === 'features' && !section.items) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'Feature sections require a list of items.',
    });
  }
  if (section.type !== 'features' && section.items) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'Only feature sections may contain items.',
    });
  }
});

export const PageDesignSchema = z.object({
  sections: z.array(PageDesignSectionSchema).min(2).max(8),
}).strict().superRefine((design, context) => {
  if (design.sections[0]?.type !== 'hero') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sections', 0, 'type'],
      message: 'The first section must be a hero.',
    });
  }
  if (design.sections[design.sections.length - 1]?.type !== 'cta') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sections', design.sections.length - 1, 'type'],
      message: 'The final section must be a call to action.',
    });
  }
});

export type PageDesign = z.infer<typeof PageDesignSchema>;

export const PersistedChatMessageSchema = z.object({
  id: z.string().trim().min(1).max(200),
  role: z.enum(['user', 'assistant']),
  content: z.string().max(10000),
  timestamp: z.string().datetime(),
  status: z.enum(['sending', 'success', 'denied', 'error']).optional(),
  targetSite: z.string().max(2048).optional(),
}).strict();

export const PersistedChatConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messages: z.array(PersistedChatMessageSchema).max(100),
}).strict();

export const ChatHistorySchema = z.object({
  conversations: z.array(PersistedChatConversationSchema).max(50),
  activeConversationId: z.string().uuid().nullable(),
}).strict().superRefine((history, context) => {
  if (JSON.stringify(history.conversations).length > 2 * 1024 * 1024) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['conversations'],
      message: 'Saved chat history exceeds the 2 MB storage limit.',
    });
  }
  if (
    history.activeConversationId !== null &&
    !history.conversations.some((conversation) => conversation.id === history.activeConversationId)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['activeConversationId'],
      message: 'The active conversation must exist in the saved history.',
    });
  }
});

export type PersistedChatMessage = z.infer<typeof PersistedChatMessageSchema>;
export type PersistedChatConversation = z.infer<typeof PersistedChatConversationSchema>;
export type ChatHistory = z.infer<typeof ChatHistorySchema>;

export const PageLifecycleProposalResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  action: z.enum(['update', 'trash']),
  pageId: z.number().int().positive(),
  title: z.string(),
  slug: z.string(),
  pageStatus: z.string(),
  before: z.string(),
  after: z.string(),
  pageUrl: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});

export type PageLifecycleProposalResponse = z.infer<
  typeof PageLifecycleProposalResponseSchema
>;

export const PageLifecycleApplyRequestSchema = z.object({
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  approvedBy: z.string().default('user'),
});

export type PageLifecycleApplyRequest = z.infer<
  typeof PageLifecycleApplyRequestSchema
>;

export const PageLifecycleApplyResponseSchema = z.object({
  status: z.literal('applied'),
  planId: z.string().uuid(),
  targetSite: z.string().url(),
  action: z.enum(['update', 'trash']),
  pageId: z.number().int().positive(),
  title: z.string(),
  slug: z.string(),
  pageStatus: z.string(),
  pageUrl: z.string(),
  verified: z.boolean(),
});

export type PageLifecycleApplyResponse = z.infer<
  typeof PageLifecycleApplyResponseSchema
>;

/**
 * Scoped Page Section Edit Contracts
 */
export const PageSectionPropertyPatchSchema = z.record(
  z.string().min(1).max(64),
  z.union([z.string().max(160), z.number(), z.boolean()])
);

export type PageSectionPropertyPatch = z.infer<typeof PageSectionPropertyPatchSchema>;

export const PageSectionEditProposalRequestSchema = z.object({
  targetSite: z.string().url(),
  pageId: z.number().int().positive(),
  sectionId: z.string().min(1),
  instruction: z.string().min(1).max(2000).optional(),
  propertyPatch: PageSectionPropertyPatchSchema.optional(),
  targetSectionName: z.string().optional(),
}).refine(
  (data) => Boolean((data.instruction && data.instruction.trim().length > 0) || (data.propertyPatch && Object.keys(data.propertyPatch).length > 0)),
  { message: 'Either "instruction" or "propertyPatch" must be provided.' }
);

export type PageSectionEditProposalRequest = z.infer<typeof PageSectionEditProposalRequestSchema>;

export const PageSectionEditProposalResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  pageId: z.number().int(),
  sectionId: z.string(),
  sectionName: z.string(),
  diff: z.object({
    before: z.string(),
    after: z.string(),
  }),
  updatedFullContent: z.string(),
  renderedPreviewHtml: z.string(),
  unsupportedOperations: z.array(z.string()),
  summary: z.string(),
  createdAt: z.string(),
});

export type PageSectionEditProposalResponse = z.infer<typeof PageSectionEditProposalResponseSchema>;

export const PageSectionEditApplyRequestSchema = z.object({
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  pageId: z.number().int().positive(),
  approvedBy: z.string().default('user'),
});

export type PageSectionEditApplyRequest = z.infer<typeof PageSectionEditApplyRequestSchema>;

export const PageSectionEditApplyResponseSchema = z.object({
  status: z.literal('applied'),
  planId: z.string().uuid(),
  targetSite: z.string().url(),
  pageId: z.number().int(),
  pageUrl: z.string(),
  sectionId: z.string(),
  verified: z.boolean(),
  postModified: z.string(),
});

export type PageSectionEditApplyResponse = z.infer<typeof PageSectionEditApplyResponseSchema>;

export const PAGE_SNAPSHOT_RETENTION_LIMIT = 20;
export const PAGE_SNAPSHOT_MAX_CONTENT_BYTES = 2 * 1024 * 1024;

const PageSnapshotContentSchema = z.string().refine(
  (content) => new TextEncoder().encode(content).byteLength <= PAGE_SNAPSHOT_MAX_CONTENT_BYTES,
  `Page content must not exceed ${PAGE_SNAPSHOT_MAX_CONTENT_BYTES} bytes`
);

export const PageSnapshotSchema = z.object({
  id: z.string().uuid(),
  targetSite: z.string().url(),
  pageId: z.number().int().positive(),
  title: z.string().max(500),
  slug: z.string().max(200),
  status: z.string().min(1).max(50),
  content: PageSnapshotContentSchema,
  sourceOperation: z.enum(['page_update', 'page_section_edit', 'page_trash', 'page_restore']),
  capturedAt: z.string().datetime(),
}).strict();

export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;

export const CreatePageSnapshotSchema = PageSnapshotSchema.omit({
  id: true,
  capturedAt: true,
}).strict();

export type CreatePageSnapshot = z.infer<typeof CreatePageSnapshotSchema>;

export const PageSnapshotSummarySchema = PageSnapshotSchema.omit({ content: true });

export type PageSnapshotSummary = z.infer<typeof PageSnapshotSummarySchema>;

export const PageSnapshotListRequestSchema = z.object({
  targetSite: z.string().url(),
  pageId: z.number().int().positive(),
}).strict();

export const PageSnapshotReadRequestSchema = PageSnapshotListRequestSchema.extend({
  snapshotId: z.string().uuid(),
}).strict();

export const PageSnapshotListResponseSchema = z.object({
  snapshots: z.array(PageSnapshotSummarySchema).max(PAGE_SNAPSHOT_RETENTION_LIMIT),
}).strict();

export const PageSnapshotReadResponseSchema = z.object({
  snapshot: PageSnapshotSchema.nullable(),
}).strict();

export const PageSnapshotCompareResponseSchema = z.object({
  snapshot: PageSnapshotSchema,
  currentPage: z.object({
    title: z.string(),
    slug: z.string(),
    status: z.string(),
    content: PageSnapshotContentSchema,
  }).strict(),
  differences: z.object({
    titleChanged: z.boolean(),
    statusChanged: z.boolean(),
    contentChanged: z.boolean(),
  }).strict(),
}).strict();
export type PageSnapshotComparison = z.infer<typeof PageSnapshotCompareResponseSchema>;

export const PageSnapshotRestoreProposalRequestSchema = PageSnapshotReadRequestSchema;

export const PageSnapshotRestoreProposalResponseSchema = z.object({
  status: z.literal('proposed'),
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  pageId: z.number().int().positive(),
  pageUrl: z.string().url(),
  snapshot: PageSnapshotSummarySchema,
  current: z.object({
    title: z.string(),
    status: z.string(),
  }).strict(),
  restoreTo: z.object({
    title: z.string(),
    status: z.string(),
  }).strict(),
  changes: z.object({
    titleChanged: z.boolean(),
    statusChanged: z.boolean(),
    contentChanged: z.boolean(),
  }).strict(),
  summary: z.string(),
  createdAt: z.string().datetime(),
}).strict();
export type PageSnapshotRestoreProposal = z.infer<typeof PageSnapshotRestoreProposalResponseSchema>;

export const PageSnapshotRestoreApplyRequestSchema = z.object({
  planId: z.string().uuid(),
  integrityHash: z.string().min(1),
  targetSite: z.string().url(),
  pageId: z.number().int().positive(),
  approvedBy: z.string().default('user'),
}).strict();

export const PageSnapshotRestoreApplyResponseSchema = z.object({
  status: z.literal('applied'),
  planId: z.string().uuid(),
  targetSite: z.string().url(),
  pageId: z.number().int().positive(),
  pageUrl: z.string().url(),
  restoredSnapshotId: z.string().uuid(),
  backupSnapshotId: z.string().uuid(),
  verified: z.literal(true),
}).strict();
export type PageSnapshotRestoreApplyResponse = z.infer<typeof PageSnapshotRestoreApplyResponseSchema>;

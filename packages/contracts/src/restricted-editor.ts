import { z } from 'zod';

/** Experimental review contract only. Intentionally not exported from index.ts.
 * No tool registration, transport, persistence or execution permission is provided.
 */
const Id = z.string().uuid();
const Digest = z.string().length(64).regex(/^[a-f0-9]{64}$/);
const PlanId = z.string().length(32).regex(/^[a-f0-9]{32}$/);
export const RestrictedFilePathSchema = z.string().max(240)
  .regex(/^(themes|plugins)\/[a-zA-Z0-9_-]+\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(php|js|css)(?![\s\S])/)
  .refine((value) => !/(config|secret|credential|password|private|vendor|node_modules|kph-sitepilot|wp-agent-bridge)/i.test(value));

/** Source text deliberately excluded from approval requests and audit metadata. */
export const RestrictedFileApprovalSchema = z.object({
  siteId: Id,
  proposalId: PlanId,
  confirmation: PlanId,
  beforeHash: Digest,
  afterHash: Digest,
}).strict();

/** Loaded from trusted server storage, NEVER accepted as request authority. */
export const RestrictedFileProposalSchema = z.object({
  siteId: Id,
  ownerId: Id,
  proposalId: PlanId,
  path: RestrictedFilePathSchema,
  beforeHash: Digest,
  afterHash: Digest,
  risk: z.literal('R3'),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  status: z.enum(['pending', 'consumed', 'revoked']),
}).strict().refine((value) => value.expiresAt > value.createdAt && value.expiresAt - value.createdAt <= 600_000);

/** All values must be resolved server-side from session/site/connector state.
 * This type is not a substitute for RLS, signed attestation, CSRF or ownership lookup.
 */
export const RestrictedFileReviewContextSchema = z.object({
  actorId: Id,
  siteId: Id,
  ownerId: Id,
  environment: z.enum(['staging', 'production', 'local', 'development']),
  operatorOptIn: z.boolean(),
  connectorProtocol: z.literal('restricted-files-v1'),
  allowedPaths: z.array(RestrictedFilePathSchema).max(100),
  currentHash: Digest,
  now: z.number().int().nonnegative(),
}).strict();

export type RestrictedReviewResult =
  | { ok: true; reviewOnly: true; risk: 'R3' }
  | { ok: false; code: 'INVALID_CONTRACT' | 'FORBIDDEN' | 'STAGING_REQUIRED' | 'NOT_ALLOWLISTED' | 'PROPOSAL_UNAVAILABLE' | 'APPROVAL_MISMATCH' | 'FILE_CHANGED' };

/** Pure preflight for a future review handler, NOT an execution authorization. */
export function validateRestrictedFileReview(request: unknown, savedProposal: unknown, trustedContext: unknown): RestrictedReviewResult {
  const input = RestrictedFileApprovalSchema.safeParse(request);
  const saved = RestrictedFileProposalSchema.safeParse(savedProposal);
  const context = RestrictedFileReviewContextSchema.safeParse(trustedContext);
  if (!input.success || !saved.success || !context.success) return { ok: false, code: 'INVALID_CONTRACT' };
  const r = input.data; const p = saved.data; const c = context.data;
  if (c.actorId !== c.ownerId || p.ownerId !== c.actorId || p.siteId !== c.siteId || r.siteId !== c.siteId || !c.operatorOptIn) return { ok: false, code: 'FORBIDDEN' };
  if (c.environment !== 'staging') return { ok: false, code: 'STAGING_REQUIRED' };
  if (!c.allowedPaths.includes(p.path)) return { ok: false, code: 'NOT_ALLOWLISTED' };
  if (p.status !== 'pending' || p.createdAt > c.now || p.expiresAt <= c.now) return { ok: false, code: 'PROPOSAL_UNAVAILABLE' };
  if (r.proposalId !== p.proposalId || r.confirmation !== p.proposalId || r.beforeHash !== p.beforeHash || r.afterHash !== p.afterHash) return { ok: false, code: 'APPROVAL_MISMATCH' };
  if (c.currentHash !== p.beforeHash) return { ok: false, code: 'FILE_CHANGED' };
  return { ok: true, reviewOnly: true, risk: 'R3' };
}

/** Cannot be enabled through request fields or environment flags. */
export function restrictedFileExecutionGate(): { allowed: false; code: 'FILE_EDITOR_NOT_RELEASED' } {
  return { allowed: false, code: 'FILE_EDITOR_NOT_RELEASED' };
}

/** Purpose binds signed bodies to this endpoint; compatibility is explicit, not a version guess. */
export const RestrictedFileIngestSchema = z.object({
  purpose: z.literal('restricted-file-review-v1'),
  protocol: z.literal('restricted-files-v1'),
  engineVersion: z.literal(1),
  proposalId: PlanId,
  path: RestrictedFilePathSchema,
  beforeHash: Digest, afterHash: Digest, currentHash: Digest,
  before: z.string().max(65536), after: z.string().max(65536),
  observedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  environment: z.literal('staging'), operatorOptIn: z.literal(true),
  canEdit: z.literal(true), allowedPaths: z.array(RestrictedFilePathSchema).min(1).max(100),
}).strict();

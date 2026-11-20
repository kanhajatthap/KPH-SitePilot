import { z } from 'zod';
import { RestrictedFilePathSchema } from '@wp-agent/contracts/experimental/restricted-editor';
const id = z.string().length(32).regex(/^[a-f0-9]+$/);
const digest = z.string().length(64).regex(/^[a-f0-9]+$/);
export const ReviewSourceSchema = z.object({
  siteId: z.string().uuid(), proposalId: id, path: RestrictedFilePathSchema,
  before: z.string().max(65536), after: z.string().max(65536), beforeHash: digest, afterHash: digest,
  validUntil: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }), risk: z.literal('R3'), executionAllowed: z.literal(false),
}).strict();
export type ReviewSource = z.infer<typeof ReviewSourceSchema>;
export const ReceiptStatusSchema = z.object({
  siteId: z.string().uuid(), proposalId: id, status: z.enum(['pending','consumed','revoked']),
  expired: z.boolean(), reviewOnly: z.literal(true), executionAllowed: z.literal(false),
}).strict();
export function readFailureMessage(status: number): string {
  if (status === 401) return 'Your session has expired. Sign in again before reviewing source.';
  if (status === 403 || status === 404) return 'This review is unavailable or you no longer own this site. Source has been cleared.';
  if (status === 409) return 'This proposal is expired, changed or no longer available. Request a fresh connector proposal.';
  return 'Review service unavailable. No source is shown. Reload status when the service is available.';
}
export const UNCERTAIN_RECEIPT = 'The review result could not be confirmed. It may have been recorded. Submission is locked until you reload status; do not submit blindly.';

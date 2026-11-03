/**
 * E1-08 — shared, SDK-free project ownership policy.
 *
 * The service-role client bypasses RLS, so ownership must never be inferred
 * from a client-supplied id. This port takes a verified `userId` (from the
 * session) and an injectable RLS-backed lookup, and returns one typed outcome.
 * Another user's project answers 404, not 403: a 403 would confirm that the
 * project exists and leak an existence oracle.
 */

export interface ProjectOwnerRecord {
  owner_id: string;
}

export type ProjectOwnerLookup = (
  projectId: string
) => Promise<ProjectOwnerRecord | null>;

export type OwnershipReason =
  | 'unauthenticated'
  | 'invalid-id'
  | 'not-found'
  | 'other-owner'
  | 'lookup-error';

export interface OwnershipInput {
  projectId: string | null | undefined;
  userId: string | null | undefined;
  lookup: ProjectOwnerLookup;
}

export type OwnershipOutcome =
  | { ok: true; projectId: string; userId: string }
  | {
      ok: false;
      reason: OwnershipReason;
      status: 401 | 404 | 503;
      code: string;
      message: string;
    };

const NOT_FOUND = { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } as const;

/** UUID-shaped ids only; anything else is rejected before a database lookup. */
export function isValidProjectId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function authorizeProjectAccess(input: OwnershipInput): Promise<OwnershipOutcome> {
  const { projectId, userId, lookup } = input;

  if (!userId) {
    return {
      ok: false,
      reason: 'unauthenticated',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Sign in to access this project.',
    };
  }

  if (!projectId || !isValidProjectId(projectId)) {
    return { ok: false, reason: 'invalid-id', status: 404, ...NOT_FOUND };
  }

  let record: ProjectOwnerRecord | null;
  try {
    record = await lookup(projectId);
  } catch {
    return {
      ok: false,
      reason: 'lookup-error',
      status: 503,
      code: 'OWNERSHIP_UNAVAILABLE',
      message: 'Project ownership could not be verified right now.',
    };
  }

  if (!record || !record.owner_id) {
    return { ok: false, reason: 'not-found', status: 404, ...NOT_FOUND };
  }

  if (record.owner_id !== userId) {
    // Deliberately identical to "not found" — no cross-tenant existence oracle.
    return { ok: false, reason: 'other-owner', status: 404, ...NOT_FOUND };
  }

  return { ok: true, projectId, userId };
}

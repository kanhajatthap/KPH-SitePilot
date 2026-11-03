import { NextResponse } from 'next/server';
import {
  authorizeProjectAccess,
  type ProjectOwnerLookup,
  type ProjectOwnerRecord,
} from '@wp-agent/supabase';
import { createSupabaseServerClient } from '../supabase/server';
import { authenticateApiRequest, type AuthResult } from './api';

/**
 * E1-08 — one shared guard for every private project route.
 *
 * Identity always comes from the verified session (`authenticateApiRequest`),
 * never from a request body. Ownership is resolved through the RLS-backed
 * session client, so a service-role key is not needed to answer "is this mine?".
 * Local mode keeps the single-user workspace behaviour.
 */
export interface ProjectGuardDeps {
  authenticate?: () => Promise<AuthResult>;
  lookup?: ProjectOwnerLookup;
}

export type ProjectGuardResult =
  | { ok: true; mode: 'local' | 'saas'; userId: string | null; projectId?: string }
  | { ok: false; response: NextResponse };

async function defaultLookup(projectId: string): Promise<ProjectOwnerRecord | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('OWNERSHIP_CLIENT_UNAVAILABLE');

  const { data, error } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .limit(1);
  if (error) throw new Error('OWNERSHIP_QUERY_FAILED');

  const row = Array.isArray(data) ? data[0] : null;
  return row && typeof row.owner_id === 'string' ? { owner_id: row.owner_id } : null;
}

export async function requireOwnedProject(
  projectId: string | null | undefined,
  deps: ProjectGuardDeps = {}
): Promise<ProjectGuardResult> {
  const authenticate = deps.authenticate ?? authenticateApiRequest;
  const auth = await authenticate();
  if (!auth.ok) return { ok: false, response: auth.response };

  const { context } = auth;
  if (context.mode === 'local') {
    return { ok: true, mode: 'local', userId: null };
  }

  const outcome = await authorizeProjectAccess({
    projectId,
    userId: context.user?.id ?? null,
    lookup: deps.lookup ?? defaultLookup,
  });

  if (!outcome.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: outcome.code, code: outcome.code, message: outcome.message },
        { status: outcome.status, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }

  return { ok: true, mode: 'saas', userId: outcome.userId, projectId: outcome.projectId };
}

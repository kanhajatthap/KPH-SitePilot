import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { createOwnedProject, listOwnedProjects } from '../../../../lib/connector/store';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

const CreateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * GET /api/connector/projects — lists the caller's projects (auto-provisioning
 * a default "My Sites" project if the account has none yet).
 */
export async function GET() {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to manage projects.' },
      400
    );
  }

  if (!createSupabaseAdminClient()) {
    return json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Project storage is not configured.' },
      503
    );
  }

  try {
    const projects = await listOwnedProjects(auth.context.user.id, auth.context.user.email);
    return json({ projects });
  } catch (error) {
    return json({ error: 'STORAGE_UNAVAILABLE', message: (error as Error).message }, 503);
  }
}

/**
 * POST /api/connector/projects — creates a new project workspace for the caller.
 */
export async function POST(req: Request) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json(
      { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to create a project.' },
      400
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'VALIDATION_FAILED', message: 'Request body must be valid JSON.' }, 400);
  }

  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Provide a project name (1–120 characters) and optional description (≤2000 characters).',
      },
      400
    );
  }

  if (!createSupabaseAdminClient()) {
    return json(
      { error: 'STORAGE_UNAVAILABLE', message: 'Project storage is not configured.' },
      503
    );
  }

  try {
    const project = await createOwnedProject(
      auth.context.user.id,
      parsed.data,
      auth.context.user.email
    );
    if (!project) {
      return json({ error: 'STORAGE_UNAVAILABLE', message: 'Project could not be created.' }, 503);
    }
    return json({ project }, 201);
  } catch (error) {
    return json({ error: 'STORAGE_UNAVAILABLE', message: (error as Error).message }, 503);
  }
}

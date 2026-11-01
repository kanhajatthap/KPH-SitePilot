import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '../../../../../lib/auth/api';
import { findOwnedSite, revokeSiteForUser, updateOwnedSite } from '../../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Platform site APIs (E2-15) — one connected site.
 *
 *   GET    /api/connector/sites/{id}   detail + capability summary
 *   PATCH  /api/connector/sites/{id}   rename / environment / status / scopes
 *   DELETE /api/connector/sites/{id}   disconnect (soft revoke, E2-17)
 *
 * Sites are created by pairing (`POST /api/connector/pairing-codes` then
 * `POST /api/connector/pair`), never by hand: a row without credentials is a site
 * that can never answer. "Create" therefore stays in E2-06.
 *
 * A site belonging to somebody else answers **404**, never 403 — an id must not
 * become an oracle for what exists in another account.
 */

const SITE_STATUSES = ['active', 'paused', 'revoked'] as const;
const ENVIRONMENTS = ['local', 'staging', 'production'] as const;
const SCOPES = ['read', 'content', 'media', 'site_ops', 'commerce', 'files', 'code'] as const;

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    environment: z.enum(ENVIRONMENTS).optional(),
    status: z.enum(SITE_STATUSES).optional(),
    scopes: z.array(z.enum(SCOPES)).min(1).max(SCOPES.length).optional(),
  })
  .strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Discriminated union so the error branch narrows cleanly (no `| undefined`). */
type GateResult =
  | { kind: 'error'; error: NextResponse }
  | { kind: 'user'; user: { id: string; email: string } };

/** Shared gate: session, account, and a well-formed id. */
async function gate(id: string): Promise<GateResult> {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return { kind: 'error', error: auth.response };

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return {
      kind: 'error',
      error: json(
        { error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to manage a connected site.' },
        400
      ),
    };
  }

  if (!UUID_PATTERN.test(id)) {
    return {
      kind: 'error',
      error: json({ error: 'VALIDATION_FAILED', message: 'Site id must be a UUID.' }, 400),
    };
  }

  return { kind: 'user', user: auth.context.user };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params;
  const gated = await gate(id);
  if (gated.kind === 'error') return gated.error;

  try {
    const site = await findOwnedSite(gated.user.id, id);
    if (!site) {
      return json({ error: 'SITE_NOT_FOUND', message: 'That site is not connected to your account.' }, 404);
    }

    return json({ site, capabilitySummary: summariseCapabilities(site.capabilities) });
  } catch (error) {
    return json({ error: 'STORAGE_UNAVAILABLE', message: (error as Error).message }, 503);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params;
  const gated = await gate(id);
  if (gated.kind === 'error') return gated.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'VALIDATION_FAILED', message: 'Body must be valid JSON.' }, 400);
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: 'VALIDATION_FAILED',
        message: 'One or more fields are invalid.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      400
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return json({ error: 'VALIDATION_FAILED', message: 'Nothing to update.' }, 400);
  }

  try {
    const site = await updateOwnedSite(gated.user.id, id, parsed.data);
    if (!site) {
      return json({ error: 'SITE_NOT_FOUND', message: 'That site is not connected to your account.' }, 404);
    }
    return json({ site });
  } catch (error) {
    return json({ error: 'STORAGE_UNAVAILABLE', message: (error as Error).message }, 503);
  }
}

/**
 * DELETE /api/connector/sites/{id} — the owner disconnects a site.
 *
 * Revoking is a soft delete: the row keeps its history, but the site can no
 * longer claim jobs or send heartbeats until it is paired again. Queued jobs are
 * cancelled so nothing is left dangling.
 */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return json({ error: 'CONNECTOR_REQUIRES_ACCOUNT', message: 'Sign in to disconnect a site.' }, 400);
  }

  if (!UUID_PATTERN.test(id)) {
    return json({ error: 'VALIDATION_FAILED', message: 'Site id must be a UUID.' }, 400);
  }

  const result = await revokeSiteForUser(id, auth.context.user.id);

  if (result === 'not_found') {
    return json({ error: 'SITE_NOT_FOUND', message: 'That site is not connected to your account.' }, 404);
  }

  if (result === 'unavailable') {
    return json({ error: 'STORAGE_UNAVAILABLE', message: 'Connected sites are not available right now.' }, 503);
  }

  return json({ site: { id, status: 'revoked' } });
}

/**
 * Turns the raw manifest into the handful of facts the UI actually shows, so the
 * capability graph (E4-06) does not have to understand every connector version.
 */
function summariseCapabilities(capabilities: Record<string, unknown>) {
  const plugins = Array.isArray(capabilities.plugins) ? capabilities.plugins.length : 0;
  const postTypes = Array.isArray(capabilities.postTypes) ? capabilities.postTypes.length : 0;
  const taxonomies = Array.isArray(capabilities.taxonomies) ? capabilities.taxonomies.length : 0;

  return {
    pluginCount: plugins,
    postTypeCount: postTypes,
    taxonomyCount: taxonomies,
    blockTheme: Boolean((capabilities.theme as { blockTheme?: boolean } | undefined)?.blockTheme),
    multisite: Boolean(capabilities.multisite),
    isManifestEmpty: Object.keys(capabilities).length === 0,
  };
}

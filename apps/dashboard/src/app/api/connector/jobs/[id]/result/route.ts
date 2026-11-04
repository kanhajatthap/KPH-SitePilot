import { handleJobResult } from '../../../../../../lib/connector/handlers';
import { buildConnectorDeps, connectorJson } from '../../../../../../lib/connector/route-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/connector/jobs/{id}/result — signed by the site secret.
 *
 * The signed body is the source of truth (it carries jobId); the path id must
 * agree. Reporting twice is a no-op, so a network retry cannot double-apply.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const rawBody = await req.text();

    const built = buildConnectorDeps();
    if (!built.ok) return connectorJson(built.output);
    return connectorJson(await handleJobResult(id, req.headers, rawBody, built.deps));
  } catch {
    return connectorJson({
      status: 500,
      body: { error: 'INTERNAL_ERROR', message: 'Connector request could not be confirmed. Check site activity before trying again.' },
    });
  }
}

import { handleUnpair } from '../../../../lib/connector/handlers';
import { buildConnectorDeps, connectorJson } from '../../../../lib/connector/route-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/connector/unpair — signed by the site secret.
 *
 * The plugin calls this when an administrator clicks "Disconnect", so the
 * platform stops queueing work for a site that no longer holds credentials.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const built = buildConnectorDeps();
    if (!built.ok) return connectorJson(built.output);
    return connectorJson(await handleUnpair(req.headers, rawBody, built.deps));
  } catch {
    return connectorJson({
      status: 500,
      body: { error: 'INTERNAL_ERROR', message: 'Connector request could not be confirmed. Check site activity before trying again.' },
    });
  }
}

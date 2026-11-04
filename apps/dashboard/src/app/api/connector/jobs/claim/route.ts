import { handleClaim } from '../../../../../lib/connector/handlers';
import { buildConnectorDeps, connectorJson } from '../../../../../lib/connector/route-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/connector/jobs/claim — signed by the site secret.
 *
 * Hands out at most one job per call. The lease is atomic (`claim_next_job`),
 * so two connectors polling at the same moment can never run the same job.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const built = buildConnectorDeps();
    if (!built.ok) return connectorJson(built.output);
    return connectorJson(await handleClaim(req.headers, rawBody, built.deps));
  } catch {
    return connectorJson({
      status: 500,
      body: { error: 'INTERNAL_ERROR', message: 'Connector request could not be confirmed. Check site activity before trying again.' },
    });
  }
}

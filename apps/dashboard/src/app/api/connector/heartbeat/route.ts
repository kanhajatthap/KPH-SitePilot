import { handleHeartbeat } from '../../../../lib/connector/handlers';
import { buildConnectorDeps, connectorJson } from '../../../../lib/connector/route-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/connector/heartbeat — signed by the site secret.
 *
 * Reports liveness plus the capability manifest, which the platform stores on
 * the site row so the planner knows what this WordPress install can do.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const built = buildConnectorDeps();
  if (!built.ok) return connectorJson(built.output);

  try {
    return connectorJson(await handleHeartbeat(req.headers, rawBody, built.deps));
  } catch (error) {
    return connectorJson({
      status: 500,
      body: { error: 'INTERNAL_ERROR', message: (error as Error).message },
    });
  }
}

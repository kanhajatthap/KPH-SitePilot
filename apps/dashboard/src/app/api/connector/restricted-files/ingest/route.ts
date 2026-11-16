import { buildConnectorDeps, connectorJson } from '../../../../../lib/connector/route-helpers';
import { boundedBody, ingestRestrictedReview } from '../../../../../lib/connector/restricted-ingestion';
import { createSupabaseAdminClient } from '../../../../../lib/supabase/admin';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  try {
    const built = buildConnectorDeps(); if (!built.ok) return connectorJson(built.output);
    const client = createSupabaseAdminClient(); if (!client) return connectorJson({ status: 503, body: { error: 'STORAGE_UNAVAILABLE' } });
    const rawBody = await boundedBody(req, 262144);
    const d = built.deps;
    return connectorJson(await ingestRestrictedReview({ headers: req.headers, rawBody, store: d.authStore, encryptionKey: d.encryptionKey, isRateLimited: d.isRateLimited }, async (record) => {
      const { data, error } = await client.rpc('ingest_restricted_file_review', record);
      if (error) throw new Error('STORAGE_UNAVAILABLE');
      return data === true;
    }));
  } catch (error) {
    return connectorJson({ status: error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 503, body: { error: 'INGESTION_UNAVAILABLE' } });
  }
}

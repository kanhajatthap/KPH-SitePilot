import { handleCredentialsVault } from '../_shared/credentials-vault.ts';
import { authenticateRequest, importVaultKey, serviceRequest } from '../_shared/runtime.ts';

const env = Deno.env;

Deno.serve(async (request: Request) => {
  const allowedOrigin = env.get('DASHBOARD_ORIGIN');
  try {
    const encryptionKey = await importVaultKey(env);
    return await handleCredentialsVault(request, {
      allowedOrigin,
      encryptionKey,
      authenticate: (req) => authenticateRequest(req, env),
      isProjectOwner: async (userId, projectId) => {
        const rows = await serviceRequest<Array<{ id: string }>>(
          env,
          `projects?select=id&id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(userId)}&limit=1`
        );
        return rows.length === 1;
      },
      getConnection: async (projectId, connectionId) => {
        const rows = await serviceRequest<Array<{
          id: string;
          project_id: string;
          target_site: string;
          status: 'active' | 'revoked';
        }>>(
          env,
          `wordpress_connections?select=id,project_id,target_site,status&id=eq.${encodeURIComponent(connectionId)}&project_id=eq.${encodeURIComponent(projectId)}&limit=1`
        );
        return rows[0] || null;
      },
      createConnection: async ({ id, projectId, targetSite, encryptedCredentials }) => {
        await serviceRequest(env, 'wordpress_connections', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            id,
            project_id: projectId,
            target_site: targetSite,
            environment: 'local',
            encrypted_credentials: encryptedCredentials,
            status: 'active',
          }),
        });
      },
      revokeConnection: async (projectId, connectionId) => {
        await serviceRequest(
          env,
          `wordpress_connections?id=eq.${encodeURIComponent(connectionId)}&project_id=eq.${encodeURIComponent(projectId)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ status: 'revoked', updated_at: new Date().toISOString() }),
          }
        );
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'VAULT_UNAVAILABLE', message: 'Credential operation could not be completed.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
});

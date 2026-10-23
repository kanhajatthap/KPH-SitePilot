import { handleAgentProxy } from '../_shared/agent-proxy.ts';
import { authenticateRequest, serviceRequest } from '../_shared/runtime.ts';

const env = Deno.env;

Deno.serve(async (request: Request) => {
  const allowedOrigin = env.get('DASHBOARD_ORIGIN');
  try {
    return await handleAgentProxy(request, {
      allowedOrigin,
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
      consumeRateLimit: async (userId) => {
        const result = await serviceRequest<boolean>(
          env,
          'rpc/consume_agent_rate_limit',
          {
            method: 'POST',
            body: JSON.stringify({ p_user_id: userId, p_max_requests: 30, p_window_seconds: 60 }),
          }
        );
        return result === true;
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'AGENT_SERVICE_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleAgentProxyRequest,
  MemoryRateLimiter,
  TokenVerifier,
  TenantVerificationService,
  AuthContext,
} from '../src/agent-proxy.js';
import { ErrorCode } from '@wp-agent/contracts';

describe('Agent Proxy Edge Function Handler', () => {
  let mockTokenVerifier: TokenVerifier;
  let mockTenantService: TenantVerificationService;
  let rateLimiter: MemoryRateLimiter;

  const validUserId = '11111111-1111-1111-1111-111111111111';
  const validProjectId = '22222222-2222-2222-2222-222222222222';
  const validConnectionId = '33333333-3333-3333-3333-333333333333';
  const validTargetSite = 'http://plugin-test.local';

  beforeEach(() => {
    rateLimiter = new MemoryRateLimiter({ windowMs: 1000, maxRequests: 3 });

    mockTokenVerifier = {
      verifyToken: async (token: string): Promise<AuthContext> => {
        if (token === 'valid-jwt-token') {
          return {
            userId: validUserId,
            email: 'user@example.com',
            role: 'user',
          };
        }
        throw new Error('Invalid token');
      },
    };

    mockTenantService = {
      verifyUserProjectAccess: async (userId: string, projectId: string) => {
        return userId === validUserId && projectId === validProjectId;
      },
      getProjectConnection: async (projectId: string, connectionId: string) => {
        if (projectId === validProjectId && connectionId === validConnectionId) {
          return {
            id: validConnectionId,
            projectId: validProjectId,
            targetSite: validTargetSite,
            status: 'active',
          };
        }
        if (connectionId === 'revoked-conn-id') {
          return {
            id: 'revoked-conn-id',
            projectId: validProjectId,
            targetSite: validTargetSite,
            status: 'revoked',
          };
        }
        return null;
      },
    };
  });

  it('rejects missing or non-Bearer authorization header with 401', async () => {
    const res = await handleAgentProxyRequest(
      {
        projectId: validProjectId,
        connectionId: validConnectionId,
        agentPayload: {},
      },
      {
        tokenVerifier: mockTokenVerifier,
        tenantService: mockTenantService,
        forwardAgentCall: async () => ({}),
      }
    );

    expect(res.statusCode).toBe(401);
    expect((res.body.error as { code: string }).code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('rejects invalid or expired JWT token with 401', async () => {
    const res = await handleAgentProxyRequest(
      {
        authHeader: 'Bearer expired-or-invalid-jwt',
        projectId: validProjectId,
        connectionId: validConnectionId,
        agentPayload: {},
      },
      {
        tokenVerifier: mockTokenVerifier,
        tenantService: mockTenantService,
        forwardAgentCall: async () => ({}),
      }
    );

    expect(res.statusCode).toBe(401);
    expect((res.body.error as { code: string }).code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('enforces rate limits per tenant/user with 429', async () => {
    const validReq = {
      authHeader: 'Bearer valid-jwt-token',
      projectId: validProjectId,
      connectionId: validConnectionId,
      agentPayload: {
        correlationId: '00000000-0000-0000-0000-000000000001',
        prompt: 'test prompt',
        targetSite: validTargetSite,
      },
    };

    const deps = {
      tokenVerifier: mockTokenVerifier,
      tenantService: mockTenantService,
      rateLimiter,
      forwardAgentCall: async () => ({ status: 'success' }),
    };

    // First 3 requests pass
    for (let i = 0; i < 3; i++) {
      const res = await handleAgentProxyRequest(validReq, deps);
      expect(res.statusCode).toBe(200);
    }

    // 4th request exceeds rate limit
    const throttledRes = await handleAgentProxyRequest(validReq, deps);
    expect(throttledRes.statusCode).toBe(429);
    expect((throttledRes.body.error as { code: string }).code).toBe(ErrorCode.FORBIDDEN);
  });

  it('denies access if user does not own the project with 403', async () => {
    const res = await handleAgentProxyRequest(
      {
        authHeader: 'Bearer valid-jwt-token',
        projectId: 'foreign-project-id-999',
        connectionId: validConnectionId,
        agentPayload: {},
      },
      {
        tokenVerifier: mockTokenVerifier,
        tenantService: mockTenantService,
        forwardAgentCall: async () => ({}),
      }
    );

    expect(res.statusCode).toBe(403);
    expect((res.body.error as { code: string }).code).toBe(ErrorCode.FORBIDDEN);
  });

  it('denies access if connection is revoked with 403', async () => {
    const res = await handleAgentProxyRequest(
      {
        authHeader: 'Bearer valid-jwt-token',
        projectId: validProjectId,
        connectionId: 'revoked-conn-id',
        agentPayload: {
          correlationId: '00000000-0000-0000-0000-000000000001',
          prompt: 'test prompt',
          targetSite: validTargetSite,
        },
      },
      {
        tokenVerifier: mockTokenVerifier,
        tenantService: mockTenantService,
        forwardAgentCall: async () => ({}),
      }
    );

    expect(res.statusCode).toBe(403);
    expect((res.body.error as { code: string }).code).toBe(ErrorCode.FORBIDDEN);
  });

  it('denies access if target site in payload differs from authorized connection with 400', async () => {
    const res = await handleAgentProxyRequest(
      {
        authHeader: 'Bearer valid-jwt-token',
        projectId: validProjectId,
        connectionId: validConnectionId,
        agentPayload: {
          correlationId: '00000000-0000-0000-0000-000000000001',
          prompt: 'test prompt',
          targetSite: 'http://different-site.local',
        },
      },
      {
        tokenVerifier: mockTokenVerifier,
        tenantService: mockTenantService,
        forwardAgentCall: async () => ({}),
      }
    );

    expect(res.statusCode).toBe(400);
    expect((res.body.error as { code: string }).code).toBe(ErrorCode.TARGET_NOT_ALLOWED);
  });

  it('successfully authorizes and forwards valid requests', async () => {
    let forwarded = false;

    const res = await handleAgentProxyRequest(
      {
        authHeader: 'Bearer valid-jwt-token',
        projectId: validProjectId,
        connectionId: validConnectionId,
        agentPayload: {
          correlationId: '00000000-0000-0000-0000-000000000001',
          prompt: 'Inspect site',
          targetSite: validTargetSite,
        },
      },
      {
        tokenVerifier: mockTokenVerifier,
        tenantService: mockTenantService,
        forwardAgentCall: async (payload, target) => {
          forwarded = true;
          expect(payload.prompt).toBe('Inspect site');
          expect(target).toBe(validTargetSite);
          return { status: 'success', content: 'Inspected ok' };
        },
      }
    );

    expect(res.statusCode).toBe(200);
    expect(forwarded).toBe(true);
    expect((res.body.data as { status: string }).status).toBe('success');
  });
});

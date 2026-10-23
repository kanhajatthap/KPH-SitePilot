import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleAgentProxy,
  AgentProxyDependencies,
} from '../../../supabase/functions/_shared/agent-proxy';
import {
  handleCredentialsVault,
  VaultDependencies,
} from '../../../supabase/functions/_shared/credentials-vault';
import { authenticateRequest } from '../../../supabase/functions/_shared/runtime';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const connectionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const targetSite = 'http://plugin-test.local';

function post(body: unknown, authorization = 'Bearer valid-token'): Request {
  return new Request('https://edge.example.test/function', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function vaultDependencies(overrides: Partial<VaultDependencies> = {}): Promise<VaultDependencies> {
  return {
    authenticate: vi.fn(async (request) =>
      request.headers.get('Authorization') === 'Bearer valid-token' ? { id: userId } : null
    ),
    isProjectOwner: vi.fn(async (ownerId) => ownerId === userId),
    getConnection: vi.fn(async () => ({
      id: connectionId,
      project_id: projectId,
      target_site: targetSite,
      status: 'active' as const,
    })),
    createConnection: vi.fn(async () => undefined),
    revokeConnection: vi.fn(async () => undefined),
    encryptionKey: await crypto.subtle.importKey(
      'raw',
      new Uint8Array(32),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    ),
    ...overrides,
  };
}

function agentDependencies(overrides: Partial<AgentProxyDependencies> = {}): AgentProxyDependencies {
  return {
    authenticate: vi.fn(async (request) =>
      request.headers.get('Authorization') === 'Bearer valid-token' ? { id: userId } : null
    ),
    isProjectOwner: vi.fn(async (ownerId) => ownerId === userId),
    getConnection: vi.fn(async () => ({
      id: connectionId,
      project_id: projectId,
      target_site: targetSite,
      status: 'active' as const,
    })),
    consumeRateLimit: vi.fn(async () => true),
    ...overrides,
  };
}

describe('Supabase Edge Function authorization and validation', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('rejects unauthenticated credential operations before database access', async () => {
    const dependencies = await vaultDependencies();
    const response = await handleCredentialsVault(
      post({ action: 'connect', projectId, targetSite, username: 'agent', password: 'application-password' }, 'Bearer invalid'),
      dependencies
    );
    expect(response.status).toBe(401);
    expect(dependencies.isProjectOwner).not.toHaveBeenCalled();
  });

  it('denies cross-tenant credential writes', async () => {
    const dependencies = await vaultDependencies({
      authenticate: vi.fn(async () => ({ id: otherUserId })),
      isProjectOwner: vi.fn(async () => false),
    });
    const response = await handleCredentialsVault(
      post({ action: 'connect', projectId, targetSite, username: 'agent', password: 'application-password' }),
      dependencies
    );
    expect(response.status).toBe(404);
    expect(dependencies.createConnection).not.toHaveBeenCalled();
  });

  it('encrypts credentials at rest and never returns submitted secrets', async () => {
    const dependencies = await vaultDependencies();
    const response = await handleCredentialsVault(
      post({ action: 'connect', projectId, targetSite, username: 'agent-user', password: 'app-password-123456' }),
      dependencies
    );
    const responseText = await response.text();
    expect(response.status).toBe(201);
    expect(responseText).not.toContain('agent-user');
    expect(responseText).not.toContain('app-password-123456');
    expect(dependencies.createConnection).toHaveBeenCalledWith(expect.objectContaining({
      projectId,
      targetSite,
      encryptedCredentials: expect.objectContaining({
        algorithm: 'aes-256-gcm',
        version: 1,
      }),
    }));
  });

  it('rejects non-local WordPress targets and oversized requests', async () => {
    const dependencies = await vaultDependencies();
    const external = await handleCredentialsVault(
      post({ action: 'connect', projectId, targetSite: 'https://example.com', username: 'agent', password: 'application-password' }),
      dependencies
    );
    expect(external.status).toBe(400);
    expect(dependencies.createConnection).not.toHaveBeenCalled();

    const oversized = new Request('https://edge.example.test/function', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Length': '9000' },
      body: '{}',
    });
    const tooLarge = await handleCredentialsVault(oversized, dependencies);
    expect(tooLarge.status).toBe(413);
  });

  it('rejects unauthenticated agent access and cross-tenant projects', async () => {
    const dependencies = agentDependencies();
    const unauthenticated = await handleAgentProxy(
      post({ projectId, connectionId, prompt: 'Inspect site' }, ''),
      agentDependencies()
    );
    const crossTenant = await handleAgentProxy(
      post({ projectId, connectionId, prompt: 'Inspect site' }),
      agentDependencies({
        authenticate: vi.fn(async () => ({ id: otherUserId })),
        isProjectOwner: vi.fn(async () => false),
      })
    );
    expect(unauthenticated.status).toBe(401);
    expect(crossTenant.status).toBe(404);
    expect(dependencies.consumeRateLimit).not.toHaveBeenCalled();
  });

  it('derives the Edge Function identity from Supabase Auth, not caller-supplied fields', async () => {
    const verifiedId = userId;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer session-token');
      return new Response(JSON.stringify({ id: verifiedId, role: 'authenticated' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = await authenticateRequest(
      new Request('https://edge.example.test/function', {
        method: 'POST',
        headers: { Authorization: 'Bearer session-token' },
      }),
      { get: (name) => ({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'public-anon-placeholder',
      }[name]) }
    );
    expect(user).toEqual({ id: userId });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects service-role identities and rejects caller-supplied user IDs in agent requests', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: userId, role: 'service_role' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const serviceUser = await authenticateRequest(
      new Request('https://edge.example.test/function', {
        headers: { Authorization: 'Bearer privileged-token' },
      }),
      { get: (name) => ({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'public-anon-placeholder',
      }[name]) }
    );
    expect(serviceUser).toBeNull();

    const response = await handleAgentProxy(
      post({ projectId, connectionId, prompt: 'Inspect', userId }),
      agentDependencies()
    );
    expect(response.status).toBe(400);
  });

  it('rejects write-mode requests and enforces per-user rate limits', async () => {
    const writeRequest = await handleAgentProxy(
      post({ projectId, connectionId, prompt: 'Create a post', mode: 'controlled_write' }),
      agentDependencies()
    );
    expect(writeRequest.status).toBe(400);

    const limited = await handleAgentProxy(
      post({ projectId, connectionId, prompt: 'Inspect the site', mode: 'read_only' }),
      agentDependencies({ consumeRateLimit: vi.fn(async () => false) })
    );
    expect(limited.status).toBe(429);
  });

  it('checks active connection ownership and fails closed without a secure agent bridge', async () => {
    const dependencies = agentDependencies();
    const response = await handleAgentProxy(
      post({ projectId, connectionId, prompt: 'Inspect the site', mode: 'read_only' }),
      dependencies
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'AGENT_BRIDGE_NOT_CONFIGURED',
      mode: 'read_only',
    });
    expect(dependencies.consumeRateLimit).toHaveBeenCalledWith(userId);
  });
});

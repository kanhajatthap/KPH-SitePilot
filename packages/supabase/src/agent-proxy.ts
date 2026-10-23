import {
  AgentError,
  ErrorCode,
  AgentRequest,
  AgentRequestSchema,
} from '@wp-agent/contracts';

export interface AuthContext {
  userId: string;
  email: string;
  role: 'user' | 'admin';
}

export interface TenantVerificationService {
  verifyUserProjectAccess(userId: string, projectId: string): Promise<boolean>;
  getProjectConnection(projectId: string, connectionId: string): Promise<{
    id: string;
    projectId: string;
    targetSite: string;
    status: 'active' | 'revoked';
  } | null>;
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export class MemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(options: RateLimiterOptions = { windowMs: 60000, maxRequests: 60 }) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = (this.hits.get(key) || []).filter(
      (ts) => now - ts < this.windowMs
    );

    if (timestamps.length >= this.maxRequests) {
      return false;
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

export interface AgentProxyRequest {
  authHeader?: string;
  projectId: string;
  connectionId: string;
  agentPayload: unknown;
}

export interface AgentProxyResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

export interface TokenVerifier {
  verifyToken(token: string): Promise<AuthContext>;
}

/**
 * Handles agent proxy invocations with authorization, ownership checks, and rate limiting.
 */
export async function handleAgentProxyRequest(
  req: AgentProxyRequest,
  dependencies: {
    tokenVerifier: TokenVerifier;
    tenantService: TenantVerificationService;
    rateLimiter?: MemoryRateLimiter;
    forwardAgentCall: (validatedRequest: AgentRequest, targetSite: string) => Promise<unknown>;
  }
): Promise<AgentProxyResponse> {
  // 1. Auth Header validation
  if (!req.authHeader || !req.authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: {
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Missing or malformed Authorization header. Expected Bearer token.',
        },
      },
    };
  }

  const token = req.authHeader.slice(7).trim();
  let authContext: AuthContext;
  try {
    authContext = await dependencies.tokenVerifier.verifyToken(token);
  } catch (err) {
    return {
      statusCode: 401,
      body: {
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid or expired authentication token',
        },
      },
    };
  }

  // 2. Rate Limiting
  const rateLimiter = dependencies.rateLimiter;
  if (rateLimiter && !rateLimiter.isAllowed(authContext.userId)) {
    return {
      statusCode: 429,
      body: {
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'Rate limit exceeded. Too many requests. Please wait before retrying.',
        },
      },
    };
  }

  // 3. Tenant Project Access Verification
  const hasAccess = await dependencies.tenantService.verifyUserProjectAccess(
    authContext.userId,
    req.projectId
  );

  if (!hasAccess) {
    return {
      statusCode: 403,
      body: {
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'Access denied: user does not own or have permission for this project',
        },
      },
    };
  }

  // 4. Connection Access & Status Verification
  const connection = await dependencies.tenantService.getProjectConnection(
    req.projectId,
    req.connectionId
  );

  if (!connection) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: ErrorCode.TARGET_NOT_ALLOWED,
          message: 'WordPress connection not found in this project',
        },
      },
    };
  }

  if (connection.status === 'revoked') {
    return {
      statusCode: 403,
      body: {
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'WordPress connection is revoked and cannot be used',
        },
      },
    };
  }

  // 5. Validate Agent Request Payload
  const parsedAgentRequest = AgentRequestSchema.safeParse(req.agentPayload);
  if (!parsedAgentRequest.success) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid agent request payload',
          details: parsedAgentRequest.error.issues,
        },
      },
    };
  }

  // Target site must match connection site
  const normalizedConnectionSite = new URL(connection.targetSite).origin.toLowerCase();
  const normalizedTargetSite = new URL(parsedAgentRequest.data.targetSite).origin.toLowerCase();

  if (normalizedConnectionSite !== normalizedTargetSite) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: ErrorCode.TARGET_NOT_ALLOWED,
          message: `Target site in payload (${parsedAgentRequest.data.targetSite}) does not match authorized connection (${connection.targetSite})`,
        },
      },
    };
  }

  // 6. Forward to agent orchestration
  try {
    const result = await dependencies.forwardAgentCall(
      parsedAgentRequest.data,
      connection.targetSite
    );
    return {
      statusCode: 200,
      body: {
        data: result,
      },
    };
  } catch (error) {
    const err = error as AgentError;
    return {
      statusCode: 500,
      body: {
        error: {
          code: err.code || ErrorCode.MODEL_ERROR,
          message: err.message || 'Agent execution failed',
        },
      },
    };
  }
}

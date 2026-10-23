import { describe, it, expect, vi } from 'vitest';
import {
  AgentCore,
  createPostDraftTool,
  calculatePlanHash,
} from '../src/index.js';
import {
  ModelAdapter,
  ModelMessage,
  ModelResponse,
  ErrorCode,
  PermissionLevel,
  ChangePlan,
} from '@wp-agent/contracts';
import { WordPressClient } from '@wp-agent/wp-client';

class MockAuditLogger {
  public logs: unknown[] = [];
  log(entry: unknown) {
    this.logs.push(entry);
  }
}

describe('Phase 5: post.createDraft Tool & Controlled Writes Guard', () => {
  it('creates post.createDraft tool with SAFE_WRITE permission and isReadOnly: false', () => {
    const mockWpClient = {} as WordPressClient;
    const tool = createPostDraftTool(mockWpClient);

    expect(tool.name).toBe('post.createDraft');
    expect(tool.permissionLevel).toBe(PermissionLevel.SAFE_WRITE);
    expect(tool.isReadOnly).toBe(false);
  });

  it('strictly blocks post.createDraft when controlledWritesEnabled is false (Default Mode)', async () => {
    const mockWpClient = {
      inspectSite: vi.fn(),
      readPage: vi.fn(),
      createDraftPost: vi.fn(),
    } as unknown as WordPressClient;

    const mockAdapter: ModelAdapter = {
      providerId: 'mock-test',
      modelName: 'mock-model',
      generate: vi.fn().mockResolvedValue({
        content: 'I will create a post for you.',
        toolCalls: [
          {
            id: 'call_1',
            name: 'post.createDraft',
            arguments: {
              siteSlug: 'test',
              title: 'Draft Post Title',
              content: 'Draft post content',
            },
          },
        ],
      } as ModelResponse),
    };

    const auditLogger = new MockAuditLogger();
    const agent = new AgentCore({
      modelAdapter: mockAdapter,
      auditLogger: auditLogger as any,
      wpClient: mockWpClient,
      controlledWritesEnabled: false, // Default Mode
    });

    // In read-only mode, write tools are not passed to model adapter
    const tools = agent.getTools();
    const writeTool = tools.find((t) => t.name === 'post.createDraft');
    expect(writeTool).toBeDefined();

    // Directly testing executeToolCall protection
    const result = await agent.executeToolCall(
      {
        id: 'call_1',
        name: 'post.createDraft',
        arguments: {
          siteSlug: 'test',
          title: 'Draft Post Title',
          content: 'Draft content',
        },
      },
      { siteUrl: 'http://test.local', correlationId: 'corr-1' }
    );

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe(ErrorCode.WRITE_OPERATION_DENIED);
    expect(result.error?.message).toContain('All mutating operations are denied while in read-only mode');
    expect(mockWpClient.createDraftPost).not.toHaveBeenCalled();

    // Check security audit log
    const denialLog = auditLogger.logs.find(
      (l: any) => l.type === 'tool_denial' && l.action === 'post.createDraft'
    );
    expect(denialLog).toBeDefined();
  });

  it('allows tool execution when controlledWritesEnabled is true and returns draft post', async () => {
    const mockWpClient = {
      createDraftPost: vi.fn().mockResolvedValue({
        id: 55,
        slug: 'ai-website-builder',
        title: 'AI Website Builder',
        status: 'draft',
        editLink: 'http://test.local/wp-admin/post.php?post=55&action=edit',
        verified: true,
      }),
    } as unknown as WordPressClient;

    const mockAdapter: ModelAdapter = {
      providerId: 'mock-test',
      modelName: 'mock-model',
      generate: vi.fn(),
    };

    const auditLogger = new MockAuditLogger();
    const agent = new AgentCore({
      modelAdapter: mockAdapter,
      auditLogger: auditLogger as any,
      wpClient: mockWpClient,
      controlledWritesEnabled: true, // Controlled Writes Mode
    });

    const result = await agent.executeToolCall(
      {
        id: 'call_write_1',
        name: 'post.createDraft',
        arguments: {
          siteSlug: 'test.local',
          title: 'AI Website Builder',
          content: '# Simple Guide',
        },
      },
      { siteUrl: 'http://test.local', correlationId: 'corr-2' }
    );

    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({
      id: 55,
      status: 'draft',
      verified: true,
    });
    expect(mockWpClient.createDraftPost).toHaveBeenCalledWith('test.local', {
      title: 'AI Website Builder',
      content: '# Simple Guide',
      excerpt: undefined,
    });
  });

  it('tamper detection: plan hash changes if title or content is modified', () => {
    const originalPlan: ChangePlan = {
      id: 'plan-101',
      correlationId: 'corr-101',
      targetSite: 'http://test.local',
      author: 'user',
      summary: 'Draft post proposal',
      operations: [
        {
          operationId: 'op-1',
          type: 'create_post',
          targetResource: 'post:hello',
          summary: 'Create draft post',
          diff: {
            before: null,
            after: {
              title: 'Original Title',
              content: 'Original Content',
              status: 'draft',
            },
          },
          isDestructive: false,
        },
      ],
      status: 'proposed',
      preconditions: [],
      requiresHumanApproval: true,
      createdAt: '2026-10-22T10:00:00Z',
    };

    const originalHash = calculatePlanHash(originalPlan);
    expect(originalHash).toBeDefined();
    expect(originalHash.length).toBe(64); // SHA-256 hex length

    // Tampered title
    const tamperedPlan: ChangePlan = {
      ...originalPlan,
      operations: [
        {
          ...originalPlan.operations[0],
          diff: {
            before: null,
            after: {
              title: 'Hacked Title',
              content: 'Original Content',
              status: 'draft',
            },
          },
        },
      ],
    };

    const tamperedHash = calculatePlanHash(tamperedPlan);
    expect(tamperedHash).not.toBe(originalHash);
  });
});

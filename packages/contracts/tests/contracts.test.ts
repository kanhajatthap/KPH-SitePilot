import { describe, it, expect } from 'vitest';
import {
  SiteInspectInputSchema,
  PageReadInputSchema,
  AgentError,
  ErrorCode,
  AgentErrorSchema,
  ToolCallSchema,
  AgentExecutionTaskSchema,
  IntentDetectionResultSchema,
  MissingPrerequisiteSchema,
  TaskActivityEventSchema,
  VerifiedResourceSchema,
  PublishProposalResponseSchema,
  PublishApprovalRequestSchema,
  PageLifecycleProposalRequestSchema,
  PageDesignGenerationRequestSchema,
  PageDesignSchema,
  ChatHistorySchema,
  CreatePageSnapshotSchema,
  PAGE_SNAPSHOT_MAX_CONTENT_BYTES,
  PageSnapshotListResponseSchema,
  PageSnapshotSchema,
} from '../src/index.js';

describe('Contracts & Schemas', () => {
  describe('PageSnapshotSchema', () => {
    const snapshot = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      targetSite: 'http://plugin-test.local',
      pageId: 42,
      title: 'About',
      slug: 'about',
      status: 'publish',
      content: '<p>About us</p>',
      sourceOperation: 'page_update',
      capturedAt: '2026-10-26T12:00:00.000Z',
    } as const;

    it('validates full snapshots and derives a create payload without generated fields', () => {
      expect(PageSnapshotSchema.parse(snapshot)).toEqual(snapshot);
      expect(CreatePageSnapshotSchema.parse({
        targetSite: snapshot.targetSite,
        pageId: snapshot.pageId,
        title: snapshot.title,
        slug: snapshot.slug,
        status: snapshot.status,
        content: snapshot.content,
        sourceOperation: snapshot.sourceOperation,
      }).pageId).toBe(42);
    });

    it('rejects oversized content and list responses above the retention bound', () => {
      expect(() => PageSnapshotSchema.parse({
        ...snapshot,
        content: 'a'.repeat(PAGE_SNAPSHOT_MAX_CONTENT_BYTES + 1),
      })).toThrow();
      expect(() => PageSnapshotListResponseSchema.parse({
        snapshots: Array(21).fill({
          id: snapshot.id,
          targetSite: snapshot.targetSite,
          pageId: snapshot.pageId,
          title: snapshot.title,
          slug: snapshot.slug,
          status: snapshot.status,
          sourceOperation: snapshot.sourceOperation,
          capturedAt: snapshot.capturedAt,
        }),
      })).toThrow();
    });
  });

  describe('ChatHistorySchema', () => {
    it('accepts multiple conversations with an existing active conversation', () => {
      const conversation = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Build a landing page',
        createdAt: '2026-10-26T12:00:00.000Z',
        updatedAt: '2026-10-26T12:00:00.000Z',
        messages: [],
      };
      expect(ChatHistorySchema.parse({
        conversations: [conversation, { ...conversation, id: '550e8400-e29b-41d4-a716-446655440001' }],
        activeConversationId: conversation.id,
      }).conversations).toHaveLength(2);
    });

    it('rejects an active conversation ID that is not in the saved archive', () => {
      expect(() => ChatHistorySchema.parse({
        conversations: [],
        activeConversationId: '550e8400-e29b-41d4-a716-446655440000',
      })).toThrow();
    });
  });

  describe('SiteInspectInputSchema', () => {
    it('accepts valid site inspection parameters', () => {
      const valid = SiteInspectInputSchema.parse({
        siteSlug: 'plugin-test',
        includePlugins: true,
      });
      expect(valid.siteSlug).toBe('plugin-test');
      expect(valid.includePlugins).toBe(true);
    });

    it('defaults includePlugins to false', () => {
      const valid = SiteInspectInputSchema.parse({
        siteSlug: 'plugin-test',
      });
      expect(valid.includePlugins).toBe(false);
    });

    it('rejects invalid site slugs with illegal characters or traversal', () => {
      expect(() =>
        SiteInspectInputSchema.parse({ siteSlug: '../etc/passwd' })
      ).toThrow();
      expect(() =>
        SiteInspectInputSchema.parse({ siteSlug: 'site with spaces' })
      ).toThrow();
      expect(() => SiteInspectInputSchema.parse({ siteSlug: '' })).toThrow();
    });
  });

  describe('PageReadInputSchema', () => {
    it('accepts valid page read parameters', () => {
      const valid = PageReadInputSchema.parse({
        siteSlug: 'plugin-test',
        pageIdOrSlug: 'sample-page',
      });
      expect(valid.pageIdOrSlug).toBe('sample-page');
    });

    describe('PageLifecycleProposalRequestSchema', () => {
      it('accepts page updates and reversible Trash proposals', () => {
        expect(PageLifecycleProposalRequestSchema.parse({
          targetSite: 'http://test.local',
          action: 'update',
          pageId: 42,
          content: '<p>New page design</p>',
        }).action).toBe('update');

        expect(PageLifecycleProposalRequestSchema.parse({
          targetSite: 'http://test.local',
          action: 'trash',
          pageId: 42,
        }).action).toBe('trash');
      });

      it('requires update content and rejects content changes on Trash proposals', () => {
        expect(() => PageLifecycleProposalRequestSchema.parse({
          targetSite: 'http://test.local',
          action: 'update',
          pageId: 42,
        })).toThrow();

        expect(() => PageLifecycleProposalRequestSchema.parse({
          targetSite: 'http://test.local',
          action: 'trash',
          pageId: 42,
          content: '<p>Not allowed</p>',
        })).toThrow();
      });

      describe('Page design generation schemas', () => {
        const validDesign = {
          sections: [
            { type: 'hero', heading: 'Welcome', body: 'A useful introduction.' },
            { type: 'features', heading: 'What we offer', items: ['First', 'Second'] },
            { type: 'cta', heading: 'Get started', body: 'Contact our team.' },
          ],
        };

        it('accepts bounded design requests and valid structured sections', () => {
          expect(PageDesignGenerationRequestSchema.parse({
            targetSite: 'http://test.local',
            pageId: 42,
            instruction: 'Make the page clearer and more welcoming.',
          }).pageId).toBe(42);
          expect(PageDesignSchema.parse(validDesign).sections).toHaveLength(3);
        });

        it('rejects invalid section order, unsupported fields, and invalid feature lists', () => {
          expect(() => PageDesignSchema.parse({
            ...validDesign,
            sections: [
              { type: 'content', heading: 'Not a hero' },
              { type: 'cta', heading: 'Finish' },
            ],
          })).toThrow();
          expect(() => PageDesignSchema.parse({
            sections: [
              { type: 'hero', heading: 'Welcome', html: '<script>bad()</script>' },
              { type: 'cta', heading: 'Finish' },
            ],
          })).toThrow();
          expect(() => PageDesignSchema.parse({
            sections: [
              { type: 'hero', heading: 'Welcome' },
              { type: 'features', heading: 'Features', items: ['Only one'] },
              { type: 'cta', heading: 'Finish' },
            ],
          })).toThrow();
        });
      });
    });

    it('rejects empty pageIdOrSlug', () => {
      expect(() =>
        PageReadInputSchema.parse({ siteSlug: 'test', pageIdOrSlug: '' })
      ).toThrow();
    });
  });

  describe('AgentError', () => {
    it('serializes to structured error payload', () => {
      const error = new AgentError(
        ErrorCode.WRITE_OPERATION_DENIED,
        'Mutation denied by policy',
        { attemptedTool: 'page.create' }
      );
      const json = error.toJSON();
      expect(json.code).toBe(ErrorCode.WRITE_OPERATION_DENIED);
      expect(json.message).toBe('Mutation denied by policy');
      expect(json.details?.attemptedTool).toBe('page.create');

      const parsed = AgentErrorSchema.parse(json);
      expect(parsed.code).toBe(ErrorCode.WRITE_OPERATION_DENIED);
    });
  });

  describe('ToolCallSchema', () => {
    it('validates a normalized tool call structure', () => {
      const call = ToolCallSchema.parse({
        id: 'call_123',
        name: 'site.inspect',
        arguments: { siteSlug: 'plugin-test' },
      });
      expect(call.name).toBe('site.inspect');
    });
  });

  describe('Workspace Upgrade Contracts (Phase 9/Workspace)', () => {
    it('validates AgentExecutionTask and TaskStep schemas', () => {
      const task = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        correlationId: '123e4567-e89b-12d3-a456-426614174001',
        prompt: 'Create an About page for my digital agency',
        targetSite: 'http://test.local',
        mode: 'writes' as const,
        status: 'running' as const,
        steps: [
          {
            id: '123e4567-e89b-12d3-a456-426614174002',
            name: 'Inspect site capabilities',
            status: 'completed' as const,
            toolName: 'site.inspect',
          },
        ],
        currentStepIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const parsed = AgentExecutionTaskSchema.parse(task);
      expect(parsed.status).toBe('running');
      expect(parsed.steps).toHaveLength(1);
    });

    it('validates IntentDetectionResultSchema for mode recommendation', () => {
      const result = {
        category: 'content_mutation' as const,
        confidence: 0.95,
        recommendedMode: 'writes' as const,
        reason: 'User requested page creation which requires Controlled Writes mode.',
        requiresModeSwitch: true,
        suggestedActionPill: {
          label: 'Switch to Controlled Writes',
          targetMode: 'writes' as const,
          description: 'Enable controlled writes to stage a draft page.',
        },
      };

      const parsed = IntentDetectionResultSchema.parse(result);
      expect(parsed.category).toBe('content_mutation');
      expect(parsed.recommendedMode).toBe('writes');
      expect(parsed.requiresModeSwitch).toBe(true);
    });

    it('validates MissingPrerequisiteSchema', () => {
      const prerequisite = {
        type: 'wp_application_password' as const,
        targetSite: 'http://test.local',
        title: 'WordPress Application Password Missing',
        description: 'Controlled writes require an application password.',
        instructions: [
          'Go to WordPress Admin > Users > Profile',
          'Create an Application Password named KPH-SitePilot',
          'Set WP_APPLICATION_PASSWORD in .env.local on the server',
        ],
      };

      const parsed = MissingPrerequisiteSchema.parse(prerequisite);
      expect(parsed.type).toBe('wp_application_password');
      expect(parsed.instructions).toHaveLength(3);
    });

    it('validates TaskActivityEventSchema for real-time live activity', () => {
      const event = {
        id: 'evt_123',
        taskId: '123e4567-e89b-12d3-a456-426614174000',
        stepId: 'step_1',
        stepName: 'Inspecting target WordPress site',
        status: 'running' as const,
        message: 'Querying REST API at http://test.local',
        elapsedMs: 250,
        timestamp: new Date().toISOString(),
        toolName: 'site.inspect',
      };

      const parsed = TaskActivityEventSchema.parse(event);
      expect(parsed.stepName).toBe('Inspecting target WordPress site');
      expect(parsed.status).toBe('running');
      expect(parsed.elapsedMs).toBe(250);
    });

    it('validates VerifiedResourceSchema for side-by-side preview', () => {
      const resource = {
        id: 23,
        type: 'post' as const,
        slug: 'how-to-make-a-simple-website-using-ai',
        title: 'How to Make a Simple Website Using AI',
        status: 'draft' as const,
        content: '<p>AI WordPress guide content...</p>',
        excerpt: 'AI WordPress guide content...',
        editLink: 'http://test.local/wp-admin/post.php?post=23&action=edit',
        targetSite: 'http://test.local',
        lastVerifiedAt: new Date().toISOString(),
        isLivePublished: false,
      };

      const parsed = VerifiedResourceSchema.parse(resource);
      expect(parsed.id).toBe(23);
      expect(parsed.status).toBe('draft');
      expect(parsed.isLivePublished).toBe(false);
    });

    it('validates PublishProposalResponseSchema with optional pre-flight checklist', () => {
      const resp = {
        status: 'proposed' as const,
        planId: '123e4567-e89b-12d3-a456-426614174000',
        integrityHash: 'a1b2c3d4e5f6',
        targetSite: 'http://test.local',
        post: {
          id: 23,
          type: 'post' as const,
          slug: 'test-post',
          title: 'Test Post',
          status: 'draft' as const,
          content: '<p>Content</p>',
          editLink: 'http://test.local/wp-admin/post.php?post=23&action=edit',
          targetSite: 'http://test.local',
          lastVerifiedAt: new Date().toISOString(),
          isLivePublished: false,
        },
        intendedStatus: 'publish' as const,
        warning: 'Warning text',
        summary: 'Summary text',
        createdAt: new Date().toISOString(),
        checklist: {
          passed: true,
          hasBlockingFailures: false,
          warningCount: 1,
          items: [
            {
              id: 'target_environment',
              label: 'Authorized Target Environment',
              description: 'Must be local',
              severity: 'blocking' as const,
              passed: true,
            },
            {
              id: 'seo_excerpt',
              label: 'SEO Summary & Excerpt',
              description: 'Excerpt advisory',
              severity: 'warning' as const,
              passed: false,
              details: 'No excerpt provided',
            },
          ],
        },
      };

      const parsed = PublishProposalResponseSchema.parse(resp);
      expect(parsed.checklist?.passed).toBe(true);
      expect(parsed.checklist?.hasBlockingFailures).toBe(false);
      expect(parsed.checklist?.warningCount).toBe(1);
      expect(parsed.checklist?.items).toHaveLength(2);
    });

    it('validates PublishApprovalRequestSchema with cryptographic hash binding', () => {
      const req = {
        planId: '123e4567-e89b-12d3-a456-426614174000',
        integrityHash: 'a1b2c3d4e5f6',
        targetSite: 'http://test.local',
        postId: 23,
        intendedStatus: 'publish' as const,
        approvedBy: 'user',
      };

      const parsed = PublishApprovalRequestSchema.parse(req);
      expect(parsed.postId).toBe(23);
      expect(parsed.intendedStatus).toBe('publish');
    });
  });
});

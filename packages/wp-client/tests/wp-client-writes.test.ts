import { describe, it, expect } from 'vitest';
import { WordPressClient, HttpTransport } from '../src/index.js';
import { AgentError, ErrorCode } from '@wp-agent/contracts';

describe('Phase 5: WordPressClient Writes & Duplicate Checking', () => {
  describe('checkForDuplicatePost', () => {
    it('returns isDuplicate: false when no matching post exists', async () => {
      const mockTransport: HttpTransport = async (url) => {
        expect(url).toContain('/wp-json/wp/v2/posts?search=');
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = new WordPressClient({ transport: mockTransport });
      const result = await client.checkForDuplicatePost(
        'http://test.local',
        'How to Make a Simple Website Using AI'
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.warning).toBeUndefined();
    });

    it('returns isDuplicate: true and warning when an existing post with matching title is found', async () => {
      const mockTransport: HttpTransport = async (url) => {
        expect(url).toContain('/wp-json/wp/v2/posts?search=');
        return new Response(
          JSON.stringify([
            {
              id: 101,
              slug: 'how-to-make-a-simple-website-using-ai',
              title: { rendered: 'How to Make a Simple Website Using AI' },
              status: 'publish',
            },
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      };

      const client = new WordPressClient({ transport: mockTransport });
      const result = await client.checkForDuplicatePost(
        'http://test.local',
        'How to Make a Simple Website Using AI'
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.warning).toContain('Possible duplicate post detected');
      expect(result.warning).toContain('ID: 101');
    });
  });

  describe('createDraftPost', () => {
    it('successfully creates draft post and independently verifies it via read-only GET', async () => {
      let postPayload: Record<string, unknown> | null = null;
      let verificationCalled = false;

      const mockTransport: HttpTransport = async (url, init) => {
        // 1. Duplicate check GET
        if (url.includes('/wp-json/wp/v2/posts?search=')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // 2. Draft creation POST
        if (init?.method === 'POST') {
          expect(url).toBe('http://test.local/wp-json/wp/v2/posts');
          postPayload = JSON.parse(init.body as string);
          // Verify status is strictly draft
          expect(postPayload?.status).toBe('draft');

          return new Response(
            JSON.stringify({
              id: 202,
              slug: 'ai-website-guide',
              title: { rendered: 'AI Website Guide' },
              status: 'draft',
              content: { rendered: '<p>Guide content</p>' },
            }),
            {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        // 3. Independent read-only verification GET
        if (url.includes('/wp-json/wp/v2/posts/202')) {
          verificationCalled = true;
          return new Response(
            JSON.stringify({
              id: 202,
              slug: 'ai-website-guide',
              title: { rendered: 'AI Website Guide' },
              status: 'draft',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response('Not Found', { status: 404 });
      };

      const client = new WordPressClient({
        transport: mockTransport,
        username: 'admin',
        applicationPassword: 'mock-app-password',
      });

      const result = await client.createDraftPost('http://test.local', {
        title: 'AI Website Guide',
        content: '# Getting Started\nStep 1...',
        excerpt: 'Beginner guide...',
      });

      expect(result.id).toBe(202);
      expect(result.status).toBe('draft');
      expect(result.verified).toBe(true);
      expect(result.editLink).toBe('http://test.local/wp-admin/post.php?post=202&action=edit');
      expect(verificationCalled).toBe(true);
    });

    it('rejects external/production targets', async () => {
      const client = new WordPressClient({});
      await expect(
        client.createDraftPost('https://production-site.com', {
          title: 'Test',
          content: 'Test content',
        })
      ).rejects.toThrowError(AgentError);
    });

    it('maps HTTP 401 into UNAUTHORIZED AgentError', async () => {
      const mockTransport: HttpTransport = async () => {
        return new Response('Unauthorized Application Password', { status: 401 });
      };

      const client = new WordPressClient({ transport: mockTransport });
      await expect(
        client.createDraftPost('http://test.local', {
          title: 'Test',
          content: 'Test',
        })
      ).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      });
    });
  });

  describe('getPost', () => {
    it('retrieves post and returns sanitized VerifiedResource', async () => {
      const mockTransport: HttpTransport = async (url) => {
        expect(url).toContain('/wp-json/wp/v2/posts/23');
        return new Response(
          JSON.stringify({
            id: 23,
            slug: 'how-to-make-a-simple-website-using-ai',
            title: { rendered: 'How to Make a Simple Website Using AI' },
            status: 'draft',
            content: { rendered: '<p>Step 1: Choose a theme...</p>' },
            excerpt: { rendered: '<p>Step 1 excerpt</p>' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const client = new WordPressClient({ transport: mockTransport });
      const post = await client.getPost('http://test.local', 23);

      expect(post.id).toBe(23);
      expect(post.title).toBe('How to Make a Simple Website Using AI');
      expect(post.status).toBe('draft');
      expect(post.isLivePublished).toBe(false);
      expect(post.content).toContain('Step 1');
    });

    it('throws VALIDATION_FAILED when post does not exist (404)', async () => {
      const mockTransport: HttpTransport = async () => {
        return new Response('Not Found', { status: 404 });
      };

      const client = new WordPressClient({ transport: mockTransport });
      await expect(client.getPost('http://test.local', 9999)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
      });
    });
  });

  describe('publishPost', () => {
    it('successfully publishes a draft and independently verifies published status', async () => {
      let postBody: Record<string, unknown> | null = null;
      let getCallCount = 0;

      const mockTransport: HttpTransport = async (url, init) => {
        if (init?.method === 'POST') {
          postBody = JSON.parse(init.body as string);
          expect(postBody?.status).toBe('publish');
          return new Response(JSON.stringify({ id: 24, status: 'publish' }), { status: 200 });
        }

        // Independent GET verification
        getCallCount++;
        return new Response(
          JSON.stringify({
            id: 24,
            slug: 'published-test-post',
            title: { rendered: 'Published Test Post' },
            status: 'publish',
            content: { rendered: '<p>Published live</p>' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const client = new WordPressClient({
        transport: mockTransport,
        username: 'admin',
        applicationPassword: 'mock-password',
      });

      const published = await client.publishPost('http://test.local', 24);
      expect(published.id).toBe(24);
      expect(published.status).toBe('publish');
      expect(published.isLivePublished).toBe(true);
      expect(getCallCount).toBeGreaterThanOrEqual(1);
    });

    it('rejects publishing when credentials are not configured', async () => {
      const client = new WordPressClient({});
      await expect(client.publishPost('http://test.local', 24)).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      });
    });

    it('recovers and verifies status if network timeout occurs during publish', async () => {
      let postAttempted = false;

      const mockTransport: HttpTransport = async (url, init) => {
        if (init?.method === 'POST') {
          postAttempted = true;
          throw new Error('ETIMEDOUT');
        }

        // Recovery verification check
        return new Response(
          JSON.stringify({
            id: 25,
            slug: 'recovered-post',
            title: { rendered: 'Recovered Post' },
            status: 'publish',
          }),
          { status: 200 }
        );
      };

      const client = new WordPressClient({
        transport: mockTransport,
        username: 'admin',
        applicationPassword: 'mock-password',
      });

      const result = await client.publishPost('http://test.local', 25);
      expect(postAttempted).toBe(true);
      expect(result.status).toBe('publish');
    });
  });

  describe('updateDraftPost', () => {
    it('updates draft content and retains draft status', async () => {
      let postPayload: Record<string, unknown> | null = null;

      const mockTransport: HttpTransport = async (url, init) => {
        if (init?.method === 'POST') {
          postPayload = JSON.parse(init.body as string);
          expect(postPayload?.status).toBe('draft');
          return new Response(JSON.stringify({ id: 26, status: 'draft' }), { status: 200 });
        }

        return new Response(
          JSON.stringify({
            id: 26,
            slug: 'revised-draft',
            title: { rendered: 'Revised Title' },
            status: 'draft',
            content: { rendered: '<p>Revised Content</p>' },
          }),
          { status: 200 }
        );
      };

      const client = new WordPressClient({
        transport: mockTransport,
        username: 'admin',
        applicationPassword: 'mock-password',
      });

      const updated = await client.updateDraftPost('http://test.local', 26, {
        title: 'Revised Title',
        content: '<p>Revised Content</p>',
      });

      expect(updated.title).toBe('Revised Title');
      expect(updated.status).toBe('draft');
      expect(postPayload?.status).toBe('draft');
    });
  });
});

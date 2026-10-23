import { describe, it, expect } from 'vitest';
import {
  WordPressClient,
  validateWordPressTarget,
  HttpTransport,
} from '../src/index.js';
import { AgentError, ErrorCode } from '@wp-agent/contracts';

describe('WordPressClient & Target Validation', () => {
  describe('validateWordPressTarget', () => {
    it('permits valid LocalWP test sites (*.local)', () => {
      const url = validateWordPressTarget('http://plugin-test.local');
      expect(url.hostname).toBe('plugin-test.local');
    });

    it('permits localhost and 127.0.0.1 with custom ports', () => {
      const url = validateWordPressTarget('http://localhost:8888');
      expect(url.port).toBe('8888');
    });

    it('blocks arbitrary external and production domains', () => {
      expect(() =>
        validateWordPressTarget('https://production-store.com')
      ).toThrowError(AgentError);

      try {
        validateWordPressTarget('https://production-store.com');
      } catch (err) {
        expect((err as AgentError).code).toBe(ErrorCode.TARGET_NOT_ALLOWED);
      }
    });

    it('blocks dangerous cloud metadata IPs (SSRF mitigation)', () => {
      try {
        validateWordPressTarget('http://169.254.169.254/latest/meta-data/');
        expect.unreachable('Should have thrown SSRF_BLOCKED');
      } catch (err) {
        expect((err as AgentError).code).toBe(ErrorCode.SSRF_BLOCKED);
      }

      try {
        validateWordPressTarget('http://metadata.google.internal/computeMetadata/v1/');
        expect.unreachable('Should have thrown SSRF_BLOCKED');
      } catch (err) {
        expect((err as AgentError).code).toBe(ErrorCode.SSRF_BLOCKED);
      }

      try {
        validateWordPressTarget('http://169.254.169.253/dns');
        expect.unreachable('Should have thrown SSRF_BLOCKED');
      } catch (err) {
        expect((err as AgentError).code).toBe(ErrorCode.SSRF_BLOCKED);
      }
    });

    it('blocks non-HTTP protocols', () => {
      expect(() => validateWordPressTarget('file:///etc/passwd')).toThrowError(
        AgentError
      );
    });
  });

  describe('WordPressClient mocked requests', () => {
    it('executes read-only site inspection with injected mock transport', async () => {
      const mockTransport: HttpTransport = async (url) => {
        expect(url).toBe('http://plugin-test.local/wp-json/');
        return new Response(
          JSON.stringify({
            name: 'LocalWP Test Site',
            url: 'http://plugin-test.local',
            description: 'Local development environment',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const client = new WordPressClient({
        transport: mockTransport,
      });

      const result = await client.inspectSite('plugin-test');
      expect(result.siteName).toBe('LocalWP Test Site');
      expect(result.status).toBe('ok');
    });

    it('executes read-only page read with injected mock transport', async () => {
      const mockTransport: HttpTransport = async (url) => {
        expect(url).toContain('/wp-json/wp/v2/pages?slug=sample-page');
        return new Response(
          JSON.stringify([
            {
              id: 42,
              slug: 'sample-page',
              title: { rendered: 'Sample Page' },
              status: 'publish',
              excerpt: { rendered: '<p>Excerpt</p>' },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const client = new WordPressClient({ transport: mockTransport });
      const page = await client.readPage('plugin-test', 'sample-page');

      expect(page.id).toBe(42);
      expect(page.slug).toBe('sample-page');
      expect(page.title).toBe('Sample Page');
    });

    it('handles HTTP 401 unauthorized errors safely', async () => {
      const mockTransport: HttpTransport = async () => {
        return new Response('Unauthorized', { status: 401 });
      };

      const client = new WordPressClient({ transport: mockTransport });

      await expect(client.inspectSite('plugin-test')).rejects.toThrowError(
        AgentError
      );

      try {
        await client.inspectSite('plugin-test');
      } catch (err) {
        expect((err as AgentError).code).toBe(ErrorCode.UNAUTHORIZED);
      }
    });

    it('handles network failure safely', async () => {
      const mockTransport: HttpTransport = async () => {
        throw new Error('Connection refused (ECONNREFUSED)');
      };

      const client = new WordPressClient({ transport: mockTransport });

      try {
        await client.inspectSite('plugin-test');
      } catch (err) {
        expect((err as AgentError).code).toBe(ErrorCode.NETWORK_ERROR);
      }
    });
  });
});

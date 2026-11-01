import { describe, expect, it } from 'vitest';
import { isBlockedOrigin, isLocalOrigin, isTargetAllowed } from '../src/lib/target';

describe('target policy', () => {
  it('allows any https site in hosted mode (the product promise)', () => {
    for (const url of [
      'https://example.com',
      'https://shop.my-client.co.uk',
      'http://blog.example.org:8080',
      'https://staging.example.net',
    ]) {
      expect(isTargetAllowed(url, { saasMode: true })).toBe(true);
    }
  });

  it('still refuses cloud metadata endpoints in hosted mode', () => {
    for (const url of [
      'http://169.254.169.254',
      'http://metadata.google.internal',
      'http://[fd00:ec2::254]',
    ]) {
      expect(isBlockedOrigin(url)).toBe(true);
      expect(isTargetAllowed(url, { saasMode: true })).toBe(false);
    }
  });

  it('keeps the localhost-only restriction in local mode', () => {
    expect(isTargetAllowed('http://localhost:8888', { saasMode: false })).toBe(true);
    expect(isTargetAllowed('http://127.0.0.1:10004', { saasMode: false })).toBe(true);
    expect(isTargetAllowed('https://demo.local', { saasMode: false })).toBe(true);
    expect(isTargetAllowed('https://example.com', { saasMode: false })).toBe(false);
  });

  it('recognises local origins', () => {
    expect(isLocalOrigin('http://localhost:3000')).toBe(true);
    expect(isLocalOrigin('https://example.com')).toBe(false);
  });
});

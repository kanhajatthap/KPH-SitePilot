import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_HEADERS,
  CONNECTOR_MAX_BODY_BYTES,
  buildCanonicalString,
  buildSignedHeaders,
  generateNonce,
  sha256Hex,
  signRequest,
  verifySignedRequest,
} from '../src/index.js';

interface SignatureCase {
  name: string;
  secret: string;
  timestamp: string;
  nonce: string;
  body: string;
  expectedCanonical: string;
  expectedSignature: string;
}

interface SignatureFixtures {
  algorithm: string;
  canonicalFormat: string;
  cases: SignatureCase[];
}

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/signature-cases.json', import.meta.url), 'utf8')
) as SignatureFixtures;

const SITE_ID = '6f1d0b3c-1a2b-4c3d-8e9f-001122334455';

describe('connector protocol — signing', () => {
  it('uses the documented algorithm and canonical format', () => {
    expect(fixtures.algorithm).toBe('HMAC-SHA256');
    expect(fixtures.canonicalFormat).toBe('<timestamp>.<nonce>.<sha256hex(body)>');
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(4);
  });

  it.each(fixtures.cases.map((c) => [c.name, c] as const))(
    'matches the shared fixture for %s (TS ↔ PHP parity source)',
    (_name, testCase) => {
      const canonical = buildCanonicalString(testCase.timestamp, testCase.nonce, testCase.body);
      const signature = signRequest({
        secret: testCase.secret,
        timestamp: testCase.timestamp,
        nonce: testCase.nonce,
        body: testCase.body,
      });

      expect(canonical).toBe(testCase.expectedCanonical);
      expect(signature).toBe(testCase.expectedSignature);
    }
  );

  it('hashes unicode bodies as UTF-8 bytes', () => {
    const unicode = fixtures.cases.find((c) => c.name === 'unicode-body');
    expect(unicode).toBeDefined();
    expect(sha256Hex(unicode!.body)).toBe(unicode!.expectedCanonical.split('.')[2]);
  });

  it('rejects secrets shorter than 16 characters', () => {
    expect(() =>
      signRequest({ secret: 'short', timestamp: '1', nonce: generateNonce(), body: '{}' })
    ).toThrowError(TypeError);
  });
});

describe('connector protocol — verification', () => {
  const base = fixtures.cases[0];

  function headersFor(testCase: SignatureCase, signature?: string) {
    return {
      [CONNECTOR_HEADERS.site]: SITE_ID,
      [CONNECTOR_HEADERS.timestamp]: testCase.timestamp,
      [CONNECTOR_HEADERS.nonce]: testCase.nonce,
      [CONNECTOR_HEADERS.signature]: signature ?? testCase.expectedSignature,
    };
  }

  it('accepts a correctly signed request', () => {
    const result = verifySignedRequest({
      secret: base.secret,
      headers: headersFor(base),
      body: base.body,
      nowSeconds: Number(base.timestamp),
    });

    expect(result).toEqual({
      ok: true,
      siteId: SITE_ID,
      timestamp: Number(base.timestamp),
      nonce: base.nonce,
    });
  });

  it('accepts Headers objects and case-insensitive header names', () => {
    const signed = buildSignedHeaders({
      siteId: SITE_ID,
      secret: base.secret,
      body: base.body,
      nonce: base.nonce,
      nowSeconds: Number(base.timestamp),
    });

    const headers = new Headers();
    for (const [key, value] of Object.entries(signed)) headers.set(key, value);

    const result = verifySignedRequest({
      secret: base.secret,
      headers,
      body: base.body,
      nowSeconds: Number(base.timestamp),
    });
    expect(result.ok).toBe(true);

    const capitalised = Object.fromEntries(
      Object.entries(signed).map(([key, value]) => [key.toUpperCase(), value])
    );
    const second = verifySignedRequest({
      secret: base.secret,
      headers: capitalised,
      body: base.body,
      nowSeconds: Number(base.timestamp),
    });
    expect(second.ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const result = verifySignedRequest({
      secret: base.secret,
      headers: headersFor(base),
      body: `${base.body} `,
      nowSeconds: Number(base.timestamp),
    });

    expect(result).toMatchObject({ ok: false, code: 'invalid_signature' });
  });

  it('rejects the wrong secret', () => {
    const result = verifySignedRequest({
      secret: 'sitepilot-test-secret-wrong',
      headers: headersFor(base),
      body: base.body,
      nowSeconds: Number(base.timestamp),
    });

    expect(result).toMatchObject({ ok: false, code: 'invalid_signature' });
  });

  it('rejects missing headers', () => {
    const result = verifySignedRequest({
      secret: base.secret,
      headers: { [CONNECTOR_HEADERS.site]: SITE_ID },
      body: base.body,
      nowSeconds: Number(base.timestamp),
    });

    expect(result).toMatchObject({ ok: false, code: 'missing_header' });
  });

  it('rejects non-hex and uppercase nonces', () => {
    const result = verifySignedRequest({
      secret: base.secret,
      headers: { ...headersFor(base), [CONNECTOR_HEADERS.nonce]: base.nonce.toUpperCase() },
      body: base.body,
      nowSeconds: Number(base.timestamp),
    });

    expect(result).toMatchObject({ ok: false, code: 'invalid_nonce' });
  });

  it('enforces the timestamp window on both sides, inclusive at the boundary', () => {
    const atBoundary = verifySignedRequest({
      secret: base.secret,
      headers: headersFor(base),
      body: base.body,
      nowSeconds: Number(base.timestamp) + 300,
    });
    expect(atBoundary.ok).toBe(true);

    const tooLate = verifySignedRequest({
      secret: base.secret,
      headers: headersFor(base),
      body: base.body,
      nowSeconds: Number(base.timestamp) + 301,
    });
    expect(tooLate).toMatchObject({ ok: false, code: 'timestamp_out_of_window' });

    const tooEarly = verifySignedRequest({
      secret: base.secret,
      headers: headersFor(base),
      body: base.body,
      nowSeconds: Number(base.timestamp) - 301,
    });
    expect(tooEarly).toMatchObject({ ok: false, code: 'timestamp_out_of_window' });
  });

  it('rejects invalid timestamps', () => {
    const result = verifySignedRequest({
      secret: base.secret,
      headers: { ...headersFor(base), [CONNECTOR_HEADERS.timestamp]: '12.5' },
      body: base.body,
      nowSeconds: Number(base.timestamp),
    });

    expect(result).toMatchObject({ ok: false, code: 'invalid_timestamp' });
  });

  it('rejects bodies over the configured limit', () => {
    const result = verifySignedRequest({
      secret: base.secret,
      headers: headersFor(base),
      body: base.body,
      nowSeconds: Number(base.timestamp),
      maxBodyBytes: 4,
    });

    expect(result).toMatchObject({ ok: false, code: 'body_too_large' });
    expect(CONNECTOR_MAX_BODY_BYTES).toBe(262144);
  });

  it('generates 32-character lowercase hex nonces', () => {
    expect(generateNonce()).toMatch(/^[a-f0-9]{32}$/);
  });
});

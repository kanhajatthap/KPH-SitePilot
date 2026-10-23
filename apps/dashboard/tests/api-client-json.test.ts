import { describe, expect, it } from 'vitest';
import { readJsonResponse } from '../src/lib/api-client';

describe('readJsonResponse', () => {
  it('parses a normal JSON response', async () => {
    const response = new Response(JSON.stringify({ status: 'proposed', planId: 'abc' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(readJsonResponse(response)).resolves.toEqual({
      status: 'proposed',
      planId: 'abc',
    });
  });

  it('turns an HTML 404 into an actionable error instead of "Unexpected token <"', async () => {
    const response = new Response('<!DOCTYPE html><html><body>Not found</body></html>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    const error = await readJsonResponse(response).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Expected JSON/);
    expect((error as Error).message).toMatch(/text\/html/);
    expect((error as Error).message).toMatch(/HTTP 404/);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  buildConnectorDeps: vi.fn(), handleHeartbeat: vi.fn(), handleClaim: vi.fn(),
  handleJobResult: vi.fn(), handleUnpair: vi.fn(),
}));
vi.mock('../src/lib/connector/handlers', () => mocks);
vi.mock('../src/lib/connector/route-helpers', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/lib/connector/route-helpers')>(),
  buildConnectorDeps: mocks.buildConnectorDeps,
}));
import { POST as heartbeat } from '../src/app/api/connector/heartbeat/route';
import { POST as claim } from '../src/app/api/connector/jobs/claim/route';
import { POST as result } from '../src/app/api/connector/jobs/[id]/result/route';
import { POST as unpair } from '../src/app/api/connector/unpair/route';

const id = '11111111-2222-4333-8444-555555555555';
const routes = [
  { name: 'heartbeat', run: heartbeat, handler: mocks.handleHeartbeat },
  { name: 'claim', run: claim, handler: mocks.handleClaim },
  { name: 'result', run: (req: Request) => result(req, { params: Promise.resolve({ id }) }), handler: mocks.handleJobResult },
  { name: 'unpair', run: unpair, handler: mocks.handleUnpair },
];
const detail = 'PRIVATE_STORAGE_DETAIL /srv/internal/database.ts';
const deps = {};
const raw = '{ "hello": "raw bytes" }';
const request = () => new Request('https://app.example/api', { method: 'POST', body: raw });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.buildConnectorDeps.mockReturnValue({ ok: true, deps });
});

describe.each(routes)('signed $name error boundary', ({ name, run, handler }) => {
  it.each(['handler-error', 'handler-object', 'body-read', 'dependency-setup'])(
    'hides internal details for %s', async (stage) => {
      const req = request();
      if (stage === 'body-read') vi.spyOn(req, 'text').mockRejectedValue(new Error(detail));
      else if (stage === 'dependency-setup') mocks.buildConnectorDeps.mockImplementation(() => { throw new Error(detail); });
      else handler.mockRejectedValue(stage === 'handler-object' ? { message: detail } : new Error(detail));
      const response = await run(req);
      expect(response.status).toBe(500);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = await response.json();
      expect(body).toEqual({ error: 'INTERNAL_ERROR', message: 'Connector request could not be confirmed. Check site activity before trying again.' });
      expect(JSON.stringify(body)).not.toContain(detail);
      if (stage === 'body-read' || stage === 'dependency-setup') expect(handler).not.toHaveBeenCalled();
    }
  );

  it('preserves explicit configuration failures without calling the handler', async () => {
    const body = { error: 'CONFIG_MISSING', message: 'Connector configuration is missing.' };
    mocks.buildConnectorDeps.mockReturnValue({ ok: false, output: { status: 503, body } });
    const response = await run(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(body);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes exact raw bytes and headers to the authenticated handler', async () => {
    handler.mockResolvedValue({ status: 200, body: { status: 'accepted' } });
    const req = request();
    const response = await run(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted' });
    expect(handler).toHaveBeenCalledExactlyOnceWith(...(name === 'result'
      ? [id, req.headers, raw, deps] : [req.headers, raw, deps]));
  });
});

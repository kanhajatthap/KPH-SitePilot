import { describe, expect, it, vi } from 'vitest';
import { enforceQuota, type QuotaClient } from '../src/lib/quota';
import type { AuthContext } from '../src/lib/auth/api';

const USER_ID = '6a1c0f5e-1111-4a2b-9c3d-000000000001';
const NOW = new Date('2026-11-02T10:00:00.000Z');

const saasContext: AuthContext = { mode: 'saas', user: { id: USER_ID, email: 'user@example.test' } };

function fakeClient(options: {
  allowed?: boolean;
  consumeError?: { message: string } | null;
  windowStartedAt?: string;
  requestCount?: number;
  rowError?: { message: string } | null;
}) {
  const rpc = vi.fn().mockResolvedValue({
    data: options.allowed ?? true,
    error: options.consumeError ?? null,
  });
  const maybeSingle = vi.fn().mockResolvedValue({
    data:
      options.windowStartedAt === undefined
        ? null
        : { window_started_at: options.windowStartedAt, request_count: options.requestCount ?? 200 },
    error: options.rowError ?? null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { client: { rpc, from } as unknown as QuotaClient, rpc, from, select, eq, maybeSingle };
}

describe('quota enforcement', () => {
  it('does not count anything in local mode', async () => {
    const { client, rpc } = fakeClient({});

    const gate = await enforceQuota({ mode: 'local', user: null }, 'ai', { client, now: NOW });
    if (!gate.ok) throw new Error('expected the gate to allow');

    expect(gate.ok).toBe(true);
    expect(gate.headers['X-Quota']).toBe('skipped');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('consumes one unit with the configured window and limit', async () => {
    const { client, rpc } = fakeClient({ allowed: true });

    const gate = await enforceQuota(saasContext, 'ai', {
      client,
      now: NOW,
      env: { SITEPILOT_QUOTA_AI: '42' },
    });
    if (!gate.ok) throw new Error('expected the gate to allow');

    expect(gate.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('consume_agent_rate_limit', {
      p_user_id: USER_ID,
      p_max_requests: 42,
      p_window_seconds: 86_400,
    });
    expect(gate.headers['X-RateLimit-Limit']).toBe('42');
    // No invented remaining/reset on the allow path.
    expect(gate.headers['X-RateLimit-Remaining']).toBeUndefined();
  });

  it('denies with 429, the real reset time and a Retry-After', async () => {
    const { client } = fakeClient({
      allowed: false,
      windowStartedAt: '2026-11-02T09:30:00.000Z',
      requestCount: 200,
    });

    const gate = await enforceQuota(saasContext, 'ai', { client, now: NOW });

    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error('expected denial');

    const response = gate.response;
    expect(response.status).toBe(429);
    // 30 minutes into a 24-hour window: the wait is the rest of the day, not "24h".
    expect(response.headers.get('Retry-After')).toBe(String(23.5 * 3600));
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body).toMatchObject({ error: 'QUOTA_EXCEEDED', code: 'QUOTA_EXCEEDED', limit: 200 });
    expect(body.resetAt).toBe('2026-11-03T09:30:00.000Z');
    expect(body.message).toContain('AI messages per day');
  });

  it('falls back to the current time when the window row is unreadable', async () => {
    const { client } = fakeClient({ allowed: false, windowStartedAt: undefined });

    const gate = await enforceQuota(saasContext, 'job', { client, now: NOW });

    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error('expected denial');
    const body = await gate.response.json();
    expect(body.retryAfterSeconds).toBe(86_400);
    expect(body.kind).toBe('job');
  });

  it('fails open — but visibly — when the counter itself is broken', async () => {
    const { client } = fakeClient({ consumeError: { message: 'function does not exist' } });

    const gate = await enforceQuota(saasContext, 'ai', { client, now: NOW });
    if (!gate.ok) throw new Error('expected the gate to allow');

    expect(gate.ok).toBe(true);
    expect(gate.headers['X-Quota']).toBe('unavailable');
  });

  it('fails open when no service client exists at all', async () => {
    const gate = await enforceQuota(saasContext, 'ai', { client: null, now: NOW });
    if (!gate.ok) throw new Error('expected the gate to allow');

    expect(gate.ok).toBe(true);
    expect(gate.headers['X-Quota']).toBe('unavailable');
  });
});

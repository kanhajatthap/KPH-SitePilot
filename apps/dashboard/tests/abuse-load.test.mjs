import { describe, expect, it } from 'vitest';
import * as policy from '@wp-agent/api-core';
import { formatSimulation, runSimulation } from '../../../scripts/abuse-load.mjs';

describe('E11-02 executable abuse load simulation', () => {
  it('produces only graceful typed 429s under all three load shapes', async () => {
    const report = await runSimulation();
    expect(report.ok).toBe(true);
    expect(report.scenarios.map((item) => item.name)).toEqual([
      '10 sites x 60s polling (1 Hz)',
      '50 concurrent plan requests',
      '1,000 job-result events from one site',
    ]);
    expect(report.scenarios[0]).toMatchObject({ total: 600, allowed: 600, limited: 0 });
    expect(report.scenarios[1]).toMatchObject({ total: 50, allowed: 30, limited: 20 });
    expect(report.scenarios[2]).toMatchObject({ total: 1000, allowed: 240, limited: 760 });
    for (const item of report.scenarios) expect(item.allGraceful, item.name).toBe(true);
  });

  it('fails if the limiter allows every request (no denials is not success)', async () => {
    const report = await runSimulation({
      ...policy,
      enforceAbuse: (...args) => ({ ...policy.enforceAbuse(...args), allowed: true }),
    });
    expect(report.ok).toBe(false);
    expect(report.scenarios[1].countsMatch).toBe(false);
    expect(formatSimulation(report)).toContain('FAIL 50 concurrent plan requests');
  });

  it('fails if healthy traffic is incorrectly denied', async () => {
    const report = await runSimulation({
      ...policy,
      enforceAbuse: (...args) => ({ ...policy.enforceAbuse(...args), allowed: false }),
    });
    expect(report.ok).toBe(false);
    expect(report.scenarios[0].countsMatch).toBe(false);
  });

  it('fails if requests stay blocked at the reset boundary', async () => {
    const report = await runSimulation({
      ...policy,
      enforceAbuse: (...args) => {
        const decision = policy.enforceAbuse(...args);
        return args[2].now.getTime() === Date.parse('2026-11-03T11:01:00.000Z')
          ? { ...decision, allowed: false } : decision;
      },
    });
    expect(report.ok).toBe(false);
    expect(report.scenarios.every((item) => !item.recovered)).toBe(true);
  });

  it('fails on malformed retry metadata even when counts match', async () => {
    const report = await runSimulation({
      ...policy,
      abuseHeaders: () => ({ 'Retry-After': '0' }),
    });
    expect(report.ok).toBe(false);
    expect(report.scenarios[1]).toMatchObject({ countsMatch: true, allGraceful: false });
  });

  it('pins the default policy independently of deployment overrides', async () => {
    const report = await runSimulation({
      ...policy,
      enforceAbuse: (store, input, options) => {
        expect(options.limits).toBe(policy.DEFAULT_ABUSE_LIMITS);
        return policy.enforceAbuse(store, input, { ...options, env: { SITEPILOT_ABUSE_PLAN: '1' } });
      },
    });
    expect(report.ok).toBe(true);
    expect(report.scenarios.every((item) => item.recovered)).toBe(true);
  });

  it('prints a PASS report without leaking a subject id', () => {
    const text = formatSimulation({
      ok: true,
      scenarios: [{ name: 'demo', total: 2, allowed: 1, limited: 1, allGraceful: true, ok: true, countsMatch: true, recovered: true, limit: 1 }],
    });
    expect(text).toContain('PASS demo: 1 allowed / 1 graceful 429');
    expect(text).toContain('real Retry-After');
    expect(formatSimulation({ ok: false, scenarios: [] })).toContain('Simulation FAILED');
  });
});

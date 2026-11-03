import { describe, expect, it } from 'vitest';
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

  it('prints a PASS report without leaking a subject id', () => {
    const text = formatSimulation({
      ok: true,
      scenarios: [{ name: 'demo', total: 2, allowed: 1, limited: 1, allGraceful: true, limit: 1 }],
    });
    expect(text).toContain('PASS demo: 1 allowed / 1 graceful 429');
    expect(text).toContain('real Retry-After');
    expect(formatSimulation({ ok: false, scenarios: [] })).toContain('Simulation FAILED');
  });
});

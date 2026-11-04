#!/usr/bin/env node
/**
 * E11-02 — deterministic abuse load simulation.
 *
 * Runs the SAME pure sliding-window policy that the routes use, with a fixed
 * clock and no network. It proves that overload produces graceful, typed 429s
 * (with a real Retry-After) instead of untyped denials. It does not measure job delivery. This is an
 * in-process simulation, not a deployed load test — E11-04 still owes p95 and
 * job-loss measurements against a running deployment.
 *
 *   pnpm abuse:load          # human-readable report
 *   pnpm abuse:load --json   # machine-readable report
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = path.join(root, 'packages', 'api-core', 'dist', 'abuse.js');
const NOW = new Date('2026-11-03T11:00:00.000Z');

async function loadPolicy() {
  if (!existsSync(MODULE)) {
    throw new Error('packages/api-core/dist/abuse.js is missing — run `pnpm build` first.');
  }
  return import(pathToFileURL(MODULE).href);
}

/** Every scenario returns the same shape so the report is machine-checkable. */
export async function runSimulation(injectedPolicy) {
  const policy = injectedPolicy ?? await loadPolicy();
  const {
    createMemoryAbuseStore,
    enforceAbuse,
    abuseExceededBody,
    abuseHeaders,
    DEFAULT_ABUSE_LIMITS,
  } = policy;

  function scenario({ name, total, expectedAllowed, action, dimension, subject, at }) {
    const store = createMemoryAbuseStore({ now: () => NOW });
    let allowed = 0;
    const denials = [];
    for (let index = 0; index < total; index += 1) {
      const decision = enforceAbuse(
        store,
        { action, dimension, subjectId: subject(index) },
        { now: at(index), limits: DEFAULT_ABUSE_LIMITS }
      );
      if (decision.allowed) {
        allowed += 1;
      } else {
        const body = abuseExceededBody(decision);
        const headers = abuseHeaders(decision);
        const graceful =
          body.code === 'RATE_LIMIT_EXCEEDED' &&
          Number(headers['Retry-After']) >= 1 &&
          new Date(body.resetAt).getTime() > at(index).getTime() &&
          !JSON.stringify(body).includes(subject(index));
        denials.push(graceful);
      }
    }
    // Retry at the exact window boundary; denied attempts must not extend it.
    const recovery = enforceAbuse(
      store,
      { action, dimension, subjectId: subject(0) },
      { now: new Date(NOW.getTime() + DEFAULT_ABUSE_LIMITS[action].windowSeconds * 1000), limits: DEFAULT_ABUSE_LIMITS }
    );
    const countsMatch = allowed === expectedAllowed && denials.length === total - expectedAllowed;
    const recovered = recovery.allowed === true;
    return {
      name,
      ok: countsMatch && recovered && denials.every(Boolean),
      expectedAllowed,
      countsMatch,
      recovered,
      total,
      allowed,
      limited: denials.length,
      allGraceful: denials.every(Boolean),
      limit: DEFAULT_ABUSE_LIMITS[action].limit,
    };
  }

  const scenarios = [
    scenario({
      name: '10 sites x 60s polling (1 Hz)',
      total: 600,
      expectedAllowed: 600,
      action: 'connector',
      dimension: 'site',
      subject: (index) => `site-${Math.floor(index / 60)}`,
      at: (index) => new Date(NOW.getTime() + (index % 60) * 1_000),
    }),
    scenario({
      name: '50 concurrent plan requests',
      total: 50,
      expectedAllowed: 30,
      action: 'plan',
      dimension: 'user',
      subject: () => 'user-1',
      at: () => NOW,
    }),
    scenario({
      name: '1,000 job-result events from one site',
      total: 1_000,
      expectedAllowed: 240,
      action: 'connector',
      dimension: 'site',
      subject: () => 'site-hot',
      at: () => NOW,
    }),
  ];

  return {
    ok: scenarios.every((item) => item.ok),
    scenarios,
  };
}

export function formatSimulation(report) {
  const lines = ['E11-02 deterministic abuse load simulation (fixed clock, zero network):'];
  for (const item of report.scenarios) {
    lines.push(
      `  ${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.allowed} allowed / ${item.limited} graceful 429 (limit ${item.limit}/min; counts ${item.countsMatch ? 'ok' : 'FAIL'}; recovery ${item.recovered ? 'ok' : 'FAIL'})`
    );
  }
  lines.push(
    report.ok
      ? 'All denials typed RATE_LIMIT_EXCEEDED with a real Retry-After; no subject id leaked.'
      : 'Simulation FAILED: unexpected counts, failed recovery or a non-graceful denial.'
  );
  return lines.join('\n');
}

async function main() {
  let report;
  try {
    report = await runSimulation();
  } catch (error) {
    console.error(`Abuse load simulation could not run: ${String(error)}`);
    process.exit(1);
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(formatSimulation(report));
  if (!report.ok) process.exit(1);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();

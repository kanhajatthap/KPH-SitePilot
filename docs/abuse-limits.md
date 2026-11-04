# Abuse limits & burst protection (E11-02)

Short-window rate limits complement the [daily free-tier quotas](./release-checklist.md). Quotas are cost ceilings counted in Postgres; abuse limits stop loops, credential guessing and runaway connector polling **within a minute**.

## Limits

| Action | Dimension | Default | Window | Applied at |
|---|---|---|---|---|
| `pair` | `ip` | 10 | 60 s | `POST /api/connector/pair` |
| `connector` | `site` | 240 | 60 s | signed connector routes (`heartbeat`, `jobs/claim`, `jobs/{id}/result`) via `isRateLimited` |
| `plan` | `user` | 30 | 60 s | `POST /api/plan` (after the daily quota) |
| `chat` | `user` | 60 | 60 s | `POST /api/chat` (after the daily quota) |

A 1 Hz polling connector therefore has 4× headroom. Keys are scoped as `abuse:<action>:<dimension>:<subject>`, so the same string used as an IP and as a user id cannot share a budget.

### Overrides

Each action accepts a bounded override (1–100 000) and an optional window (1–86 400 s):

```
SITEPILOT_ABUSE_PAIR=25
SITEPILOT_ABUSE_PAIR_WINDOW=120
SITEPILOT_ABUSE_CONNECTOR=240
SITEPILOT_ABUSE_PLAN=30
SITEPILOT_ABUSE_CHAT=60
```

Malformed, zero, negative or out-of-range values fall back to the safe default — a typo in an env var must never take the product down.

## What a denial looks like

`429` with `Cache-Control: no-store`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Policy`, `X-Abuse-Action`, `X-Abuse-Dimension` and a **real** `Retry-After` derived from the oldest hit in the sliding window. The body is typed:

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests (10 pair requests per 60s). Retry in 42s; the limit resets at ...",
  "action": "pair",
  "dimension": "ip",
  "limit": 10,
  "windowSeconds": 60,
  "used": 10,
  "resetAt": "...",
  "retryAfterSeconds": 42
}
```

The subject id (IP, user id, site id) is **never** echoed in the body or headers. A blocked attempt is not recorded, so retrying cannot extend the penalty.

## Failure policy

The counter is an in-process sliding-window store (`createMemoryAbuseStore`) with a synchronous `consume()` — no `await` gap for two concurrent requests to both read "under the limit". If the counter throws, the request is **allowed** with `X-Abuse: unavailable`, matching `enforceQuota`: this is a cost guardrail, not an authorisation boundary. The raw error is never returned.

Multi-instance deployments get a per-instance budget, which is acceptable for a one-minute abuse window. `getSharedAbuseStore()` is the injectable port for a shared counter later.

## Load simulation

Run `pnpm abuse:load` (also gate #5 of `pnpm release:check`). It uses the same pure policy with a fixed clock and zero network:

```
PASS 10 sites x 60s polling (1 Hz): 600 allowed / 0 graceful 429 (limit 240/min)
PASS 50 concurrent plan requests:   30 allowed / 20 graceful 429 (limit 30/min)
PASS 1,000 job-result events:      240 allowed / 760 graceful 429 (limit 240/min)
```

The simulation pins the default limits (deployment overrides are intentionally ignored), asserts exact allow/deny counts and checks recovery at the window boundary. This prevents an always-allow limiter from falsely passing with zero denials. It does not exercise real concurrency or job persistence.

Every denial is `RATE_LIMIT_EXCEEDED` with a `Retry-After >= 1`, a future `resetAt` and no leaked subject id; the window rolls over cleanly afterwards.

## Honest scope

- This is a **deterministic in-process simulation**, not a deployed load test. E11-04 still owes p95 < 800 ms and a no-job-loss measurement against a running deployment.
- The signed connector routes keep their legacy `Retry-After: 30` in `connectorJson`; the typed 429 body above is served by the pair, chat and plan routes. Unifying the signed-route 429 headers is a follow-up.
- No secret, connection string or stack frame is returned by any denial.

## Signed connector authentication order

Per-site budget is consumed only after signature/site matching and successful
nonce recording. Invalid signatures, stale timestamps, replayed requests and
nonce-store failures do not spend that site's budget. A valid request denied
with 429 still consumes its nonce: wait, then sign a fresh request with a new
nonce/timestamp. Never replay the old signature as a retry. This guard does not
replace edge/IP protection for unauthenticated lookup or cryptographic load.

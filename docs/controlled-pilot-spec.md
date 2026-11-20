# Controlled pilot specification — NOT ACTIVATED

## Decision

**NO-GO** until all mandatory evidence is verified on the candidate commit and
intended disposable staging stack. Green unit tests or fixture HTML are insufficient.
A review receipt is metadata, not executable permission. This specification adds
no dispatcher, endpoint, remote flag or production capability.

## Mandatory gates and evidence

| Gate | Required evidence |
|---|---|
| Authentication/ownership | Actual Auth login and two-user RLS/source isolation; ownership transfer and revocation refusal |
| Signed single-use | Actual signed connector ingress plus transactional one-use receipt; wrong signatures and nonces refused |
| Freshness/integrity | Before/after/current hashes, exact path, <=60s evidence; expiry after DB lock waits refused |
| Replay/concurrency | Independent concurrent sessions: exactly one consume, no second dispatch |
| Independent recovery | Pre-edit encrypted private backup; preflight, dry-run, restore, original hash; no WordPress dependency |
| MySQL/FPM/HTTP | Real MySQL-backed frontend and appropriate admin checks, fixed fatal fixture, host restore |
| OPcache/workers | Demonstrate stale runtime despite restored bytes, independent worker restart and subsequent health |
| Real-auth browser | Owner/non-owner, expired/lost sessions, revocation, slow/lost responses, concurrent tabs and safe reconciliation |
| File allowlist | Exact opt-in paths, no symlinks/hardlinks/traversal/core/config/secrets; no broad path permission |
| Operator opt-in | Separate reviewed staging-only approval, verified root, backup provision and scope |
| Audit | Actor/site/proposal/path hashes, decision/time/recovery linkage, no source/credentials in logs |
| Disable switch | Default off; revoked scope/site stops future requests; documented handling of in-flight requests |
| Failure stops | Fail closed on uncertain outcome, changed bytes, stale evidence, missing key, unsafe path, lock or failed health |

`tools/pilot/readiness.mjs` checks an evidence manifest for completeness, 24-hour
freshness and exact commit binding. Each entry has `status`, `commit`, `verifiedAt`
and a non-secret `artifact` reference. It returns NO-GO for any missing, blocked,
failed or unrun gate. Even EVIDENCE-COMPLETE returns `activationAllowed:false`:
operators must review authenticity, environment and authorization separately.
It is not a security attestation or an automatic activation mechanism.

## Operating constraints

- One isolated staging site, one operator, one exact allowlisted file per action.
- Independent hosting backup, known private vault, original key and tested recovery.
- Pause editors/deployments/workers before file recovery; cooperative locks do not
  protect against hostile external writers. Never force an unknown hash.
- No chmod/chown repair, key regeneration for existing snapshots, or blind lock deletion.
- After ambiguous review/write response, reconcile authoritative state; never
  equate a timeout with failure or repeat a mutation blindly.
- After restore, verify original bytes AND fresh runtime/HTTP health. Failure to
  restart workers or verify health means STOP, not automatic retries.
- Source retention: encrypted evidence valid <=60s; existing cleanup cadence may
  retain ciphertext longer. Purge must be measured; expiration is not erasure.
- Existing review metadata does not yet provide a full executed-write audit trail.
  That trail and disable-switch in-flight semantics require acceptance before activation.

## Required operator handoff

1. Review local commit and migration diff; no remote application is authorized.
2. Run native DB/RLS and full disposable Supabase tests, then real-auth browser suite.
3. Run MySQL/FPM/HTTP harness on isolated Docker host; review/pin image digests.
4. Verify timed JWT refresh/expiry, TLS cookie behavior, slow backend and authenticated
   admin health not covered by the initial new runners.
5. Resolve correct Supabase project access and Vercel CPU block without substituting
   another project or changing billing/security automatically.
6. Obtain explicit separate authorization for any remote migration, push/deploy or
   staging pilot activation. Production execution remains outside this approval.

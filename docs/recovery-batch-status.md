# Recovery and review-validation batch — evidence and blockers

## Read-only deployment diagnosis

Vercel project `kph-sitepilot` was found in the connected account. Its team reports
`softBlock.reason = FAIR_USE_LIMITS_EXCEEDED` with overage type
`fluidCpuDuration`. This is an account usage restriction, not a failing source build.
Project metadata also reports Git deployment creation disabled. No plan, billing,
usage limit, deployment protection or project setting was changed and no manual
deployment was created. The owner needs to review usage/reset eligibility or contact
Vercel/support; this batch does not bypass that restriction.

The production target returned by Vercel still references commit `aaabe699` (PR42),
not the later merged review integrations. A successful Git merge is not evidence
that those integrations are deployed.

The configured public Supabase target is `zgkewnhrymswhucigtib`. Read-only migration
listing returned **403**. The connected Supabase account lists only
`tmgtqgjylmywrloulfpf`, a different project. No alternate project was queried as a
substitute, and no remote migration was applied. The owner must grant this connected
account access to the intended project's organisation (or connect the correct
account). Migration history and target schema remain **unverified**.

No secrets were decrypted, stored in repository files or requested from the owner.

## Changes

- Local Linux host-only encrypted recovery helper, independent of WordPress/PHP,
  with dry-run default, explicit apply, root/hash binding and no arbitrary execution.
- Recovery/failure fixture suite and native PHP fatal-fixture CI job.
- Chromium tests against the compiled review UI with mocked source/review APIs.
- Fixed a real integration omission: the exact signed ingestion endpoint now
  bypasses the browser-session middleware gate; it still verifies HMAC/nonces in
  its handler. Source fetch, receipt endpoint and page remain session-protected.
- Invalid expiry timestamps now disable confirmation rather than passing a NaN
  comparison. Read-only browser fixtures cover this regression.

## Evidence categories

Browser fixtures exercise the real rendered page in Chromium but do **not** prove
hosted sign-in, real Supabase session cookies, live cross-owner RLS or real connector
communication. API 401/404/409 responses are mocked; server unit/SQL tests are a
separate layer. No test.local request or real WordPress restore was performed.

Recovery tests exercise real local filesystem operations. The fixed fatal-PHP test
is skipped without PHP locally and required in native CI. This helper is not wired
to the experimental PHP engine or exposed through hosted tools. Execution stays off.

See [host operator runbook](./host-recovery-runbook.md). Real WordPress acceptance,
OPcache handling, full-site backup recovery and hosted auth E2E remain release gates.

## Local validation results

- Full release check: 8/8 gates passed, 1,056 Vitest tests across 106 files.
- Host recovery: 12 filesystem/failure tests passed; 1 native PHP fatal-fixture
  test explicitly skipped locally because PHP is unavailable. CI requires it.
- Chromium: 7 compiled-page fixture scenarios passed, including typed confirmation,
  safe source rendering, mocked signed-out/cross-owner denial, expiry (including
  malformed timestamp), conflict/replay response and timer disablement.
- Browser runtime was installed outside the repository from pinned npm packages
  (`playwright-core@1.65.1`, `@sparticuz/chromium@153.0.0`). No runtime dependency or
  browser binary was added to the application. CI repeats the isolated install.

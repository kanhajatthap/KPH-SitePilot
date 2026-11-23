# Native PostgreSQL acceptance without Docker

This runner creates a fresh PostgreSQL 18.7 cluster on loopback port 55439, with a
random password and temporary data directory. No external DB URL accepted. It
applies all repository migrations and removes only its generated cluster on exit.
If port 55439 is occupied, stop and resolve the conflict; never kill an unknown DB.

```sh
npm install --prefix /tmp/pilot-runtime --ignore-scripts --no-audit --no-fund embedded-postgres@18.7.0-beta.19 pg@8.16.3
node tests/database/native-review.mjs /tmp/pilot-runtime/node_modules
```

For the existing 55 pgTAP assertions as well:

```sh
git clone https://github.com/theory/pgtap.git /tmp/pilot-pgtap
git -C /tmp/pilot-pgtap checkout --detach 968eb53a33114e83042b3bdb0c664b5b80cf8bdf
PGTAP_SOURCE=/tmp/pilot-pgtap/sql/pgtap.sql.in node tests/database/native-review.mjs /tmp/pilot-runtime/node_modules
```

The runner verifies pgTAP source SHA-256
`383ecd73edfd1c7ed5f3b835134ee1fe74e201ee31599346c92ea029b65dcdce`,
uses upstream Makefile substitutions for modern PostgreSQL, executes repository
SQL unchanged, and asserts TAP plans/counts/failures. No assertion shims.

**Evidence boundary:** real PostgreSQL SQL, roles, privileges, RLS and concurrent
locks; minimal `auth.users` / `auth.uid()` shim for local identity. NOT Supabase
Auth, JWT validation, PostgREST, hosted session or full Supabase stack acceptance.
The existing Docker-based Supabase CI remains required independently.

The concurrency regression was observed failing before migration
20261104150000_review_lock_freshness.sql: evidence expired while waiting for the
receipt row, but the old function consumed it. The new function acquires receipt
and evidence locks before evaluating wall-clock freshness. Separate connections
also test evidence-row waiting and single-use competition. Execution stays off.

Additional disable ordering checks distinguish two cases: a consumer waiting behind
a revocation must refuse after that revocation commits; an already-consumed receipt
transaction can commit before a waiting revocation. Revocation then blocks later
requests, but does not undo the earlier receipt. This is metadata-only transactional
behavior, not cancellation of a filesystem write or executable job. Current custom
suite has 29 checks, or 33 aggregate checks including four pgTAP files (55 assertions).

# Disposable MySQL / FPM / HTTP acceptance

**Status: implementation syntax-checked only in the Arena sandbox. Docker and registry access unavailable; NOT runtime-certified.**

On an isolated Linux Docker host with access to Docker Hub and Debian build dependencies:

```sh
node tests/wordpress/fetch-sources.mjs > /tmp/sitepilot-wp-sources.json
WP_TEST_SOURCES=/tmp/sitepilot-wp-sources.json node tests/wordpress/http/run.mjs
```

Uses exact image version tags (not immutable digest pins yet): PHP 8.2.29, MySQL 8.4.5, nginx 1.28.0, Node 22.16.0. Before relying on acceptance, resolve/review image digests and record them with the result. Do not treat old fixed fixture versions as supported production recommendations.

Safety: generated project name, new temporary directory/database, random credentials in owner-only files, no published ports, internal network only, no Docker socket mount, repository mounted read-only, no user URL or DB URL accepted. No permission repair commands. WordPress HTTP/mail/cron disabled. Docker initialization uses stock image entrypoints; existing host data is never mounted. No global prune. The runner removes only its generated project and fixture tree. If Docker cleanup fails, preserve the directory and manually remove ONLY the printed/generated project found in Docker labels; never broadly delete volumes.

Phases:
1. Install WordPress via container CLI against disposable MySQL.
2. Check frontend database-backed response, login page and unauthenticated admin redirect.
3. Change/restore fixed CSS and JS and compare original SHA-256 and served bytes.
4. Prime FPM OPcache, change PHP with timestamp validation disabled, prove stale healthy response.
5. Restart fixture FPM; prove changed response. Host-only restore bytes; prove cached changed response remains.
6. Restart; prove healthy. Write fixed fatal fixture; restart; prove HTTP failure.
7. Restore without invoking WordPress; restart; prove database-backed HTTP health.

No authenticated WordPress admin or dashboard authentication claim is made. No pilot activation. Failure to start containers is an environment blocker, not a passing result. The native SQLite harness remains an independent test.

## Hardened execution and evidence

The runner now refuses DOCKER_HOST / DOCKER_CONTEXT overrides, inspects the selected
context and accepts only a Unix socket endpoint, then pins that context for every
Docker command. A locally forwarded socket still requires operator trust; never
point it at shared/remote infrastructure. Inherited Compose and credential environment
variables are stripped and an explicit empty interpolation file is used.

FPM and nginx no longer mount the complete fixture. They cannot access the host-only
vault/key or root DB password. FPM receives only site, app DB credential, installer
and runtime marker directory. The runner alone receives the independent vault.

`evidence.json` records phase results, byte hashes, HTTP status/response hashes and
image IDs/available repository digests. `checks.jsonl` records completed assertions
incrementally. Image IDs for locally built PHP are not registry manifest digests.
No real digest inventory exists until the containers have actually run; do not
substitute tag strings for immutable digest evidence.

The fatal phase requires HTTP 500 AND a fixed fatal shutdown marker AND an otherwise
healthy direct FPM probe. A generic nginx 502/503 is not PHP fatal acceptance.
The baseline verifies FPM SAPI and actual enabled OPcache with timestamp checks off.

On failure, scoped containers are stopped but the generated site/vault/key and
private diagnostics remain under the generated owner-only directory. Treat that
directory as sensitive: never commit, upload or paste its contents. The printed
path is for trusted local operator investigation. On success, generated site and
secret files are removed, but redacted evidence is retained. Cleanup failure is
FAIL, never PASS. Preserve failure backups until operator investigation is complete.
This supersedes the earlier unconditional generated-tree cleanup description.

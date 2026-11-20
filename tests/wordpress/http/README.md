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

# Browser fixtures without publicly exposed test services

Requires Linux network namespaces, `ip`, permission to create a temporary namespace,
and an existing unprivileged account (`user` in Arena). Do not run Chromium as root.
Install browser dependencies and build the dashboard before network isolation.

```sh
npm install --prefix /tmp/fourday-runtime --ignore-scripts --no-audit --no-fund playwright-core@1.65.1 @sparticuz/chromium@153.0.0
pnpm build
host_netns=$(readlink /proc/self/ns/net)
sudo -n unshare --net sh -c 'ip link set lo up; exec sudo -u user env HOST_NETNS="$1" /usr/local/bin/node tests/browser/isolated-review.mjs /tmp/fourday-runtime/node_modules' sh "$host_netns"
```

Only loopback is enabled in the fresh namespace. Runner verifies namespace identity
and interface list before starting Next. The server binds 0.0.0.0 INSIDE that isolated
namespace, never the host. It and the browser are stopped after the finite test.
No forwarding, veth, published port or host routing is configured. If namespace
creation is denied, mark BLOCKED; do not fall back to a publicly reachable server.
The script refuses dotenv credential files and strips Supabase/SitePilot/demo env.

This executes the compiled page with API fixtures, not real Auth/PostgREST. Successful
execution provides no JWT/session/provider or live ownership verification.

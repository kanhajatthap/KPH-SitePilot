=== KPH SitePilot Connector ===
Contributors: kphsitepilot
Tags: ai, agent, connector, sitepilot, automation
Requires at least: 6.4
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connects this WordPress site to KPH SitePilot so an administrator can manage it from prompts — with plans, approval, snapshots and undo.

== Description ==

KPH SitePilot Connector links a WordPress site to the SitePilot workspace. Once paired, the
site polls the platform for approved jobs, executes them through allowlisted WordPress APIs,
takes a before-snapshot, and reports the result for verification.

Connecting as an administrator enables full access by default, including files and code
scopes. A scope only makes a capability available: every write still requires a plan, a human
approval, a snapshot and a read-back verification.

**This build (0.1.0) is the connector foundation.** It installs the settings model, access
scopes, HMAC signing primitives and the admin screen. The pairing endpoint and job runner ship
in milestone M2; until then the admin screen clearly reports “Not connected” and does not
contact any external service.

== Installation ==

1. Upload the `kph-sitepilot-connector` folder to `/wp-content/plugins/` (or upload the ZIP).
2. Activate the plugin through the **Plugins** screen.
3. Open **SitePilot** in the admin menu, review the access scopes and save.
4. When the hosted platform is live, paste the pairing code shown in SitePilot and connect.

== Frequently Asked Questions ==

= Does this plugin execute arbitrary PHP or SQL? =
No. Jobs are dispatched to an allowlist of tool handlers that use WordPress APIs. There is no
`eval`, no shell execution and no user-supplied SQL.

= What happens if a job fails halfway? =
The platform records the failure, keeps the before-snapshot and offers undo. The plugin pauses
job processing after repeated failures and reports the state to the platform.

= Is my site data sent anywhere before I connect? =
No. Until pairing completes, the plugin makes no outbound request at all.

= Can I revoke access? =
Yes. Disconnecting revokes the site token on the platform, and deleting the plugin removes the
stored settings.

== Changelog ==

= 0.2.0 =
* Pairing is live: the admin screen accepts a one-time code, exchanges it for site
  credentials through the platform, and offers a local disconnect action.
* New REST routes: `POST /wp-json/kph-sitepilot/v1/pair`, `POST …/unpair`, `GET …/status`
  (administrator-only, REST-nonce protected, no credentials in any response).
* Configurable SitePilot platform URL, saved from the connection card.
* Admin JavaScript sends the REST nonce and never handles the site token or secret.

= 0.1.0 =
* Connector foundation: settings, access scopes (including files and code), HMAC-SHA256 signing,
  admin status screen, uninstall cleanup, PHP/TS shared protocol fixtures.

=== WP Agent Bridge ===
Contributors: kphsitepilot, wpagent
Tags: ai, agent, bridge, localwp, inspection
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A secure, read-only companion bridge plugin for the KPH SitePilot / wp-agent system.

== Description ==

WP Agent Bridge provides safe, read-only REST API inspection endpoints for the KPH SitePilot AI agent system.

Key Principles:
* Read-only inspection endpoints only.
* All endpoints require manage_options capability.
* No write, mutation, or execution endpoints.
* Zero external script or telemetry calls.

== Installation ==

1. Upload the `wp-agent-bridge` folder to the `/wp-content/plugins/` directory of your LocalWP test site.
2. Activate the plugin through the 'Plugins' menu in WordPress.
3. Access read-only endpoints via `/wp-json/wp-agent-bridge/v1/status`.

== Frequently Asked Questions ==

= Does this plugin modify any WordPress database tables? =
No. WP Agent Bridge is strictly read-only and never writes to or modifies any WordPress database tables or options.

= Can AI models execute arbitrary code through this bridge? =
No. The bridge does not expose any code execution, file writing, or dynamic evaluation endpoints.

== Changelog ==

= 0.1.0 =
* Initial Phase 1 release with read-only `/status` and `/inspect` REST routes.

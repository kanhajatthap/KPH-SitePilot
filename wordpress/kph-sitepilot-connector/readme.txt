=== KPH SitePilot Connector ===
Contributors: kphsitepilot
Tags: ai, agent, connector, sitepilot, automation
Requires at least: 6.4
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
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

**This build (0.7.0) adds block-level editing and publishing on top of verified writes with undo.** Pairing exchanges a one-time code for site
credentials, the connector then signs every request, uploads a capability manifest, claims one
job per minute and reports the result. The shipped tools are read-only (`site.info`,
`site.health`, `content.list`, `content.get`); write tools land with the platform's
plan/approval/snapshot engine.

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

= 1.0.0 =
* `site.logs` (scope `site_ops`): bounded, path- and email-redacted tail of `wp-content/debug.log` (`1–80` lines, max 64 KB read).
* `site.health` (`E4-03`): enriched with memory limit, max upload bytes, debug/cron flags, HTTPS state, and uploads free disk bytes.
* `content.create` (`E5-02`): optional `excerpt`, `featuredMediaId`, and `preventDuplicateSlug` guard.
* `seo.meta.get` (scope `read`), `seo.meta.update` & `seo.meta.restore` (scope `content`): Yoast SEO, Rank Math, SEOPress, and universal `_sitepilot_seo_*` fallback with allowlisted meta keys, before-snapshot (`seo:<postId>`), read-back verification, and one-click undo (`E7-01`, `E7-02`).
* `media.update` & `media.restore` (scope `media`), plus `media.set_featured` & `media.restore_featured` (scope `content`): image alt text, title, caption, description, and post featured image updates with snapshots (`media:<id>`, `featured:<postId>`) and one-click undo (`E5-10`).
* `menus.save` & `menus.restore` (scope `content`): create or update navigation menus and theme locations with before-snapshot (`menu:<menuId>`), read-back verification, and one-click undo (`E5-13`).

= 0.9.0 =
* `site.search` (scope `read`): bounded keyword search across public posts, pages, and media attachments (`1–25` items).
* `terms.create`, `terms.assign`, `terms.restore` (scope `content`): create categories/tags in public taxonomies and assign/restore post terms with before-snapshot (`terms:<postId>:<taxonomy>`), read-back verification, and one-click undo.

= 0.8.0 =
* `settings.update` & `settings.restore` (scope `site_ops`): allowlisted option writes (`blogname`, `blogdescription`, `timezone_string`, `date_format`, `time_format`, `posts_per_page`, `default_comment_status`, `default_ping_status`) with before-snapshot, read-back verification, automatic rollback on mismatch, and one-click undo. `siteurl` and `home` remain strictly non-writable.
* Admin screen (`E2-14`): recent activity table (last 20 executed jobs, redacted), shareable diagnostic bundle (zero secrets/tokens/emails), and an admin-only form to apply rotated credentials issued by SitePilot.

= 0.7.0 =
* `blocks.parse`: the block tree of one post as a bounded list (index, name, attributes, HTML) — nested blocks flattened in document order.
* `blocks.replace`: replaces exactly one block. The whole document is re-serialised, then re-parsed to prove the block count and the replaced block survived — otherwise the change fails with `kph_sp_verification_failed` and the before-snapshot is returned.
* `content.publish` / `content.unpublish`: status changes through the same snapshot → write → read-back → verify path, so publishing is undoable like any other write.

= 0.6.0 =
* `settings.get`: reads 14 harmless options (site title, tagline, URLs, permalinks, timezone, date/time formats, front page, comment defaults). Any other key is refused with `kph_sp_option_not_allowed`; salts and database credentials are never referenced.

= 0.5.1 =
* `menus.list`: navigation menus with assigned locations and items (≤20 menus, ≤100 links), URLs passed through `esc_url_raw`.

= 0.5.0 =
* Inventory reads: `plugins.list` (slug, name, version, active — no file paths), `theme.info` (block-theme detection, parent theme, menu support), `users.list` (roles only — never an email or a password hash), `media.list` (paged, MIME-filtered, alt text) and `terms.list` (public taxonomies only).
* Read tools never carry the `content` scope: media reads need `media`, plugin and user reads need `site_ops`.

= 0.4.0 =
* Write tools: `content.update`, `content.create`, `content.restore`, all scoped to `content`.
* Every write snapshots the post first, reads it back, and verifies the result; mismatches return `kph_sp_verification_failed` with the expected and actual values.
* Snapshots travel back with the job result so the platform can offer one-click undo (`content.restore`).
* Writes are sanitised with `wp_kses_post`, statuses are allowlisted, and create defaults to draft.
* Live polling: five seconds after any job, one minute while idle, five minutes after an hour without work.
* Fatal-error capture: if a tool dies mid-run, the failure is still reported (paths redacted) so the platform stops retrying blindly.
* Disconnect now revokes the connection on the platform as well as locally; a revocation made in SitePilot clears the local credentials automatically.

= 0.3.0 =
* Job runner: signed claim → execute → signed result, one job per poll, transient lock against
  overlapping runs, retryable failures classified explicitly.
* Heartbeat every five minutes (and immediately after pairing) carrying versions and a bounded
  capability manifest: theme type, plugins, post types, taxonomies, builders, environment.
* Read-only tool registry, deny by default: `site.info`, `site.health`, `content.list`,
  `content.get` — every tool checks its scope first.
* WP-Cron `kph_sp_minute` schedule on activation; disconnect clears the schedule and transients.
* Admin screen reports last contact and the last job error instead of a silent queue.

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

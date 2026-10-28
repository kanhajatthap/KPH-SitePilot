# KPH SitePilot — Lovable-Parity Blueprint

> Refined master prompt and execution plan for turning the dashboard into a Lovable-class
> AI workspace, without losing the existing security model or WordPress agent capabilities.

## 1. Master prompt (use this to brief the agent)

```text
You are SitePilot, a senior product engineer and WordPress architect with 25 years of
web experience and 3 years of applied AI experience. Build and evolve KPH SitePilot into
a Lovable-class AI workspace for WordPress.

Non-negotiables:
- Security first. Never print, log, commit or request secrets. Never target production.
  All writes stay deny-by-default and require explicit human approval.
- Never fake capability. No mock logins, hardcoded users, simulated success, or dead
  buttons. If something is not wired, it must say so.
- Preserve every existing agent capability while improving the experience.
- Keep the free-tier footprint: no paid services and no unnecessary dependencies.

Product experience:
- A warm, calm, premium workspace: off-white paper, fine borders, soft shadows,
  coral-to-violet brand gradient, generous spacing, crisp iconography (no emoji chrome).
- A conversational agent that behaves like a senior builder: it restates the goal,
  shows a short plan, streams thinking steps, calls tools visibly, asks before writing,
  previews changes, and explains what changed and how to undo it.
- Three surfaces, one mental model: Chat (intent), Canvas (result), Code (truth).
  Desktop is a two-pane workspace; tablet/mobile collapse the canvas into a switchable tab.
- The composer is the hero: large rounded input, mode selector (Agent / Writes / Chat),
  site selector, keyboard shortcut, suggested prompts, and a clear send action.
- Every assistant turn renders: reasoning timeline, tool activity, proposal cards with
  Approve / Reject, and a verified completion card with next actions.
- Empty states teach the product in one sentence plus three concrete example prompts.

Engineering rules:
- TypeScript strict, React 19 / Next 15 App Router, Tailwind, no new runtime dependencies.
- Keep API contracts and server-side authorization untouched unless a change is required.
- Every UI change must typecheck, pass the existing test suites, build, and be verified
  in a real browser at http://localhost:3002.
- Prefer small, reviewable increments. Never commit or push without explicit instruction.
```

## 2. What "same as Lovable" means here

| Dimension | Target behaviour |
| --- | --- |
| Prompting | One obvious composer; suggestions; follow-ups keep context; mode is explicit. |
| Answers | Short, confident, structured: what I did, what changed, what is next. |
| Thinking | Visible plan + live step timeline + tool calls, not a spinner alone. |
| Capability | Inspect → plan → stage → preview → approve → verify → publish, all in-product. |
| Look | Warm neutral canvas, one brand gradient, 12–16 px radii, 1 px borders, restrained type. |
| Feel | Fast, quiet motion; clear focus states; nothing jumps or shouts. |

## 3. Phased delivery

### Phase 1 — Design foundation and shell (current)
- Design tokens, typography, motion, scrollbars, focus rings.
- Rebuilt header: brand, project switcher, connection state, surface tabs, publish, account.
- Rebuilt chat: empty state, message rhythm, thinking timeline, tool cards, proposal cards,
  hero composer, publish/revision modals.
- Rebuilt canvas: device toolbar, URL pill, staged banners, clean empty state, code view.
- Auth screens aligned to the same system.

### Phase 2 — Workspace memory
- [x] Persist and resume the current conversation across page reloads (browser storage locally, session-authenticated RLS-scoped Supabase storage in SaaS mode).
- [x] Recent-conversation archive so starting a new task/chat does not discard the previous thread; latest 50 retained, with individual delete and confirmed clear-all.
- [x] Resume a selected conversation with its full message history.
- Per-project site binding and last-known capability snapshot.

### Phase 3 — Agent quality
- System prompt parity: clarify → plan → act → verify → summarise.
- Stream reasoning tokens and tool calls into the timeline.
- Structured "what changed" summaries with diffs and undo hints.
- Follow-up awareness: edits apply to the last staged artifact unless re-scoped.
- [x] Pass recent user/assistant messages into Chat and Agent requests (maximum 12 messages, 2,000 characters each); client-supplied system messages are rejected and old assistant claims are not treated as verified site state.
- [x] Wire authenticated dashboard plugin list/propose/apply routes; plugin uninstall requires explicit approval and verifies the plugin is absent afterward.
- [x] Stage existing-page redesigns and reversible Trash operations from chat; approval checks the page has not changed, protects the active homepage, and verifies the resulting state. Redesigns use schema-validated model section plans rendered to Gutenberg blocks without accepting model-supplied markup.
- [x] Persist and resume the current conversation across page reloads; SaaS history is session-authenticated and row-level-security scoped, while local mode uses browser storage. History is bounded and reloaded messages do not restore actionable approval cards.
- [x] Retain completed conversations when starting a new task/chat, with archive/list, safe resume flow, individual delete, and confirmed clear-all; user confirmed behavior in the local browser.

### Phase 2 acceptance notes
- Supabase chat-history migration applied successfully on an ephemeral GitHub Actions local stack.
- Database/RLS suite passed all 14 pgTAP assertions in workflow run [40459112930](https://github.com/kanhajatthap/KPH-SitePilot/actions/runs/40459112930).
- The conversation archive migration and updated RLS suite passed in local-only workflow run [40465140394](https://github.com/kanhajatthap/KPH-SitePilot/actions/runs/40465140394).
- User verified local browser persistence after reload, New chat archiving, resume, individual deletion (including after reload), and Clear all confirmation with Cancel leaving the seeded conversation intact; temporary test chat was then deleted.
- Dashboard local-mode override is set in `apps/dashboard/.env.local`; the user reports dashboard is running locally with no `/api/chat/history` request during the test.
- Session-authenticated SaaS browser sync has not been tested; do not point this local-only test workflow at hosted Supabase.
- The developer PC does not need Docker for this validation path; the workflow uses only the isolated local Supabase stack and never a hosted project.

### Phase 4 — Build surface
- [x] File/route tree for generated pages and sections: read-only navigation tree showing connected local site pages and identified block sections. Reuses existing page inventory and section contracts; supports expand/collapse, loading/empty/error states with retry, and safe preview navigation without triggering mutations or bypassing approval gates.
- [x] Local page version history: capture before approved updates, section edits, Trash, and restores; chat can list/compare snapshots and stage an explicit restore approval. Restore checks for stale page changes, creates a backup, and verifies exact read-back. Retention is 20 versions per page and content is limited to 2 MiB. Automated tests pass; live LocalWP restore testing remains.
- [x] Inline section editing and visual selection: interactive visual section selector bar and canvas region indicators in the build preview surface with hover/selected ring states, bidirectional sync with RouteTree, keyboard navigation (`Tab`, `Enter`/`Space`, `Escape` to clear), screen-reader aria region descriptors, and live iframe sandbox notice banners. Selection remains strictly read-only; inline editing triggers flow through `proposeSectionEdit` and require explicit user approval without auto-applying mutations.
- [x] Shared visual-build-surface design tokens and responsive layout controls: consolidated tokens in `@wp-agent/design-system` covering typography, spacing, radius, selection/highlight colors (`selectionOutline`, `selectionRing`, `selectionBg`, `hoverOutline`, `focusRing`), and responsive viewports (`desktop`, `tablet`, `mobile`). Viewport controls are synchronized in `PreviewCanvas` and `Header` with accessible labels, visible pressed/focus states, and exact viewport dimensions (`100%`, `768px`, `390px`) without triggering mutations or network requests.
- [x] Read-only and editable Gutenberg block property inspector: selecting a page section opens an accessible inspector showing its block type, excerpt, and allow-listed attributes. Editable controls (`align`, `backgroundColor`, `textColor`, `fontSize`, and `style.spacing.padding`) edit strictly in local draft state with zero network calls and a visible dirty badge. "Discard" resets state cleanly, and "Stage proposal" submits a structured `propertyPatch` to stage a proposal for explicit human approval. Direct saving or auto-applying to WordPress is strictly disallowed.
- [x] Deploy/publish checklist with pre-flight checks: pre-flight checks evaluate authorized local target environments, post status staging, content presence/integrity, and title requirements as blocking items, with SEO excerpt and permalink slug recommendations as advisory warnings. The checklist is surfaced in the dashboard publish approval modal, publish live action is disabled on blocking failures, and all checks are strictly re-verified on the API server during apply before executing verified publication. Automated tests pass across contracts, API, and dashboard routes.

### Phase 4 follow-on
- [x] Approval-gated Gutenberg section reordering: drag-and-drop controls in the Pages & Sections tree allow reordering top-level blocks in local draft state with zero network calls until staging. Staging creates a structured, reviewable proposal requiring explicit approval. Server validation enforces page/section membership, exact set of top-level sections, duplicate/missing/unsupported checks, preserves block attributes/inner blocks/content exactly while reordering only slices, and applies all safeguards (local-target, plan integrity, stale-state rejection, snapshot-before-write, concurrency protection, exact read-back verification). Tests cover draft-zero-network, stage-without-apply, explicit approval, sibling preservation, rejection cases, and fail-closed behaviors.

- **Next task:** Harden reorder for edge cases (very large pages, mixed content) and add UX polish while preserving all approval gates.
- **Safe parallel task:** Review Gutenberg block wrapper and inner-block structure parsing rules, read-only and without modifying WordPress.

## 4. Acceptance for Phase 1
- `tsc --noEmit` passes for the dashboard.
- Existing dashboard tests pass (auth, middleware, redirect, api-auth, site-access,
  secret-boundary, password).
- Production build succeeds.
- `http://localhost:3002/login`, `/register`, and the protected workspace render correctly.
- Screenshots at desktop and mobile widths show no overflow, clipping, or console errors.

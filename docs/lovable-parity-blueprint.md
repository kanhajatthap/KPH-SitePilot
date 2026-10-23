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
- Recent conversations and projects (localStorage first, Supabase later).
- Resume a conversation with full message history.
- Per-project site binding and last-known capability snapshot.

### Phase 3 — Agent quality
- System prompt parity: clarify → plan → act → verify → summarise.
- Stream reasoning tokens and tool calls into the timeline.
- Structured "what changed" summaries with diffs and undo hints.
- Follow-up awareness: edits apply to the last staged artifact unless re-scoped.

### Phase 4 — Build surface
- File/route tree for generated pages and sections.
- Version history with restore.
- Inline section editing and visual selection.
- Deploy/publish checklist with pre-flight checks.

## 4. Acceptance for Phase 1
- `tsc --noEmit` passes for the dashboard.
- Existing dashboard tests pass (auth, middleware, redirect, api-auth, site-access,
  secret-boundary, password).
- Production build succeeds.
- `http://localhost:3002/login`, `/register`, and the protected workspace render correctly.
- Screenshots at desktop and mobile widths show no overflow, clipping, or console errors.

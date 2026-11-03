/**
 * Static, honest content for the public landing page (E9-18).
 *
 * Every claim here is backed by shipped behaviour — no invented metrics,
 * no "coming soon" framed as available. Keeping the content in a pure module
 * lets the docs/landing test assert that every CTA points at a real route.
 */

export const LANDING_CTA = {
  href: '/register',
  label: 'Get started free',
} as const;

export const LANDING_SECONDARY = {
  href: '/docs',
  label: 'Read the docs',
} as const;

export interface LandingStep {
  number: string;
  title: string;
  detail: string;
  href: string;
  /** Set when this step leads to a session-gated page. */
  note?: string;
}

export const LANDING_STEPS: readonly LandingStep[] = [
  {
    number: '01',
    title: 'Install the connector',
    detail:
      'Upload one WordPress plugin ZIP and activate it. The site calls SitePilot over HTTPS — no inbound port is opened.',
    href: '/docs/connector',
  },
  {
    number: '02',
    title: 'Pair with a single-use code',
    detail:
      'Create a ten-minute code in the guided setup, paste it into SitePilot → Connect, and wait for the first heartbeat.',
    href: '/onboarding',
    note: 'Sign-in required',
  },
  {
    number: '03',
    title: 'Prompt, review, approve',
    detail:
      'Describe the change. A plan is built, a snapshot is taken before every write, the result is read back, and undo stays one click away.',
    href: '/docs/safety',
  },
];

export interface LandingGuarantee {
  label: string;
  detail: string;
}

export const LANDING_GUARANTEES: readonly LandingGuarantee[] = [
  { label: 'Plan → approve → verify', detail: 'No write happens without your explicit approval.' },
  { label: '34 allowlisted tools', detail: 'Every tool has a scope, a risk floor and an undo path.' },
  { label: 'Snapshot + one-click undo', detail: 'Writes are verified by reading the site back.' },
  { label: 'Bring your own model key', detail: 'A deterministic planner works even without one.' },
];

export const LANDING_FOOTER_LINKS = [
  { href: '/docs', label: 'Docs' },
  { href: '/docs/troubleshooting', label: 'Troubleshooting' },
  { href: '/docs/faq', label: 'FAQ' },
  { href: '/login', label: 'Sign in' },
  { href: 'https://github.com/kanhajatthap/KPH-SitePilot/releases/latest', label: 'Connector release ↗' },
] as const;

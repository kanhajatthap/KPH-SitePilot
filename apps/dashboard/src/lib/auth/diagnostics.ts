/**
 * Authentication email diagnostics.
 *
 * There are two transports and they fail differently:
 *
 *  - **App-side mailer (Resend)** — the app mints the link and sends the mail
 *    itself. Supabase's SMTP, Site URL and hourly mail quota are off the path;
 *    what matters is a verified sender domain and a working API key.
 *  - **Supabase mailer (fallback)** — the project's SMTP, Site URL, redirect
 *    allow list and hourly quota decide whether anything arrives.
 *
 * The origin problem and the redirect allow list are visible from outside
 * Supabase and are always reported. Delivery itself is never claimed as `ok`:
 * SMTP lives behind a service-role key and an inbox cannot be read from here,
 * so `emailDelivery` stays `unverified` in both modes. `nextSteps` is chosen
 * from the transport actually in use — telling an app-mailer deployment to
 * "configure custom SMTP" is exactly the kind of dishonest hint this endpoint
 * exists to avoid.
 */

import { getSupabasePublicConfig } from '../supabase/config';
import { mailerStatus } from './mailer';
import {
  emailRedirectTargets,
  resolveSiteUrl,
  type EmailRedirectTargets,
  type ResolvedSiteUrl,
} from './site-url';

export type ProviderCheck =
  | {
      reachable: true;
      status: number;
      confirmationRequired: boolean | null;
      signupsEnabled: boolean | null;
      checkedAt: string;
    }
  | {
      reachable: false;
      status: number | null;
      error: string;
      checkedAt: string;
    };

export interface AuthDiagnostics {
  authEnabled: boolean;
  siteUrl: Pick<ResolvedSiteUrl, 'url' | 'source' | 'secure' | 'trusted'>;
  emailRedirects: EmailRedirectTargets;
  /** Supabase settings cannot be read with the anon key — always `unverified` here. */
  emailDelivery: 'unverified' | 'not-configured';
  /**
   * Whether the app sends its own mail. `false` means delivery depends entirely
   * on the project's SMTP, which is the usual reason nothing arrives.
   */
  mailer: { configured: boolean; provider: 'resend'; from: string | null };
  warnings: string[];
  nextSteps: string[];
  provider?: ProviderCheck;
}

/** Only shown when the app has *no* mailer of its own. */
const SUPABASE_MAILER_NEXT_STEPS = [
  'In Supabase → Authentication → URL Configuration, set Site URL to this deployment origin and add the three redirect URLs listed here.',
  'In Supabase → Authentication → Emails, configure custom SMTP (Resend, Brevo, SendGrid or SES). The built-in mailer is for testing and only reaches project members.',
  'Send one real signup and one password reset, then confirm the links point at this origin.',
];

/**
 * Resend's `onboarding@resend.dev` is a shared sandbox sender: it can only
 * reach the Resend account owner. Real signups need a verified domain.
 */
function usesSharedSender(from: string | null): boolean {
  return Boolean(from && /@resend\.dev$/i.test(from));
}

const SHARED_SENDER_WARNING =
  'The sender uses Resend\'s shared test domain (onboarding@resend.dev); mail only reaches the Resend account owner until a sending domain is verified.';

function appMailerNextSteps(from: string | null): string[] {
  const steps = [
    'In Resend, check Emails/Logs for a rejected or bounced send.',
    'Confirm RESEND_API_KEY and SITEPILOT_MAIL_FROM are set on this deployment, then redeploy after any change.',
    'Send one real signup and one password reset, then confirm the links point at this origin.',
  ];
  if (usesSharedSender(from)) {
    steps.unshift('Verify a sending domain in Resend (SPF + DKIM) and set SITEPILOT_MAIL_FROM to an address on that domain before inviting other users.');
  }
  return steps;
}

/**
 * Diagnostics that need no network call: URL resolution plus configuration
 * warnings. Safe to render straight into an auth page.
 */
export function localAuthDiagnostics(
  env: Record<string, string | undefined> = process.env,
  requestOrigin: string | null = null,
  /** Defaults to `NODE_ENV === 'production'` or any Vercel environment. */
  production?: boolean
): AuthDiagnostics {
  let authEnabled = false;
  let configError: string | null = null;

  try {
    authEnabled = getSupabasePublicConfig(env) !== null;
  } catch (error) {
    // Half-configured Supabase (URL without key, or vice versa) is a real state.
    configError = (error as Error).message;
  }

  const resolved = resolveSiteUrl({
    env,
    requestOrigin,
    production: production ?? (env.NODE_ENV === 'production' || Boolean(env.VERCEL_ENV)),
  });
  const warnings = [...resolved.warnings];

  if (configError) warnings.push(configError);
  if (!authEnabled && !configError) {
    warnings.push('Supabase is not configured on this deployment, so no auth email can be sent.');
  }

  const mailer = mailerStatus(env);
  if (authEnabled && !mailer.configured) {
    warnings.push(
      'No app-side mailer is configured (RESEND_API_KEY + SITEPILOT_MAIL_FROM), so authentication email depends on the Supabase project SMTP.'
    );
  }
  if (authEnabled && mailer.configured && usesSharedSender(mailer.from)) {
    warnings.push(SHARED_SENDER_WARNING);
  }

  return {
    authEnabled,
    mailer,
    siteUrl: {
      url: resolved.url,
      source: resolved.source,
      secure: resolved.secure,
      trusted: resolved.trusted,
    },
    emailRedirects: emailRedirectTargets(resolved.url),
    emailDelivery: authEnabled ? 'unverified' : 'not-configured',
    warnings,
    nextSteps: authEnabled
      ? mailer.configured
        ? appMailerNextSteps(mailer.from)
        : SUPABASE_MAILER_NEXT_STEPS
      : [],
  };
}

export interface ProbeOptions {
  /** Defaults to global `fetch`; injected in tests. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Asks the Auth server what it will do with a new signup.
 *
 * `GET /auth/v1/settings` is a public endpoint and returns only public flags —
 * confirmation requirement, whether signups are open, enabled providers. It does
 * not reveal SMTP configuration, and this function never returns the project URL
 * or any key material.
 */
export async function probeAuthProvider(options: ProbeOptions = {}): Promise<ProviderCheck> {
  const checkedAt = new Date().toISOString();
  const config = getSupabasePublicConfig();
  if (!config) {
    return { reachable: false, status: null, error: 'auth-not-configured', checkedAt };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 3500);

  try {
    const response = await fetchFn(`${config.url.replace(/\/$/, '')}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return { reachable: false, status: response.status, error: `http-${response.status}`, checkedAt };
    }

    const body = (await response.json()) as {
      mailer_autoconfirm?: boolean;
      disable_signup?: boolean;
    };

    return {
      reachable: true,
      status: response.status,
      confirmationRequired: typeof body.mailer_autoconfirm === 'boolean' ? !body.mailer_autoconfirm : null,
      signupsEnabled: typeof body.disable_signup === 'boolean' ? !body.disable_signup : null,
      checkedAt,
    };
  } catch (error) {
    const name = (error as Error)?.name;
    return {
      reachable: false,
      status: null,
      error: name === 'AbortError' ? 'timeout' : 'network-error',
      checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

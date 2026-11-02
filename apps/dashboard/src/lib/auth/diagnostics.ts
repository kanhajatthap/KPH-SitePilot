/**
 * Authentication email diagnostics.
 *
 * Almost every "the confirmation email never arrived" report is one of four
 * things, and three of them are visible from outside Supabase:
 *
 *   1. no custom SMTP configured  → Supabase's default mailer only delivers to
 *      project members and throttles hard;
 *   2. the deployment resolves its own URL to localhost, so the link inside the
 *      mail points nowhere;
 *   3. the redirect URL is missing from the project's allow list, so Supabase
 *      refuses the request before an email is even queued;
 *   4. the hourly email quota is already spent.
 *
 * This module reports (1)–(3) honestly. (1) lives behind the service-role key and
 * is reported as `unverified` rather than guessed — an app that claims "SMTP is
 * fine" when it cannot see SMTP is worse than one that asks you to check.
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

const NEXT_STEPS = [
  'In Supabase → Authentication → URL Configuration, set Site URL to this deployment origin and add the three redirect URLs listed here.',
  'In Supabase → Authentication → Emails, configure custom SMTP (Resend, Brevo, SendGrid or SES). The built-in mailer is for testing and only reaches project members.',
  'Send one real signup and one password reset, then confirm the links point at this origin.',
];

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
    nextSteps: authEnabled ? NEXT_STEPS : [],
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

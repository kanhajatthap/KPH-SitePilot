'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { safeNextPath } from '../../lib/auth/redirect';
import { confirmationRedirectUrl, recoveryRedirectUrl } from '../../lib/auth/site-url';
import { createAuthEmailLink } from '../../lib/auth/email-links';
import { mailerConfig, sendAuthMail, type AuthMailKind } from '../../lib/auth/mailer';
import { siteOrigin } from '../../lib/auth/request-site-url';

type AuthErrorCode =
  | 'supabase-not-configured'
  | 'missing-credentials'
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'email-invalid'
  | 'weak-password'
  | 'password-mismatch'
  | 'duplicate-email'
  | 'rate-limited'
  | 'same-password'
  | 'reset-link-invalid'
  | 'signout-failed'
  | 'auth-failed'
  | 'resend-failed'
  | 'auth-unreachable';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function rawFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function nextFrom(formData: FormData): string {
  return safeNextPath(formData.get('next'));
}

function withNext(path: string, next: string): string {
  if (next === '/') return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}next=${encodeURIComponent(next)}`;
}

function fail(path: string, code: AuthErrorCode, next?: string): never {
  const target = next ? withNext(path, next) : path;
  const separator = target.includes('?') ? '&' : '?';
  redirect(`${target}${separator}error=${code}`);
}

function ok(path: string, code: string, next?: string): never {
  const target = next ? withNext(path, next) : path;
  const separator = target.includes('?') ? '&' : '?';
  redirect(`${target}${separator}message=${code}`);
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

function isValidPassword(password: string): boolean {
  return password.length >= 12 && password.length <= 128 && password.trim().length > 0;
}

function confirmationMatches(formData: FormData, password: string): boolean {
  if (!formData.has('confirmPassword')) return true;
  return rawFormValue(formData, 'confirmPassword') === password;
}

/**
 * Origin used inside authentication emails.
 *
 * Resolved per request so a deployment without `NEXT_PUBLIC_SITE_URL` links back
 * to its own Vercel URL instead of the developer's localhost.
 */
async function siteUrl(): Promise<string> {
  return siteOrigin();
}

type OwnMailOutcome = 'sent' | 'skipped' | 'unreachable' | 'rejected';

/**
 * Sends an authentication link from our own mailer, when one is configured.
 *
 * `skipped` is not an error: it means the caller should use the Supabase path
 * instead. That is what keeps this additive — an unset `RESEND_API_KEY` leaves
 * behaviour exactly as it was before this module existed.
 */
async function deliverOwnAuthMail(
  kind: AuthMailKind,
  email: string,
  next: string
): Promise<OwnMailOutcome> {
  if (!mailerConfig()) return 'skipped';

  const link = await createAuthEmailLink({ kind, email, siteOrigin: await siteUrl(), next });
  if (!link.ok) return 'skipped';

  const result = await sendAuthMail({ to: email, kind, url: link.url });
  if (result.ok) return 'sent';
  if (result.reason === 'unreachable') return 'unreachable';
  if (result.reason === 'rejected') return 'rejected';
  return 'skipped';
}

function mapAuthError(
  error: { code?: string; status?: number; message?: string; name?: string } | null
): AuthErrorCode {
  const code = error?.code ?? '';
  // `null`, not 0: an absent status is not the same statement as "status 0"
  // (a transport failure), and conflating them mislabels ordinary API errors.
  const status = typeof error?.status === 'number' ? error.status : null;
  const message = (error?.message ?? '').toLowerCase();
  const name = error?.name ?? '';

  if (code === 'invalid_credentials' || code === 'invalid_grant' || (status === 400 && message.includes('invalid login'))) {
    return 'invalid-credentials';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'email-not-confirmed';
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) {
    return 'duplicate-email';
  }
  if (code === 'weak_password' || message.includes('password should be')) return 'weak-password';
  if (code === 'same_password' || message.includes('should be different')) return 'same-password';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return 'rate-limited';
  }
  // A transport failure is not "something went wrong": it means the Auth server
  // was never reached (project paused, deleted, or a wrong URL). Naming it turns
  // an hour of guessing into one line of copy.
  if (
    name === 'AuthRetryableFetchError' ||
    status === 0 ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('timed out')
  ) {
    return 'auth-unreachable';
  }
  return 'auth-failed';
}

export async function signIn(formData: FormData): Promise<void> {
  const next = nextFrom(formData);
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail('/login', 'supabase-not-configured', next);

  const email = normaliseEmail(formValue(formData, 'email'));
  const password = rawFormValue(formData, 'password');
  if (!email || !isValidEmail(email) || !password) fail('/login', 'missing-credentials', next);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Never leak whether the email exists or the password was wrong.
  if (error) {
    const mapped = mapAuthError(error);
    fail('/login', mapped === 'email-not-confirmed' ? 'email-not-confirmed' : 'invalid-credentials', next);
  }

  redirect(next);
}

export async function signUp(formData: FormData): Promise<void> {
  const next = nextFrom(formData);
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail('/register', 'supabase-not-configured', next);

  const email = normaliseEmail(formValue(formData, 'email'));
  const password = rawFormValue(formData, 'password');
  if (!isValidEmail(email)) fail('/register', 'email-invalid', next);
  if (!isValidPassword(password)) fail('/register', 'weak-password', next);
  if (!confirmationMatches(formData, password)) fail('/register', 'password-mismatch', next);

  const emailRedirectTo = confirmationRedirectUrl(await siteUrl(), next);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (error) fail('/register', mapAuthError(error), next);

  // Supabase returns an empty identities array for an existing confirmed user
  // instead of an error when email enumeration protection is enabled.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    fail('/register', 'duplicate-email', next);
  }

  // Email confirmation disabled: a session is returned and the user is signed in.
  if (data.session) redirect(next);

  // Supabase's built-in mailer only reaches project members, so a freshly
  // created account can sit unconfirmed forever. When our own mailer is
  // configured, send the link ourselves. A failure here must not turn a created
  // account into an error screen — the login page has a resend panel for this.
  await deliverOwnAuthMail('confirmation', email, next);

  ok('/login', 'check-email', next);
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail('/forgot-password', 'supabase-not-configured');

  const email = normaliseEmail(formValue(formData, 'email'));
  if (!isValidEmail(email)) fail('/forgot-password', 'email-invalid');

  // Recovery is the one email a user cannot work around, so the configured
  // mailer gets first refusal; Supabase stays the fallback.
  const own = await deliverOwnAuthMail('recovery', email, '/reset-password');
  if (own === 'sent') ok('/forgot-password', 'reset-sent');
  if (own === 'unreachable') fail('/forgot-password', 'auth-unreachable');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: recoveryRedirectUrl(await siteUrl()),
  });

  if (error) {
    const mapped = mapAuthError(error);
    // Rate limits and an unreachable provider say nothing about whether an
    // account exists, so naming them leaks nothing — and claiming "reset sent"
    // when nothing was sent would send the user to an inbox that stays empty.
    if (mapped === 'rate-limited' || mapped === 'auth-unreachable') fail('/forgot-password', mapped);
  }

  // Otherwise always report success so the endpoint cannot be used to enumerate accounts.
  ok('/forgot-password', 'reset-sent');
}

export async function updatePassword(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail('/reset-password', 'supabase-not-configured');

  const password = rawFormValue(formData, 'password');
  if (!isValidPassword(password)) fail('/reset-password', 'weak-password');
  if (!confirmationMatches(formData, password)) fail('/reset-password', 'password-mismatch');

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) fail('/reset-password', 'reset-link-invalid');

  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail('/reset-password', mapAuthError(error));

  // A recovery session is single-purpose; force a fresh sign-in with the new password.
  await supabase.auth.signOut();
  ok('/login', 'password-updated');
}

/**
 * Re-sends the signup confirmation email.
 *
 * Confirmation emails get lost — spam folder, deleted message, a typo'd address —
 * and the only cure used to be "sign up again", which silently does nothing for
 * an existing unconfirmed account. This action re-sends on demand.
 *
 * The response is deliberately neutral: it never reveals whether the address has
 * an account, and Supabase's per-hour email quota surfaces as `rate-limited` so
 * the UI can be honest instead of claiming a mail went out.
 */
export async function resendConfirmation(formData: FormData): Promise<void> {
  const next = nextFrom(formData);
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail('/login', 'supabase-not-configured', next);

  const email = normaliseEmail(formValue(formData, 'email'));
  if (!isValidEmail(email)) fail('/login', 'email-invalid', next);

  const own = await deliverOwnAuthMail('confirmation', email, next);
  if (own === 'sent') ok('/login', 'confirmation-resent', next);
  if (own === 'unreachable') fail('/login', 'auth-unreachable', next);
  if (own === 'rejected') fail('/login', 'resend-failed', next);

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: confirmationRedirectUrl(await siteUrl(), next) },
  });

  if (!error) ok('/login', 'confirmation-resent', next);

  // Two failures are worth naming because they change what the user should do:
  // the hourly quota is spent, or the provider cannot be reached at all.
  const mapped = mapAuthError(error);
  if (mapped === 'rate-limited') fail('/login', 'rate-limited', next);
  if (mapped === 'auth-unreachable') fail('/login', 'auth-unreachable', next);

  // Everything else stays neutral so the form cannot be used to enumerate accounts.
  ok('/login', 'confirmation-resent', next);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) fail('/login', 'signout-failed');
  }
  ok('/login', 'signed-out');
}

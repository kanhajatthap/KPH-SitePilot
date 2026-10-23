'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { safeNextPath } from '../../lib/auth/redirect';

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
  | 'auth-failed';

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

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002').replace(/\/$/, '');
}

function mapAuthError(error: { code?: string; status?: number; message?: string } | null): AuthErrorCode {
  const code = error?.code ?? '';
  const status = error?.status ?? 0;
  const message = (error?.message ?? '').toLowerCase();

  if (code === 'invalid_credentials' || code === 'invalid_grant' || status === 400 && message.includes('invalid login')) {
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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) fail('/register', mapAuthError(error), next);

  // Supabase returns an empty identities array for an existing confirmed user
  // instead of an error when email enumeration protection is enabled.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    fail('/register', 'duplicate-email', next);
  }

  // Email confirmation disabled: a session is returned and the user is signed in.
  if (data.session) redirect(next);

  ok('/login', 'check-email', next);
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail('/forgot-password', 'supabase-not-configured');

  const email = normaliseEmail(formValue(formData, 'email'));
  if (!isValidEmail(email)) fail('/forgot-password', 'email-invalid');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent('/reset-password')}`,
  });

  if (error) {
    const mapped = mapAuthError(error);
    if (mapped === 'rate-limited') fail('/forgot-password', 'rate-limited');
  }

  // Always report success so the endpoint cannot be used to enumerate accounts.
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

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) fail('/login', 'signout-failed');
  }
  ok('/login', 'signed-out');
}

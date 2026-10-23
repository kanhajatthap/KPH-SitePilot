'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabase/server';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function rawFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function authRedirect(message: string): never {
  redirect(`/login?message=${encodeURIComponent(message)}`);
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002';
}

export async function signIn(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) authRedirect('Supabase is not configured. Local mode remains available.');

  const email = formValue(formData, 'email');
  const password = rawFormValue(formData, 'password');
  if (!email || password.length < 1 || password.length > 128) {
    authRedirect('Enter your email and a password of at most 128 characters.');
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) authRedirect('Sign-in failed. Check your details and try again.');
  redirect('/');
}

export async function signUp(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) authRedirect('Supabase is not configured. Local mode remains available.');

  const email = formValue(formData, 'email');
  const password = rawFormValue(formData, 'password');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    authRedirect('Enter a valid email address.');
  }
  if (password.length < 12 || password.length > 128) {
    authRedirect('Use a password between 12 and 128 characters.');
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/`,
    },
  });
  if (error) authRedirect('Sign-up could not be completed. Check the email and try again.');
  authRedirect('Check your email for the confirmation link.');
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) authRedirect('Supabase is not configured. Local mode remains available.');

  const email = formValue(formData, 'email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    authRedirect('Enter a valid email address.');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
  });
  if (error) authRedirect('Password reset could not be requested. Try again later.');
  authRedirect('If the account exists, a password reset link has been sent.');
}

export async function updatePassword(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) authRedirect('Supabase is not configured. Local mode remains available.');

  const password = rawFormValue(formData, 'password');
  if (password.length < 12 || password.length > 128) {
    authRedirect('Use a password between 12 and 128 characters.');
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) authRedirect('The password reset link is invalid or expired.');

  const { error } = await supabase.auth.updateUser({ password });
  if (error) authRedirect('Password could not be updated. Request a new reset link.');
  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) authRedirect('Sign-out failed. Please try again.');
  }
  redirect('/login');
}

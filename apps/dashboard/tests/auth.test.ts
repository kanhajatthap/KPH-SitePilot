import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signUp, requestPasswordReset, updatePassword, signOut } from '../src/app/auth/actions';

const { createSupabaseServerClient, redirect } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('../src/lib/supabase/server', () => ({ createSupabaseServerClient }));
vi.mock('next/navigation', () => ({ redirect }));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe('Supabase authentication actions', () => {
  const auth = {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClient.mockResolvedValue({ auth });
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });

  it('signs in and returns to the requested safe path', async () => {
    await expect(
      signIn(form({ email: ' USER@Example.test ', password: 'correct horse battery staple', next: '/projects?tab=active' }))
    ).rejects.toThrow('REDIRECT:/projects?tab=active');

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.test',
      password: 'correct horse battery staple',
    });
  });

  it('never redirects to an external URL from the next field', async () => {
    await expect(
      signIn(form({ email: 'user@example.test', password: 'correct horse battery staple', next: 'https://evil.example' }))
    ).rejects.toThrow('REDIRECT:/');
  });

  it('does not reveal whether the email or the password was wrong', async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials', status: 400 }),
    });
    await expect(signIn(form({ email: 'user@example.test', password: 'wrong' })))
      .rejects.toThrow('REDIRECT:/login?error=invalid-credentials');
  });

  it('asks unconfirmed users to confirm their email', async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: Object.assign(new Error('Email not confirmed'), { code: 'email_not_confirmed' }),
    });
    await expect(signIn(form({ email: 'user@example.test', password: 'a sufficiently long password' })))
      .rejects.toThrow('REDIRECT:/login?error=email-not-confirmed');
  });

  it('rejects missing or malformed credentials before calling the provider', async () => {
    await expect(signIn(form({ email: 'not-an-email', password: 'x' })))
      .rejects.toThrow('REDIRECT:/login?error=missing-credentials');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('enforces password policy and confirmation on signup', async () => {
    await expect(signUp(form({ email: 'user@example.test', password: 'short' })))
      .rejects.toThrow('REDIRECT:/register?error=weak-password');
    expect(auth.signUp).not.toHaveBeenCalled();

    await expect(
      signUp(form({ email: 'user@example.test', password: 'a sufficiently long password', confirmPassword: 'different password value' }))
    ).rejects.toThrow('REDIRECT:/register?error=password-mismatch');
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('sends a confirmation email and preserves the return path', async () => {
    await expect(
      signUp(form({ email: 'user@example.test', password: 'a sufficiently long password', next: '/projects' }))
    ).rejects.toThrow('REDIRECT:/login?next=%2Fprojects&message=check-email');

    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.test',
        options: { emailRedirectTo: expect.stringContaining('/auth/confirm?next=%2Fprojects') },
      })
    );
  });

  it('signs the user in immediately when email confirmation is disabled', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: { access_token: 'x' } }, error: null });
    await expect(
      signUp(form({ email: 'user@example.test', password: 'a sufficiently long password', next: '/projects' }))
    ).rejects.toThrow('REDIRECT:/projects');
  });

  it('detects duplicate registrations without creating a second account', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    await expect(signUp(form({ email: 'user@example.test', password: 'a sufficiently long password' })))
      .rejects.toThrow('REDIRECT:/register?error=duplicate-email');
  });

  it('maps provider duplicate-email errors', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: Object.assign(new Error('User already registered'), { code: 'user_already_exists' }),
    });
    await expect(signUp(form({ email: 'user@example.test', password: 'a sufficiently long password' })))
      .rejects.toThrow('REDIRECT:/register?error=duplicate-email');
  });

  it('requests recovery with a same-origin callback and never enumerates accounts', async () => {
    await expect(requestPasswordReset(form({ email: 'user@example.test' })))
      .rejects.toThrow('REDIRECT:/forgot-password?message=reset-sent');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'user@example.test',
      { redirectTo: expect.stringContaining('/auth/confirm?next=%2Freset-password') }
    );

    auth.resetPasswordForEmail.mockResolvedValue({
      error: Object.assign(new Error('provider detail'), { code: 'unexpected_failure' }),
    });
    await expect(requestPasswordReset(form({ email: 'user@example.test' })))
      .rejects.toThrow('REDIRECT:/forgot-password?message=reset-sent');
  });

  it('surfaces recovery rate limits', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      error: Object.assign(new Error('rate limited'), { code: 'over_email_send_rate_limit', status: 429 }),
    });
    await expect(requestPasswordReset(form({ email: 'user@example.test' })))
      .rejects.toThrow('REDIRECT:/forgot-password?error=rate-limited');
  });

  it('requires a real recovery session before updating a password', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') });
    await expect(updatePassword(form({ password: 'a sufficiently long new password' })))
      .rejects.toThrow('REDIRECT:/reset-password?error=reset-link-invalid');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('updates the password, ends the recovery session and asks for a fresh sign-in', async () => {
    await expect(updatePassword(form({ password: 'a sufficiently long new password' })))
      .rejects.toThrow('REDIRECT:/login?message=password-updated');

    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'a sufficiently long new password' });
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('signs out and returns to login', async () => {
    await expect(signOut()).rejects.toThrow('REDIRECT:/login?message=signed-out');
    expect(auth.signOut).toHaveBeenCalled();
  });
});

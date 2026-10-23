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
    auth.signUp.mockResolvedValue({ error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });

  it('signs in with the supplied credentials and redirects to the dashboard', async () => {
    await expect(signIn(form({ email: 'user@example.test', password: 'correct horse battery staple' })))
      .rejects.toThrow('REDIRECT:/');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.test',
      password: 'correct horse battery staple',
    });
  });

  it('does not reveal sign-in failures and sends users back to login', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('auth provider internal detail') });
    await expect(signIn(form({ email: 'user@example.test', password: 'incorrect password' })))
      .rejects.toThrow('REDIRECT:/login?message=Sign-in%20failed.%20Check%20your%20details%20and%20try%20again.');
  });

  it('requires a strong password and sends signup confirmation email', async () => {
    await expect(signUp(form({ email: 'user@example.test', password: 'short' })))
      .rejects.toThrow('REDIRECT:/login?message=Use%20a%20password%20between%2012%20and%20128%20characters.');
    expect(auth.signUp).not.toHaveBeenCalled();

    await expect(signUp(form({ email: 'user@example.test', password: 'a sufficiently long password' })))
      .rejects.toThrow('REDIRECT:/login?message=Check%20your%20email%20for%20the%20confirmation%20link.');
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.test',
      options: { emailRedirectTo: expect.stringContaining('/auth/confirm?next=/') },
    }));
  });

  it('requests password recovery using a same-origin callback', async () => {
    await expect(requestPasswordReset(form({ email: 'user@example.test' })))
      .rejects.toThrow('REDIRECT:/login?message=If%20the%20account%20exists%2C%20a%20password%20reset%20link%20has%20been%20sent.');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'user@example.test',
      { redirectTo: expect.stringContaining('/auth/confirm?next=/reset-password') }
    );
  });

  it('updates passwords only for a verified recovery session and signs out', async () => {
    await expect(updatePassword(form({ password: 'a sufficiently long new password' })))
      .rejects.toThrow('REDIRECT:/');
    expect(auth.getUser).toHaveBeenCalled();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'a sufficiently long new password' });

    await expect(signOut()).rejects.toThrow('REDIRECT:/login');
    expect(auth.signOut).toHaveBeenCalled();
  });
});

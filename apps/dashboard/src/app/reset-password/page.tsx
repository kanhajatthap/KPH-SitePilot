import Link from 'next/link';
import { requestPasswordReset, updatePassword } from '../auth/actions';
import { getSupabasePublicConfig } from '../../lib/supabase/config';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const configured = Boolean(getSupabasePublicConfig());

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold">Reset password</h1>
      {!configured ? (
        <p role="status">Supabase is not configured; password reset is unavailable in local mode.</p>
      ) : (
        <>
          {message ? <p role="status" className="rounded border border-slate-700 p-4">{message}</p> : null}
          <form action={requestPasswordReset} className="flex flex-col gap-3 rounded border border-slate-700 p-5">
            <label htmlFor="reset-email">Account email</label>
            <input id="reset-email" name="email" type="email" autoComplete="email" required className="rounded bg-slate-900 p-2" />
            <button className="rounded bg-blue-600 p-2" type="submit">Send reset link</button>
          </form>
          <form action={updatePassword} className="flex flex-col gap-3 rounded border border-slate-700 p-5">
            <label htmlFor="new-password">New password (12–128 characters)</label>
            <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="rounded bg-slate-900 p-2" />
            <button className="rounded border border-slate-600 p-2" type="submit">Update password</button>
          </form>
        </>
      )}
      <Link href="/login" className="underline">Back to login</Link>
    </main>
  );
}

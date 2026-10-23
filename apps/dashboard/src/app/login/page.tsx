import Link from 'next/link';
import { signIn, signUp } from '../auth/actions';
import { getSupabasePublicConfig } from '../../lib/supabase/config';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const configured = Boolean(getSupabasePublicConfig());

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold">KPH SitePilot sign in</h1>
      {!configured ? (
        <p role="status" className="rounded border border-slate-700 p-4">
          Supabase is not configured. The local personal-use dashboard remains available at{' '}
          <Link className="underline" href="/">the workspace</Link>.
        </p>
      ) : (
        <>
          {message ? <p role="status" className="rounded border border-slate-700 p-4">{message}</p> : null}
          <form action={signIn} className="flex flex-col gap-3 rounded border border-slate-700 p-5">
            <h2 className="text-xl">Log in</h2>
            <label htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" autoComplete="email" required className="rounded bg-slate-900 p-2" />
            <label htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required className="rounded bg-slate-900 p-2" />
            <button className="rounded bg-blue-600 p-2" type="submit">Log in</button>
          </form>
          <form action={signUp} className="flex flex-col gap-3 rounded border border-slate-700 p-5">
            <h2 className="text-xl">Create an account</h2>
            <label htmlFor="signup-email">Email</label>
            <input id="signup-email" name="email" type="email" autoComplete="email" required className="rounded bg-slate-900 p-2" />
            <label htmlFor="signup-password">Password (12–128 characters)</label>
            <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="rounded bg-slate-900 p-2" />
            <button className="rounded border border-slate-600 p-2" type="submit">Sign up</button>
          </form>
          <div className="flex items-center justify-between text-sm">
            <Link href="/reset-password" className="underline hover:text-slate-200">Forgot your password?</Link>
            <Link href="/" className="underline text-blue-400 hover:text-blue-300">Open Local Workspace (No login required) &rarr;</Link>
          </div>
        </>
      )}
    </main>
  );
}

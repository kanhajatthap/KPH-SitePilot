import Link from 'next/link';
import { signIn } from '../auth/actions';
import { getSupabasePublicConfig } from '../../lib/supabase/config';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Alert } from '../../components/auth/Alert';
import { DemoAccountCard } from '../../components/auth/DemoAccountCard';
import { PasswordField } from '../../components/auth/PasswordField';
import { SubmitButton } from '../../components/auth/SubmitButton';
import { authErrorFrom, authInfoFrom } from '../../lib/auth/messages';
import { safeNextPath } from '../../lib/auth/redirect';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string; next?: string; reason?: string }>;
}) {
  const { message, error, next, reason } = await searchParams;
  const configured = Boolean(getSupabasePublicConfig());
  const safeNext = safeNextPath(next);
  const errorText = authErrorFrom(error ?? (reason === 'session_expired' ? 'session-expired' : undefined));
  const infoText = authInfoFrom(message ?? (reason === 'session_expired' ? 'session-expired' : undefined));
  const demoEmail = process.env.DEMO_ACCOUNT_EMAIL?.trim();
  const demoPassword = process.env.DEMO_ACCOUNT_PASSWORD;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue building with your WordPress agent."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link
            href={safeNext === '/' ? '/register' : `/register?next=${encodeURIComponent(safeNext)}`}
            className="font-medium text-pink-600 underline-offset-4 hover:text-pink-500 hover:underline"
          >
            Create one
          </Link>
          <span className="mx-2 text-ink-muted">·</span>
          <Link href="/forgot-password" className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">
            Forgot password?
          </Link>
        </>
      }
    >
      {!configured ? (
        <Alert variant="info">
          Authentication is not configured on this deployment. Continue to the{' '}
          <Link href="/" className="font-medium underline underline-offset-4">
            local workspace
          </Link>
          .
        </Alert>
      ) : (
        <>
          {errorText ? <Alert variant="error">{errorText}</Alert> : null}
          {infoText ? <Alert variant="success">{infoText}</Alert> : null}

          <form action={signIn} className="space-y-4" noValidate>
            <input type="hidden" name="next" value={safeNext} />

            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-ink-soft">
                Email address
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                aria-required="true"
                placeholder="you@example.com"
                className="w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-muted transition focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
            </div>

            <PasswordField
              id="login-password"
              name="password"
              label="Password"
              autoComplete="current-password"
            />

            <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
          </form>

          {demoEmail && demoPassword ? (
            <DemoAccountCard email={demoEmail} password={demoPassword} />
          ) : null}
        </>
      )}
    </AuthLayout>
  );
}

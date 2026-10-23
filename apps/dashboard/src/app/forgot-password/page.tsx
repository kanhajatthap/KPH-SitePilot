import Link from 'next/link';
import { requestPasswordReset } from '../auth/actions';
import { getSupabasePublicConfig } from '../../lib/supabase/config';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Alert } from '../../components/auth/Alert';
import { SubmitButton } from '../../components/auth/SubmitButton';
import { authErrorFrom, authInfoFrom } from '../../lib/auth/messages';

export const dynamic = 'force-dynamic';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { message, error } = await searchParams;
  const configured = Boolean(getSupabasePublicConfig());
  const errorText = authErrorFrom(error);
  const infoText = authInfoFrom(message);

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your account email and we will send a secure, single-use reset link."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-pink-600 underline-offset-4 hover:text-pink-500 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {!configured ? (
        <Alert variant="info">Authentication is not configured on this deployment.</Alert>
      ) : (
        <>
          {errorText ? <Alert variant="error">{errorText}</Alert> : null}
          {infoText ? <Alert variant="success">{infoText}</Alert> : null}

          <form action={requestPasswordReset} className="space-y-4" noValidate>
            <div>
              <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-ink-soft">
                Email address
              </label>
              <input
                id="forgot-email"
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

            <SubmitButton pendingLabel="Sending link…">Send reset link</SubmitButton>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            The link expires after a short window and can only be used once. If it expires, request a new one.
          </p>
        </>
      )}
    </AuthLayout>
  );
}

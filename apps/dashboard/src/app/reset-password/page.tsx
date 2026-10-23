import Link from 'next/link';
import { updatePassword } from '../auth/actions';
import { getSupabasePublicConfig } from '../../lib/supabase/config';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Alert } from '../../components/auth/Alert';
import { PasswordField } from '../../components/auth/PasswordField';
import { SubmitButton } from '../../components/auth/SubmitButton';
import { authErrorFrom, authInfoFrom } from '../../lib/auth/messages';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { message, error } = await searchParams;
  const configured = Boolean(getSupabasePublicConfig());
  const errorText = authErrorFrom(error);
  const infoText = authInfoFrom(message);

  let hasRecoverySession = false;
  if (configured) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      hasRecoverySession = Boolean(data.user);
    }
  }

  const linkInvalid = configured && !hasRecoverySession;

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Your reset link signs you in for this one change only."
      footer={
        <Link href="/login" className="font-medium text-pink-600 underline-offset-4 hover:text-pink-500 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {!configured ? (
        <Alert variant="info">Authentication is not configured on this deployment.</Alert>
      ) : linkInvalid ? (
        <>
          <Alert variant="error">
            This reset link is invalid or has expired. Request a fresh link to continue.
          </Alert>
          <Link
            href="/forgot-password"
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            Request a new reset link
          </Link>
        </>
      ) : (
        <>
          {errorText ? <Alert variant="error">{errorText}</Alert> : null}
          {infoText ? <Alert variant="success">{infoText}</Alert> : null}

          <form action={updatePassword} className="space-y-4" noValidate>
            <PasswordField
              id="reset-password"
              name="password"
              label="New password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              hint="12–128 characters"
            />

            <PasswordField
              id="reset-confirm-password"
              name="confirmPassword"
              label="Confirm new password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
            />

            <SubmitButton pendingLabel="Updating password…">Update password</SubmitButton>
          </form>
        </>
      )}
    </AuthLayout>
  );
}

import Link from 'next/link';
import { getSupabasePublicConfig } from '../../lib/supabase/config';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Alert } from '../../components/auth/Alert';
import { RegisterForm } from '../../components/auth/RegisterForm';
import { authErrorFrom, authInfoFrom } from '../../lib/auth/messages';
import { safeNextPath } from '../../lib/auth/redirect';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string; next?: string }>;
}) {
  const { message, error, next } = await searchParams;
  const configured = Boolean(getSupabasePublicConfig());
  const safeNext = safeNextPath(next);
  const errorText = authErrorFrom(error);
  const infoText = authInfoFrom(message);

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start with a free workspace. No card, no paid add-ons."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={safeNext === '/' ? '/login' : `/login?next=${encodeURIComponent(safeNext)}`}
            className="font-medium text-pink-600 underline-offset-4 hover:text-pink-500 hover:underline"
          >
            Sign in
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

          <RegisterForm next={safeNext} />

          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            We email a confirmation link before your account becomes active. Your password is never stored by this app —
            Supabase Auth handles it.
          </p>
        </>
      )}
    </AuthLayout>
  );
}

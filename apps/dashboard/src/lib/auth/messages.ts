export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'supabase-not-configured':
    'Authentication is not configured on this deployment. The local workspace is still available.',
  'missing-credentials': 'Enter your email address and password.',
  'invalid-credentials': 'Email or password is incorrect.',
  'email-not-confirmed':
    'Confirm your email address before signing in. Check your inbox and spam folder, or resend the link below.',
  'email-invalid': 'Enter a valid email address.',
  'weak-password': 'Use a password between 12 and 128 characters.',
  'password-mismatch': 'The two passwords do not match.',
  'confirmation-invalid':
    'This confirmation link is invalid or has expired. Sign in to request a fresh one, or use the resend form below.',
  'duplicate-email': 'An account with this email already exists. Sign in instead.',
  'rate-limited':
    'Too many attempts in a short time. Supabase allows only a few auth emails per hour — wait a few minutes and try again.',
  'same-password': 'Choose a password that is different from your current one.',
  'reset-link-invalid': 'This reset link is invalid or has expired. Request a new one.',
  'signout-failed': 'Sign out could not be completed. Try again.',
  'auth-failed': 'Something went wrong. Please try again.',
  'resend-failed':
    'The confirmation email could not be requested. If this continues, the deployment is missing custom SMTP settings.',
  'auth-unreachable':
    'The authentication service could not be reached, so no email was sent. The Supabase project may be paused, deleted, or misconfigured for this deployment.',
};

export const AUTH_INFO_MESSAGES: Record<string, string> = {
  'check-email':
    'Check your inbox — we sent a confirmation link to finish creating your account. Nothing after a few minutes? Use the resend form below.',
  'confirmation-resent':
    'If that address still needs confirming, a new link is on its way. Check spam, and remember the hourly email limit.',
  'reset-sent': 'If an account exists for that email, a reset link is on its way.',
  'password-updated': 'Password updated. Sign in with your new password.',
  'signed-out': 'You have signed out.',
  'session-expired': 'Your session expired. Sign in again to continue.',
};

export function authErrorFrom(code: string | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES['auth-failed'];
}

export function authInfoFrom(code: string | undefined): string | null {
  if (!code) return null;
  return AUTH_INFO_MESSAGES[code] ?? null;
}

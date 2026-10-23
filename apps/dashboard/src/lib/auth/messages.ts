export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'supabase-not-configured':
    'Authentication is not configured on this deployment. The local workspace is still available.',
  'missing-credentials': 'Enter your email address and password.',
  'invalid-credentials': 'Email or password is incorrect.',
  'email-not-confirmed': 'Confirm your email address before signing in. Check your inbox for the link.',
  'email-invalid': 'Enter a valid email address.',
  'weak-password': 'Use a password between 12 and 128 characters.',
  'password-mismatch': 'The two passwords do not match.',
  'confirmation-invalid': 'This confirmation link is invalid or has expired. Request a new one.',
  'duplicate-email': 'An account with this email already exists. Sign in instead.',
  'rate-limited': 'Too many attempts. Wait a minute and try again.',
  'same-password': 'Choose a password that is different from your current one.',
  'reset-link-invalid': 'This reset link is invalid or has expired. Request a new one.',
  'signout-failed': 'Sign out could not be completed. Try again.',
  'auth-failed': 'Something went wrong. Please try again.',
};

export const AUTH_INFO_MESSAGES: Record<string, string> = {
  'check-email': 'Check your inbox — we sent a confirmation link to finish creating your account.',
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

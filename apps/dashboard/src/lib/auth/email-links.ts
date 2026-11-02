/**
 * Generates the links that go inside our own authentication mail.
 *
 * Supabase can mint a single-use token for an existing account
 * (`auth.admin.generateLink`) without sending anything, which is what lets the
 * app own the transport. Two deliberate choices:
 *
 *  - **confirmation uses `magiclink`, not `signup`.** A `signup` link requires
 *    the account's password, and the only place we ever have it is inside the
 *    request that created the account — keeping a password around to re-mint
 *    links later is a trade nobody should make. A magic link proves control of
 *    the inbox and confirms the address just the same, and `/auth/confirm`
 *    already supports `type=magiclink`. The click signs the user in, which is
 *    the outcome the confirmation email asked for anyway.
 *  - the link is built here, against our own origin, so it does not depend on
 *    the project's `Site URL` being correct in a dashboard we may not control.
 *
 * Every failure is a value; a missing token is never a crash.
 */

import { createSupabaseAdminClient } from '../supabase/admin';

export type AuthLinkKind = 'confirmation' | 'recovery';

export type AuthLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'not-configured' | 'provider' | 'no-token' };

/** The OTP type Supabase must verify for each kind — and what the URL carries. */
const VERIFY_TYPE: Record<AuthLinkKind, 'magiclink' | 'recovery'> = {
  confirmation: 'magiclink',
  recovery: 'recovery',
};

const DEFAULT_NEXT: Record<AuthLinkKind, string> = {
  confirmation: '/',
  recovery: '/reset-password',
};

type AdminClient = {
  auth: {
    admin: {
      generateLink: (params: {
        type: 'magiclink' | 'recovery';
        email: string;
        options?: { redirectTo?: string };
      }) => Promise<{
        data: { properties?: { hashed_token?: string | null } | null } | null;
        error: { message?: string; code?: string } | null;
      }>;
    };
  };
};

export interface CreateAuthLinkInput {
  kind: AuthLinkKind;
  email: string;
  /** Trusted deployment origin, resolved by `site-url.ts`. */
  siteOrigin: string;
  /** Where to send the user after the click. Sanitised by the caller. */
  next?: string;
  /** Injected in tests. */
  admin?: AdminClient | null;
}

/**
 * Builds `{siteOrigin}/auth/confirm?token_hash=…&type=…&next=…`.
 *
 * `token_hash` is URL-encoded: it is base64url today, but encoding costs
 * nothing and survives the day it is not.
 */
export async function createAuthEmailLink(input: CreateAuthLinkInput): Promise<AuthLinkResult> {
  const admin = input.admin === undefined ? (createSupabaseAdminClient() as AdminClient | null) : input.admin;
  if (!admin) return { ok: false, reason: 'not-configured' };

  const type = VERIFY_TYPE[input.kind];
  const next = input.next && input.next.startsWith('/') && !input.next.startsWith('//')
    ? input.next
    : DEFAULT_NEXT[input.kind];

  const origin = input.siteOrigin.replace(/\/+$/, '');
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type,
      email: input.email,
      options: { redirectTo },
    });
    if (error) return { ok: false, reason: 'provider' };

    const token = data?.properties?.hashed_token;
    if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'no-token' };

    return {
      ok: true,
      url: `${origin}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=${type}&next=${encodeURIComponent(next)}`,
    };
  } catch {
    return { ok: false, reason: 'provider' };
  }
}

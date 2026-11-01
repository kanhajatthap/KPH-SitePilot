import { NextResponse } from 'next/server';
import { localAuthDiagnostics, probeAuthProvider } from '../../../../lib/auth/diagnostics';
import { requestOriginFromHeaders } from '../../../../lib/auth/site-url';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/auth/status` — why an auth email might not be arriving.
 *
 * Public by design: it contains no secrets, no project URL, no key material and
 * no user data. It exists so the answer to "the email never came" is a URL you
 * can open instead of a guess.
 *
 * `?probe=0` skips the network call (fast, used by the sign-in page links).
 */
export async function GET(request: Request) {
  const requestOrigin = requestOriginFromHeaders(request.headers);
  const diagnostics = localAuthDiagnostics(process.env, requestOrigin);

  const probe = new URL(request.url).searchParams.get('probe');
  if (diagnostics.authEnabled && probe !== '0') {
    diagnostics.provider = await probeAuthProvider();
  }

  return NextResponse.json(diagnostics, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

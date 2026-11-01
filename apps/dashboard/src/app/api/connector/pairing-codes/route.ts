import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { formatPairingCode, generatePairingCode, hashToken } from '../../../../lib/connector/crypto';
import { PAIRING_CODE_TTL_MS } from '../../../../lib/connector/pairing';
import { findOwnedProjectId, insertPairingCode } from '../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

/**
 * Creates a one-time pairing code for the signed-in user's project.
 *
 * The plaintext code is returned once to the dashboard and stored only as a
 * SHA-256 hash. It expires after ten minutes and can be redeemed exactly once.
 */
export async function POST() {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  if (auth.context.mode !== 'saas' || !auth.context.user) {
    return NextResponse.json(
      {
        error: 'CONNECTOR_REQUIRES_ACCOUNT',
        message:
          'Create an account and sign in to connect a WordPress site. Local mode has no project to pair with.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const projectId = await findOwnedProjectId(auth.context.user.id);
    if (!projectId) {
      return NextResponse.json(
        {
          error: 'PROJECT_REQUIRED',
          message: 'No project found for your account. Create a project, then try again.',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();

    await insertPairingCode({
      projectId,
      createdBy: auth.context.user.id,
      codeHash: hashToken(code),
      expiresAt,
    });

    return NextResponse.json(
      {
        code: formatPairingCode(code),
        expiresAt,
        expiresInSeconds: Math.round(PAIRING_CODE_TTL_MS / 1000),
        instructions:
          'In WordPress, open SitePilot → Connection, paste this code and press Connect site.',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'CONNECTOR_STORAGE_UNAVAILABLE',
        message:
          'Pairing codes cannot be stored right now. Check that the Supabase service role key is configured for this deployment. ' +
          (error as Error).message,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

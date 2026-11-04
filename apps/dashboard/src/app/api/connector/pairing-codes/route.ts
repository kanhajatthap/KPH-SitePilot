import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { formatPairingCode, generatePairingCode, hashToken } from '../../../../lib/connector/crypto';
import { PAIRING_CODE_TTL_MS } from '../../../../lib/connector/pairing';
import {
  ensureOwnedProjectId,
  insertPairingCode,
  projectBelongsToUser,
} from '../../../../lib/connector/store';

export const dynamic = 'force-dynamic';

const PairingCodeBodySchema = z
  .object({
    projectId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Creates a one-time pairing code for the signed-in user's project.
 *
 * When `projectId` is supplied, ownership is verified; when omitted, the user's
 * first project is used (or a default "My Sites" workspace is provisioned
 * automatically so first-time users never hit a missing-project dead end).
 *
 * The plaintext code is returned once to the dashboard and stored only as a
 * SHA-256 hash. It expires after ten minutes and can be redeemed exactly once.
 */
export async function POST(req: Request) {
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

  let requestedProjectId: string | undefined;
  if (req) {
    let rawText: string;
    try {
      rawText = await req.text();
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Request body could not be read. Send a new request.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (rawText.trim().length > 0) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Request body must be valid JSON.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const checked = PairingCodeBodySchema.safeParse(parsedJson);
      if (!checked.success) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'projectId must be a valid UUID when provided.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      requestedProjectId = checked.data.projectId;
    }
  }

  try {
    let projectId: string | null = null;
    if (requestedProjectId) {
      const owned = await projectBelongsToUser(requestedProjectId, auth.context.user.id);
      if (!owned) {
        return NextResponse.json(
          { error: 'PROJECT_NOT_FOUND', message: 'No such project for your account.' },
          { status: 404, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      projectId = requestedProjectId;
    } else {
      projectId = await ensureOwnedProjectId(auth.context.user.id, auth.context.user.email);
    }

    if (!projectId) {
      return NextResponse.json(
        {
          error: 'CONNECTOR_STORAGE_UNAVAILABLE',
          message: 'Connector storage is not configured for this deployment.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
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
        projectId,
        expiresAt,
        expiresInSeconds: Math.round(PAIRING_CODE_TTL_MS / 1000),
        instructions:
          'In WordPress, open SitePilot → Connection, paste this code and press Connect site.',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      {
        error: 'CONNECTOR_STORAGE_UNAVAILABLE',
        message:
          'Pairing code creation could not be confirmed. Request a new code before connecting.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

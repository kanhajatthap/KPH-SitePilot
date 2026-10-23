import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '../../../../lib/auth/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    { mode: auth.context.mode, user: auth.context.user },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

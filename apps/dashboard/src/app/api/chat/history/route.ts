import { NextRequest, NextResponse } from 'next/server';
import { ChatHistorySchema } from '@wp-agent/contracts';
import { authenticateApiRequest } from '../../../../lib/auth/api';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

function unavailableResponse() {
  return NextResponse.json(
    {
      error: 'CHAT_HISTORY_UNAVAILABLE',
      message: 'Persistent chat history requires a signed-in Supabase account.',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET() {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) return unavailableResponse();

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailableResponse();

  const { data, error } = await supabase
    .from('dashboard_chat_history')
    .select('conversations, active_conversation_id')
    .eq('owner_id', auth.context.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: 'CHAT_HISTORY_READ_FAILED', message: 'Unable to load chat history.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const parsed = ChatHistorySchema.safeParse({
    conversations: data?.conversations ?? [],
    activeConversationId: data?.active_conversation_id ?? null,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'CHAT_HISTORY_INVALID',
        message: 'Stored chat history is invalid. It was not loaded or overwritten.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(parsed.data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateApiRequest();
  if (!auth.ok) return auth.response;
  if (auth.context.mode !== 'saas' || !auth.context.user) return unavailableResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', message: 'Request body must be valid JSON.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const parsed = ChatHistorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Chat history must contain at most 50 valid conversations.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailableResponse();

  const { error } = await supabase.from('dashboard_chat_history').upsert(
    {
      owner_id: auth.context.user.id,
      conversations: parsed.data.conversations,
      active_conversation_id: parsed.data.activeConversationId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_id' }
  );

  if (error) {
    return NextResponse.json(
      { error: 'CHAT_HISTORY_SAVE_FAILED', message: 'Unable to save chat history.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { status: 'saved', conversationCount: parsed.data.conversations.length },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

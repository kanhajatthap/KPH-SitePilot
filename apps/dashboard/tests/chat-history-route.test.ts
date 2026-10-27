import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('../src/lib/supabase/server', () => ({ createSupabaseServerClient }));

import { GET, PUT } from '../src/app/api/chat/history/route';

describe('chat history API', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const conversation = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Build a landing page',
    createdAt: '2026-10-26T12:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
    messages: [{
      id: 'message-1',
      role: 'user',
      content: 'Build a landing page',
      timestamp: '2026-10-26T12:00:00.000Z',
    }],
  };
  let storedConversations: unknown;
  let storedActiveId: string | null;
  let savedRow: Record<string, unknown> | undefined;
  let selectedOwner: string | undefined;
  let user: { id: string } | null;
  let queryError: Error | null;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-placeholder';
    storedConversations = [conversation];
    storedActiveId = conversation.id;
    savedRow = undefined;
    selectedOwner = undefined;
    user = { id: 'verified-user-id' };
    queryError = null;

    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_column: string, value: string) => {
          selectedOwner = value;
          return {
            maybeSingle: vi.fn(async () => ({
              data: queryError ? null : {
                conversations: storedConversations,
                active_conversation_id: storedActiveId,
              },
              error: queryError,
            })),
          };
        }),
      })),
      upsert: vi.fn(async (row: Record<string, unknown>) => {
        savedRow = row;
        return { error: queryError };
      }),
    }));
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user },
          error: null,
        })),
      },
      from,
    });
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it('loads conversations through a session-authenticated owner-filtered query', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      conversations: [conversation],
      activeConversationId: conversation.id,
    });
    expect(selectedOwner).toBe('verified-user-id');
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(2);
  });

  it('stores only schema-valid conversations under the verified session user', async () => {
    const request = new NextRequest('http://localhost:3002/api/chat/history', {
      method: 'PUT',
      body: JSON.stringify({
        conversations: [conversation],
        activeConversationId: conversation.id,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    expect(savedRow).toEqual({
      owner_id: 'verified-user-id',
      conversations: [conversation],
      active_conversation_id: conversation.id,
      updated_at: expect.any(String),
    });
  });

  it('rejects invalid active IDs and requests without a verified session', async () => {
    const invalidRequest = new NextRequest('http://localhost:3002/api/chat/history', {
      method: 'PUT',
      body: JSON.stringify({
        conversations: [conversation],
        activeConversationId: 'other-conversation',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect((await PUT(invalidRequest)).status).toBe(400);

    user = null;
    const denied = await GET();
    expect(denied.status).toBe(401);
  });

  it('does not treat database failures as an empty history', async () => {
    queryError = Object.assign(new Error('database unavailable'), { code: '42703' });
    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'CHAT_HISTORY_READ_FAILED',
      message: expect.stringContaining('42703'),
    });
  });
});

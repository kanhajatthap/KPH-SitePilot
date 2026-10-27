import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('../src/lib/auth/api', () => ({
  authenticateApiRequest: mocks.authenticate,
}));

vi.mock('../src/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ from: mocks.from }),
}));

import { GET, PUT } from '../src/app/api/chat/history/route';

describe('chat history API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({
      ok: true,
      context: { mode: 'saas', user: { id: 'user-a', email: 'a@example.test' } },
    });
    mocks.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      upsert: mocks.upsert,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { conversations: [], active_conversation_id: null },
      error: null,
    });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it('loads history for the authenticated account', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversations: [],
      activeConversationId: null,
    });
    expect(mocks.from).toHaveBeenCalledWith('dashboard_chat_history');
  });

  it('validates input and saves only to the authenticated owner', async () => {
    const conversation = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Saved task',
      createdAt: '2026-10-26T12:00:00.000Z',
      updatedAt: '2026-10-26T12:00:00.000Z',
      messages: [],
    };
    const request = new NextRequest('http://localhost/api/chat/history', {
      method: 'PUT',
      body: JSON.stringify({
        conversations: [conversation],
        activeConversationId: conversation.id,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: 'user-a',
        conversations: [conversation],
        active_conversation_id: conversation.id,
      }),
      { onConflict: 'owner_id' }
    );
  });

  it('rejects invalid archives without writing them', async () => {
    const request = new NextRequest('http://localhost/api/chat/history', {
      method: 'PUT',
      body: JSON.stringify({ conversations: [], activeConversationId: '550e8400-e29b-41d4-a716-446655440000' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request);

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

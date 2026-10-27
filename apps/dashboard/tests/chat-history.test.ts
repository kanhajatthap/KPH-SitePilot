import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_HISTORY_STORAGE_KEY,
  LEGACY_CHAT_HISTORY_STORAGE_KEY,
  readLocalChatHistory,
  saveLocalChatHistory,
  toPersistedChatHistory,
} from '../src/lib/chat-history';

function createStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  };
}

describe('chat history persistence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('migrates the previous single-thread local-storage format', () => {
    const storage = createStorage();
    storage.setItem(LEGACY_CHAT_HISTORY_STORAGE_KEY, JSON.stringify({
      messages: [{
        id: 'legacy-message',
        role: 'user',
        content: 'Make a page',
        timestamp: '2026-10-26T12:00:00.000Z',
      }, {
        id: 'legacy-assistant',
        role: 'assistant',
        content: 'I staged a proposal',
        timestamp: '2026-10-26T12:01:00.000Z',
        proposal: { planId: 'old-actionable-proposal' },
      }, {
        id: 'legacy-system',
        role: 'system',
        content: 'internal only',
        timestamp: '2026-10-26T12:00:00.000Z',
      }],
    }));
    vi.stubGlobal('window', { localStorage: storage });

    const history = readLocalChatHistory();
    expect(history.conversations).toHaveLength(1);
    expect(history.conversations[0].title).toBe('Make a page');
    expect(history.conversations[0].messages).toHaveLength(2);
    expect(history.conversations[0].messages[1]).not.toHaveProperty('proposal');
    expect(history.activeConversationId).toBe(history.conversations[0].id);
  });

  it('does not restore interactive proposal data into persisted messages', () => {
    const persisted = toPersistedChatHistory([
      {
        id: 'proposal-message',
        role: 'assistant',
        content: 'Review this proposal',
        timestamp: '2026-10-26T12:00:00.000Z',
        proposal: {
          planId: 'plan',
          integrityHash: 'hash',
          targetSite: 'http://plugin-test.local',
          post: { title: 'Post', content: 'Content', status: 'draft' },
          summary: 'Proposal',
          createdAt: '2026-10-26T12:00:00.000Z',
        },
      },
      {
        id: 'system-message',
        role: 'system',
        content: 'internal',
        timestamp: '2026-10-26T12:00:00.000Z',
      },
    ]);

    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toHaveProperty('proposal');
    expect(persisted[0].content).toBe('Review this proposal');
  });

  it('writes and reads a validated conversation archive', () => {
    const storage = createStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const conversation = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Saved task',
      createdAt: '2026-10-26T12:00:00.000Z',
      updatedAt: '2026-10-26T12:00:00.000Z',
      messages: [],
    };

    saveLocalChatHistory({
      conversations: [conversation],
      activeConversationId: conversation.id,
    });

    expect(storage.getItem(CHAT_HISTORY_STORAGE_KEY)).not.toBeNull();
    expect(readLocalChatHistory().conversations[0].title).toBe('Saved task');
  });
});

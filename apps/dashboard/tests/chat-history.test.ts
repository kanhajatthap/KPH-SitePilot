import { describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '../src/lib/types';
import {
  CHAT_HISTORY_STORAGE_KEY,
  LEGACY_CHAT_HISTORY_STORAGE_KEY,
  createChatConversation,
  fromPersistedChatHistory,
  readLocalChatHistory,
  saveLocalChatHistory,
  shouldUseRemoteChatHistory,
  toPersistedChatHistory,
} from '../src/lib/chat-history';

describe('chat history serialization', () => {
  it('allows local history mode when SaaS Supabase is configured', () => {
    expect(shouldUseRemoteChatHistory(
      'local',
      'https://configured-project.supabase.co',
      'configured-public-anon-key'
    )).toBe(false);
    expect(shouldUseRemoteChatHistory(
      undefined,
      'https://configured-project.supabase.co',
      'configured-public-anon-key'
    )).toBe(true);
    expect(shouldUseRemoteChatHistory(undefined, undefined, undefined)).toBe(false);
  });

  it('persists plain conversation text without rehydrating approval actions', () => {
    const message: ChatMessage = {
      id: 'msg_user_1',
      role: 'assistant',
      content: 'A staged proposal.',
      timestamp: '2026-10-26T12:00:00.000Z',
      status: 'success',
      targetSite: 'http://test.local',
      builderProposal: {
        status: 'proposed',
        planId: 'plan-1',
        integrityHash: 'hash',
        targetSite: 'http://test.local',
        builderType: 'gutenberg',
        title: 'Change',
        diff: { before: null, after: 'content' },
        renderedPreviewHtml: '<main>preview</main>',
        unsupportedFeatures: [],
        summary: 'Staged',
        createdAt: '2026-10-26T12:00:00.000Z',
      },
    };

    const serialized = toPersistedChatHistory([message]);
    expect(serialized).toEqual([{
      id: 'msg_user_1',
      role: 'assistant',
      content: 'A staged proposal.',
      timestamp: '2026-10-26T12:00:00.000Z',
      status: 'success',
      targetSite: 'http://test.local',
    }]);
    expect(fromPersistedChatHistory(serialized)[0]).not.toHaveProperty('builderProposal');
  });

  it('bounds saved history and individual message size', () => {
    const messages = Array.from({ length: 105 }, (_, index): ChatMessage => ({
      id: `message-${index}`,
      role: 'user',
      content: 'x'.repeat(11000),
      timestamp: '2026-10-26T12:00:00.000Z',
    }));
    const serialized = toPersistedChatHistory(messages);
    expect(serialized).toHaveLength(100);
    expect(serialized[0].id).toBe('message-5');
    expect(serialized[0].content).toHaveLength(10000);
  });

  it('round-trips local browser history and surfaces corrupted storage', () => {
    const storedValues = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
      },
    });

    try {
      const conversation = createChatConversation([{
        id: 'local-1',
        role: 'user',
        content: 'Remember this conversation.',
        timestamp: '2026-10-26T12:00:00.000Z',
      }]);
      const history = {
        conversations: [conversation],
        activeConversationId: conversation.id,
      };
      saveLocalChatHistory(history);
      expect(readLocalChatHistory()).toEqual(history);

      storedValues.set(CHAT_HISTORY_STORAGE_KEY, '{invalid JSON');
      expect(() => readLocalChatHistory()).toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('migrates the previous single-thread local history without losing messages', () => {
    const storedValues = new Map<string, string>([[
      LEGACY_CHAT_HISTORY_STORAGE_KEY,
      JSON.stringify({
        messages: [{
          id: 'old-1',
          role: 'user',
          content: 'Old task',
          timestamp: '2026-10-26T12:00:00.000Z',
        }],
      }),
    ]]);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
      },
    });

    try {
      const history = readLocalChatHistory();
      expect(history.conversations).toHaveLength(1);
      expect(history.conversations[0].messages[0].content).toBe('Old task');
      expect(history.activeConversationId).toBe(history.conversations[0].id);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

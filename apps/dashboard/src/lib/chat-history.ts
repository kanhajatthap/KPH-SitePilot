import {
  ChatHistory,
  ChatHistorySchema,
  PersistedChatConversation,
  PersistedChatMessage,
  PersistedChatMessageSchema,
} from '@wp-agent/contracts';
import { ChatMessage } from './types';

export const CHAT_HISTORY_STORAGE_KEY = 'sitepilot.chat-conversations.v1';
export const LEGACY_CHAT_HISTORY_STORAGE_KEY = 'sitepilot.chat-history.v1';
export const CHAT_CONVERSATION_LIMIT = 50;
const MESSAGE_CONTENT_LIMIT = 10000;

export function shouldUseRemoteChatHistory(
  mode: string | undefined,
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined
): boolean {
  if (mode?.trim().toLowerCase() === 'local') return false;
  return Boolean(supabaseUrl || supabaseAnonKey);
}

export function toPersistedChatHistory(messages: ChatMessage[]): PersistedChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return [];
    return [{
      id: message.id,
      role: message.role,
      content: message.content.slice(0, MESSAGE_CONTENT_LIMIT),
      timestamp: message.timestamp,
      ...(message.status ? { status: message.status } : {}),
      ...(message.targetSite ? { targetSite: message.targetSite } : {}),
    }];
  }).slice(-100);
}

export function fromPersistedChatHistory(messages: PersistedChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({ ...message }));
}

export function createChatConversation(messages: ChatMessage[]): PersistedChatConversation {
  const now = new Date().toISOString();
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content.trim();
  const title = firstUserMessage
    ? firstUserMessage.slice(0, 97) + (firstUserMessage.length > 100 ? '…' : '')
    : 'New conversation';

  return {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: toPersistedChatHistory(messages),
  };
}

export function readLocalChatHistory(): ChatHistory {
  const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
  if (raw !== null) {
    const parsed = ChatHistorySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error('Saved local chat history is invalid and was not overwritten.');
    }
    return parsed.data;
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_CHAT_HISTORY_STORAGE_KEY);
  if (legacyRaw === null) return { conversations: [], activeConversationId: null };

  const legacy: unknown = JSON.parse(legacyRaw);
  if (
    typeof legacy !== 'object' ||
    legacy === null ||
    !('messages' in legacy) ||
    !Array.isArray(legacy.messages) ||
    legacy.messages.length > 100
  ) {
    throw new Error('Saved local chat history is invalid and was not overwritten.');
  }
  const legacyMessages = legacy.messages.map((message: unknown) =>
    PersistedChatMessageSchema.parse(message)
  );
  if (legacyMessages.length === 0) {
    return { conversations: [], activeConversationId: null };
  }

  const messages = legacyMessages.map((message) => ({
    ...message,
    timestamp: new Date(message.timestamp).toISOString(),
  }));
  const conversation = createChatConversation(fromPersistedChatHistory(messages));
  return {
    conversations: [conversation],
    activeConversationId: conversation.id,
  };
}

export function saveLocalChatHistory(history: ChatHistory): void {
  const validated = ChatHistorySchema.parse({
    conversations: history.conversations.slice(-CHAT_CONVERSATION_LIMIT),
    activeConversationId: history.activeConversationId,
  });
  window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(validated));
}

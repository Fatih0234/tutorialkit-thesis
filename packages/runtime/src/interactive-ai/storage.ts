import type { AiConversation, AiConversationStorage, AiStoredMessage } from './types.js';
export class InMemoryAiConversationStorage implements AiConversationStorage {
  conversations = new Map<string, AiConversation>();
  messages = new Map<string, AiStoredMessage[]>();
  async loadActiveConversation(input: Parameters<AiConversationStorage['loadActiveConversation']>[0]) {
    return (
      [...this.conversations.values()].find(
        (c) =>
          c.userId === input.userId &&
          c.lessonId === input.lessonId &&
          c.recordingId === input.recordingId &&
          c.recordingVersion === input.recordingVersion,
      ) ?? null
    );
  }
  async saveConversation(c: AiConversation) {
    this.conversations.set(c.id, c);
  }
  async saveMessage(m: AiStoredMessage) {
    this.messages.set(m.conversationId, [...(this.messages.get(m.conversationId) ?? []), m].slice(-24));
  }
  async loadMessages(id: string) {
    return this.messages.get(id) ?? [];
  }
  async clearConversation(id: string) {
    this.conversations.delete(id);
    this.messages.delete(id);
  }
}
export function createAiConversation(input: Omit<AiConversation, 'id' | 'createdAt' | 'updatedAt'>): AiConversation {
  const now = new Date().toISOString();
  return { ...input, id: `ai-${globalThis.crypto.randomUUID()}`, createdAt: now, updatedAt: now };
}

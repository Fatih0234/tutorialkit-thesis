import type { AiConversation, AiConversationStorage, AiStoredMessage } from './types.js';

const DB_NAME = 'interactive-ai';
const VERSION = 1;
export class IndexedDbAiConversationStorage implements AiConversationStorage {
  private _open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('conversations')) {
          db.createObjectStore('conversations', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('messages')) {
          const store = db.createObjectStore('messages', { keyPath: 'id' });
          store.createIndex('conversationId', 'conversationId');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  private async _run<T>(
    store: string,
    mode: IDBTransactionMode,
    action: (objectStore: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
  ): Promise<T> {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let settled = false;
      const finish = (value: T) => {
        settled = true;
        resolve(value);
      };
      action(tx.objectStore(store), finish, reject);

      tx.oncomplete = () => {
        db.close();

        if (!settled) {
          resolve(undefined as T);
        }
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  async loadActiveConversation(input: Parameters<AiConversationStorage['loadActiveConversation']>[0]) {
    const all = await this._run<AiConversation[]>('conversations', 'readonly', (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return (
      all.find(
        (item) =>
          item.userId === input.userId &&
          item.lessonId === input.lessonId &&
          item.recordingId === input.recordingId &&
          item.recordingVersion === input.recordingVersion,
      ) ?? null
    );
  }
  async saveConversation(value: AiConversation) {
    await this._run<void>('conversations', 'readwrite', (store) => {
      store.put(value);
    });
  }
  async saveMessage(value: AiStoredMessage) {
    await this._run<void>('messages', 'readwrite', (store) => {
      store.put(value);
    });
  }
  async loadMessages(conversationId: string) {
    return this._run<AiStoredMessage[]>('messages', 'readonly', (store, resolve, reject) => {
      const request = store.index('conversationId').getAll(conversationId);
      request.onsuccess = () => resolve(request.result.slice(-24));
      request.onerror = () => reject(request.error);
    });
  }
  async clearConversation(conversationId: string) {
    const messages = await this.loadMessages(conversationId);
    await this._run<void>('messages', 'readwrite', (store) => {
      messages.forEach((message) => store.delete(message.id));
    });
    await this._run<void>('conversations', 'readwrite', (store) => {
      store.delete(conversationId);
    });
  }
}

export type AiTutorIntent =
  | 'free-question'
  | 'explain'
  | 'hint'
  | 'review-attempt'
  | 'debug'
  | 'explain-teacher-change';
export type AiHelperWindowMode = 'hidden' | 'minimized' | 'focused';
export interface LearnerAiWindowState {
  mode: AiHelperWindowMode;
  conversationId: string | null;
  hasUnreadResponse: boolean;
}
export type AiLearnerMode = 'following-teacher' | 'experimenting';
export interface AiTutorSelection {
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
}
export interface AiTutorContextRequest {
  schemaVersion: 1;
  lesson: { id: string; title: string | null; explanationText: string | null; objectives: string[] };
  lecture: { recordingId: string; recordingVersion: number; timestampMs: number };
  learner: { mode: AiLearnerMode; selectedFilePath: string | null };
  selection: AiTutorSelection | null;
  workspaceFiles: Record<string, string>;
  terminalExcerpt: string | null;
  contextPreferences: {
    includeCurrentFile: boolean;
    includeSelection: boolean;
    includeRecentTeacherChanges: boolean;
    includeTerminal: boolean;
    includeAdditionalChangedFiles: boolean;
  };
}
export type AiTutorAction =
  | { type: 'open-file'; filePath: string; line: number | null }
  | { type: 'highlight-code'; filePath: string; startLine: number; endLine: number }
  | { type: 'seek-lecture'; timestampMs: number; reason: string }
  | { type: 'show-workspace-diff'; filePath: string | null };
export interface AiTutorContextSummary {
  lessonTitle: string | null;
  selectedFilePath: string | null;
  timestampMs: number;
  learnerMode: AiLearnerMode;
  omitted: string[];
}
export interface AiStoredMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  intent?: AiTutorIntent;
  createdAt: string;
  contextSummary?: Partial<AiTutorContextSummary>;
  hintLevel?: 1 | 2 | 3 | 4 | null;
}
export interface AiConversation {
  id: string;
  userId: string;
  lessonId: string;
  recordingId: string;
  recordingVersion: number;
  createdAt: string;
  updatedAt: string;
}
export interface AiConversationStorage {
  loadActiveConversation(input: {
    userId: string;
    lessonId: string;
    recordingId: string;
    recordingVersion: number;
  }): Promise<AiConversation | null>;
  saveConversation(conversation: AiConversation): Promise<void>;
  saveMessage(message: AiStoredMessage): Promise<void>;
  loadMessages?(conversationId: string): Promise<AiStoredMessage[]>;
  clearConversation(conversationId: string): Promise<void>;
}

import { useChat } from '@ai-sdk/react';
import type {
  AiLearnerMode,
  AiTutorContextRequest,
  AiTutorIntent,
  AiTutorSelection,
  LearnerAiWindowState,
} from '@tutorialkit/runtime';
import { DefaultChatTransport } from 'ai';
import { useMemo, useRef, useState } from 'react';

export function useAiTutor(context: AiTutorContextRequest | null, conversationId: string | null) {
  const intent = useRef<AiTutorIntent>('free-question');
  const [attachedSelection, setAttachedSelection] = useState<AiTutorSelection | null>(null);
  const effectiveContext = context ? { ...context, selection: attachedSelection } : null;
  const requestContextRef = useRef(effectiveContext);

  const [windowState, setWindowState] = useState<LearnerAiWindowState>({
    mode: 'hidden',
    conversationId,
    hasUnreadResponse: false,
  });
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/interactive/ai/chat',
        credentials: 'include',
        body: () => ({
          schemaVersion: 1,
          conversationId: conversationId ?? 'local-ai-conversation',
          intent: intent.current,
          hintLevel: null,
          context: requestContextRef.current,
        }),
      }),
    [conversationId],
  );
  const chat = useChat({ id: conversationId ?? 'local-ai-conversation', transport });

  return {
    windowState,
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    attachedSelection,
    attachSelection: (selection: AiTutorSelection) => {
      setAttachedSelection(selection);
      setWindowState((state) => ({ ...state, mode: 'minimized' }));
    },
    removeSelection: () => setAttachedSelection(null),
    open: () => setWindowState((s) => ({ ...s, mode: 'minimized' })),
    minimize: () => setWindowState((s) => ({ ...s, mode: 'minimized' })),
    focus: () => setWindowState((s) => ({ ...s, mode: 'focused' })),
    close: () => setWindowState((s) => ({ ...s, mode: 'hidden' })),
    sendMessage: async (input: { text: string; intent: AiTutorIntent }) => {
      intent.current = input.intent;
      requestContextRef.current = effectiveContext;
      await chat.sendMessage(
        { text: input.text },
        {
          body: {
            schemaVersion: 1,
            conversationId: conversationId ?? 'local-ai-conversation',
            intent: input.intent,
            hintLevel: null,
            context: effectiveContext,
          },
        },
      );
      setAttachedSelection(null);
    },
    stop: chat.stop,
    regenerate: chat.regenerate,
    context: effectiveContext,
  };
}

export function makeAiContext(input: {
  lessonId: string;
  title: string | null;
  recordingId: string;
  version: number;
  timestampMs: number;
  mode: AiLearnerMode;
  selectedFilePath: string | null;
  workspaceFiles: Record<string, string>;
}): AiTutorContextRequest {
  return {
    schemaVersion: 1,
    lesson: { id: input.lessonId, title: input.title, explanationText: null, objectives: [] },
    lecture: { recordingId: input.recordingId, recordingVersion: input.version, timestampMs: input.timestampMs },
    learner: { mode: input.mode, selectedFilePath: input.selectedFilePath },
    selection: null,
    workspaceFiles: input.workspaceFiles,
    terminalExcerpt: null,
    contextPreferences: {
      includeCurrentFile: true,
      includeSelection: true,
      includeRecentTeacherChanges: true,
      includeTerminal: false,
      includeAdditionalChangedFiles: true,
    },
  };
}

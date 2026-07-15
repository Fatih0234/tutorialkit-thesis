import type { AiTutorIntent, AiTutorSelection } from '@tutorialkit/runtime';
import { useState } from 'react';
import { InteractiveButton } from '../../InteractivePocUi.js';

export function AiHelperWindow({ tutor, editorSelection }: { tutor: any; editorSelection: AiTutorSelection | null }) {
  const [input, setInput] = useState('');
  const quick: Array<[string, AiTutorIntent, string]> = [
    ['Explain the current code', 'explain', 'Explain the current code briefly.'],
    ['Give me a hint', 'hint', 'Give me the first useful hint only.'],
    ['Review my attempt', 'review-attempt', 'Review my attempt against the lesson objective.'],
    ['Help with an error', 'debug', 'Help me debug the current error.'],
  ];

  if (tutor.windowState.mode === 'hidden') {
    return (
      <div className="ml-auto flex items-center gap-1">
        {editorSelection ? (
          <InteractiveButton
            aria-label={`Ask AI about selected code in ${editorSelection.filePath}, lines ${editorSelection.startLine} to ${editorSelection.endLine}`}
            icon="i-ph-selection"
            onClick={() => tutor.attachSelection(editorSelection)}
          >
            Ask AI about selection
          </InteractiveButton>
        ) : null}
        <InteractiveButton aria-label="AI Helper" icon="i-ph-sparkle" onClick={() => tutor.open()}>
          ✦ AI Helper
        </InteractiveButton>
      </div>
    );
  }

  return (
    <aside
      aria-label="AI Learning Assistant"
      className={`pointer-events-auto absolute bottom-20 left-4 z-[80] flex ${tutor.windowState.mode === 'focused' ? 'inset-8' : 'h-[min(42rem,72vh)] w-[min(27rem,90vw)]'} flex-col overflow-hidden rounded-lg border border-tk-elements-app-borderColor bg-tk-background-primary shadow-2xl`}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-tk-elements-app-borderColor px-3">
        <span className="i-ph-sparkle text-tk-text-secondary" />
        <strong className="flex-1 text-sm">AI Learning Assistant</strong>
        {editorSelection ? (
          <InteractiveButton
            variant="ghost"
            icon="i-ph-selection"
            onClick={() => tutor.attachSelection(editorSelection)}
          >
            Use selection
          </InteractiveButton>
        ) : null}
        <InteractiveButton variant="ghost" onClick={tutor.focus}>
          Focus
        </InteractiveButton>
        <InteractiveButton variant="ghost" onClick={tutor.minimize}>
          —
        </InteractiveButton>
        <InteractiveButton variant="ghost" aria-label="Close AI Helper" onClick={tutor.close}>
          ×
        </InteractiveButton>
      </header>
      <div className="border-b border-tk-elements-app-borderColor px-3 py-2 text-xs text-tk-text-secondary">
        <p className="m-0">I can help with the current lesson and your experiment.</p>
        <p className="m-0">I will not modify your files.</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded bg-tk-background-secondary px-2 py-1">
            {tutor.context?.learner.selectedFilePath ?? 'No file selected'}
          </span>
          <span className="rounded bg-tk-background-secondary px-2 py-1">
            Lecture {Math.floor((tutor.context?.lecture.timestampMs ?? 0) / 60000)}:
            {String(Math.floor(((tutor.context?.lecture.timestampMs ?? 0) % 60000) / 1000)).padStart(2, '0')}
          </span>
          <span className="rounded bg-tk-background-secondary px-2 py-1">
            {tutor.context?.learner.mode === 'experimenting' ? 'Experiment mode' : 'Following teacher'}
          </span>
        </div>
      </div>
      {tutor.attachedSelection ? (
        <div className="flex items-center gap-2 border-b border-tk-elements-app-borderColor bg-blue-950/15 px-3 py-2 text-xs">
          <span className="i-ph-paperclip" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {tutor.attachedSelection.filePath} · {formatSelectionLines(tutor.attachedSelection)}
          </span>
          <InteractiveButton
            variant="ghost"
            aria-label="Remove selected code attachment"
            onClick={tutor.removeSelection}
            className="px-2"
          >
            Remove
          </InteractiveButton>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {tutor.messages.length === 0 ? (
          <div className="grid gap-2">
            {quick.map(([label, intent, text]) => (
              <InteractiveButton
                key={intent}
                variant="ghost"
                className="justify-start"
                onClick={() => void tutor.sendMessage({ text, intent })}
              >
                {label}
              </InteractiveButton>
            ))}
            <p className="m-0 pt-2 text-[11px] text-tk-text-secondary">
              AI can make mistakes. Check important answers against the lesson.
            </p>
          </div>
        ) : null}
        {tutor.messages.map((message: any) => (
          <div
            key={message.id}
            className={`rounded-md p-2 text-sm ${message.role === 'assistant' ? 'bg-tk-background-secondary' : 'bg-blue-950/20'}`}
          >
            <strong className="block text-[10px] uppercase text-tk-text-secondary">
              {message.role === 'assistant' ? 'Assistant' : 'You'}
            </strong>
            {message.parts?.map((part: any, index: number) =>
              part.type === 'text' ? (
                <p key={index} className="m-0 whitespace-pre-wrap">
                  {part.text}
                </p>
              ) : null,
            )}
          </div>
        ))}
        {tutor.status === 'submitted' || tutor.status === 'streaming' ? (
          <InteractiveButton variant="ghost" onClick={tutor.stop}>
            Stop
          </InteractiveButton>
        ) : null}
        {tutor.error ? (
          <div role="alert" className="text-sm text-red-600">
            The assistant could not connect.
            <br />
            Your lesson and workspace were not changed.
            <br />
            <InteractiveButton variant="ghost" onClick={tutor.regenerate}>
              Try again
            </InteractiveButton>
          </div>
        ) : null}
      </div>
      <form
        className="flex gap-2 border-t border-tk-elements-app-borderColor p-2"
        onSubmit={(event) => {
          event.preventDefault();

          if (!input.trim()) {
            return;
          }

          const text = input.trim();
          setInput('');
          void tutor.sendMessage({ text, intent: 'free-question' });
        }}
      >
        <textarea
          aria-label="Ask the AI Learning Assistant"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask about the lesson…"
          rows={2}
          className="min-w-0 flex-1 resize-none rounded border border-tk-elements-app-borderColor bg-transparent p-2 text-sm"
        />
        <InteractiveButton type="submit" variant="primary" disabled={!input.trim()}>
          Send
        </InteractiveButton>
      </form>
    </aside>
  );
}

function formatSelectionLines(selection: AiTutorSelection) {
  return selection.startLine === selection.endLine
    ? `line ${selection.startLine}`
    : `lines ${selection.startLine}–${selection.endLine}`;
}

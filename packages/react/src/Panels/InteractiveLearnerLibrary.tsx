import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
import { InteractiveButton, InteractiveCard, InteractiveStatusBadge } from './InteractivePocUi.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

interface InteractiveLearnerLibraryProps extends InteractivePocControlsModel {
  onOpenLesson: (recordingId: string) => void;
  onContinueLoadedLesson: () => void;
}

export function InteractiveLearnerLibrary(props: InteractiveLearnerLibraryProps) {
  const recordingId = props.selectedPublishedRecordingId;

  return (
    <section aria-labelledby="interactive-learner-library-heading" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="interactive-learner-library-heading" className="m-0 text-xl font-700 text-tk-text-primary">
            Interactive Lessons
          </h2>
          <p className="mb-0 mt-1 text-sm text-tk-text-secondary">
            Choose a lecture, then enter a focused editor player without authoring or storage controls.
          </p>
        </div>
        <InteractiveStatusBadge tone={props.canUseLearnerWork ? 'positive' : 'warning'} icon="i-ph-user-circle">
          {props.currentUser ? `${props.currentUser.displayName} · ${props.currentUser.role}` : 'Learner sign-in required'}
        </InteractiveStatusBadge>
      </div>

      <InteractiveCard className="grid gap-4 p-4">
        <InteractiveRecordingLibrary
          title="Available lessons"
          description="Published interactive lectures available to this learner."
          emptyText="No lessons are published yet. Ask a teacher to publish one or seed the demo."
          selectLabel="Select published lesson"
          recordings={props.publishedRecordings}
          selectedRecordingId={recordingId}
          onSelectRecording={props.onSelectPublishedRecording}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tk-border-primary pt-3">
          <p className="m-0 text-xs text-tk-text-secondary">
            The lesson opens as a full-screen editor timeline. Management and technical details stay in this library.
          </p>
          <div className="flex gap-2">
            {props.canPlayRecording ? (
              <InteractiveButton icon="i-ph-arrow-right" onClick={props.onContinueLoadedLesson} className="min-h-10 px-4">
                Continue Loaded Lesson
              </InteractiveButton>
            ) : null}
            <InteractiveButton
              variant="primary"
              icon="i-ph-play-fill"
              onClick={() => props.onOpenLesson(recordingId)}
              disabled={!props.canLoadPublishedRecording || !recordingId}
              className="min-h-10 px-5"
            >
              Start Lesson
            </InteractiveButton>
          </div>
        </div>
      </InteractiveCard>
    </section>
  );
}

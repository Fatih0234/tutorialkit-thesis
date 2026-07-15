import { InteractiveCard, InteractiveStatusBadge } from './InteractivePocUi.js';
import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

interface InteractiveLearnerLibraryProps extends InteractivePocControlsModel {
  onOpenLesson: (recordingId: string) => void;
}

export function InteractiveLearnerLibrary(props: InteractiveLearnerLibraryProps) {
  return (
    <section aria-labelledby="interactive-learner-library-heading" className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="interactive-learner-library-heading" className="m-0 text-xl font-700 text-tk-text-primary">Interactive Lessons</h2>
          <p className="mb-0 mt-1 text-sm text-tk-text-secondary">Choose a lesson and learn directly in the interactive workspace.</p>
        </div>
        <InteractiveStatusBadge tone={props.canUseLearnerWork ? 'positive' : 'warning'} icon="i-ph-user-circle">
          {props.currentUser ? props.currentUser.displayName : 'Sign in to save your work'}
        </InteractiveStatusBadge>
      </header>

      <InteractiveCard className="p-4">
        <InteractiveRecordingLibrary
          title="Available Lessons"
          description="Published interactive lectures ready to explore."
          emptyText="No lessons are available yet."
          recordings={props.publishedRecordings}
          actionLabel="Start Lesson"
          actionIcon="i-ph-play-fill"
          onOpenRecording={props.onOpenLesson}
        />
      </InteractiveCard>
    </section>
  );
}

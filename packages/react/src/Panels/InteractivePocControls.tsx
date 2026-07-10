import { useEffect, useRef } from 'react';
import { classNames } from '../utils/classnames.js';
import { InteractiveDevIdentityPanel } from './InteractiveDevIdentityPanel.js';
import { InteractiveLearnerPlayback } from './InteractiveLearnerPlayback.js';
import { InteractiveMaterialPreparation } from './InteractiveMaterialPreparation.js';
import { InteractiveRecordingStudio } from './InteractiveRecordingStudio.js';
import {
  InteractiveTeacherDashboard,
  type InteractiveRecordingMode,
} from './InteractiveTeacherDashboard.js';
import {
  interactiveDetailsClassName,
  interactiveSummaryClassName,
} from './InteractivePocUi.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export type InteractiveProductTab = 'teacher' | 'learner';
export type InteractiveTeacherStage = 'setup' | 'materials' | 'recording' | 'review';

export interface InteractivePocControlsProps extends InteractivePocControlsModel {
  activeTab: InteractiveProductTab;
  teacherStage: InteractiveTeacherStage;
  lessonId: string;
  filePaths: string[];
  initialFile: string;
  selectedFile: string;
  recordingMode: InteractiveRecordingMode;
  isStartingRecording: boolean;
  onActiveTabChange: (tab: InteractiveProductTab) => void;
  onInitialFileChange: (filePath: string) => void;
  onRecordingModeChange: (mode: InteractiveRecordingMode) => void;
  onPrepareMaterials: () => void;
  onFinishPreparingMaterials: () => void;
  onStartConfiguredRecording: () => void;
  onStopConfiguredRecording: () => void;
  onReturnToSetup: () => void;
  onPreviewCurrentDraft: () => void;
  onPreviewSelectedDraft: (recordingId: string) => void;
  onPreviewSelectedPublished: (recordingId: string) => void;
}

function DemoGuidePanel() {
  return (
    <details className={interactiveDetailsClassName}>
      <summary className={interactiveSummaryClassName}>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="i-ph-map-trifold-duotone text-base text-tk-text-accent" />
          Thesis demo walkthrough
        </span>
        <span aria-hidden="true" className="i-ph-caret-down-bold transition-transform group-open:rotate-180" />
      </summary>
      <section aria-labelledby="interactive-demo-guide-heading" className="mt-3 border-t border-tk-border-primary pt-3">
        <h2 id="interactive-demo-guide-heading" className="sr-only">
          Thesis demo walkthrough
        </h2>
        <div className="grid gap-4 text-xs md:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-600 text-tk-text-primary">
              <span aria-hidden="true" className="i-ph-record-duotone text-red-400" />
              Teacher Studio
            </h3>
            <ol className="m-0 grid list-decimal gap-1 pl-5 text-tk-text-secondary">
              <li>Sign in as Teacher Demo</li>
              <li>Seed a lesson or create a recording</li>
              <li>Preview and publish the recording</li>
              <li>Export a package if needed</li>
            </ol>
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-600 text-tk-text-primary">
              <span aria-hidden="true" className="i-ph-student-duotone text-blue-300" />
              Learner Lesson
            </h3>
            <ol className="m-0 grid list-decimal gap-1 pl-5 text-tk-text-secondary">
              <li>Sign in as Learner Demo</li>
              <li>Open and play a published lesson</li>
              <li>Try it yourself and save your work</li>
              <li>Resume, restore, and resolve conflicts</li>
            </ol>
          </div>
        </div>
      </section>
    </details>
  );
}

export function InteractivePocControls(props: InteractivePocControlsProps) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const { activeTab, teacherStage } = props;

  useEffect(() => {
    controlsRef.current?.scrollTo({ top: 0 });
  }, [activeTab, teacherStage]);

  if (activeTab === 'teacher' && teacherStage === 'recording') {
    return (
      <InteractiveRecordingStudio
        model={props}
        lessonId={props.lessonId}
        initialFile={props.initialFile}
        onStop={props.onStopConfiguredRecording}
      />
    );
  }

  if (activeTab === 'teacher' && teacherStage === 'materials') {
    return (
      <InteractiveMaterialPreparation
        lessonId={props.lessonId}
        fileCount={props.filePaths.length}
        selectedFile={props.selectedFile}
        onDone={props.onFinishPreparingMaterials}
      />
    );
  }

  return (
    <div
      ref={controlsRef}
      aria-label="Interactive tutorial controls"
      className={classNames(
        'min-h-[10rem] shrink-0 overflow-y-auto border-b border-tk-elements-app-borderColor bg-tk-background-primary p-3 text-sm',
        activeTab === 'teacher' && teacherStage === 'setup' ? 'max-h-none flex-1' : 'max-h-[70%]',
      )}
    >
      <div className="mx-auto grid max-w-6xl gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 flex items-center gap-2 truncate text-base font-600 text-tk-text-primary">
              <span aria-hidden="true" className="i-ph-chalkboard-teacher-duotone text-xl text-tk-text-accent" />
              Interactive Thesis Demo
            </h1>
            <p className="m-0 text-xs text-tk-text-secondary">Record a lesson or experience it as a learner.</p>
          </div>

          <nav
            aria-label="Interactive role views"
            className="inline-flex rounded-lg border border-tk-border-primary bg-tk-background-secondary p-1"
          >
            {([
              ['teacher', 'i-ph-record-duotone', 'Teacher Studio'],
              ['learner', 'i-ph-student-duotone', 'Learner Lesson'],
            ] as const).map(([tab, icon, label]) => {
              const isActive = activeTab === tab;

              return (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => props.onActiveTabChange(tab)}
                  className={classNames(
                    'inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-500 transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-border-accent',
                    isActive
                      ? 'bg-tk-elements-primaryButton-backgroundColor text-tk-elements-primaryButton-textColor shadow-sm'
                      : 'text-tk-text-secondary hover:bg-tk-background-active hover:text-tk-text-primary',
                  )}
                >
                  <span aria-hidden="true" className={classNames(icon, 'text-base')} />
                  {label}
                </button>
              );
            })}
          </nav>
        </header>

        <InteractiveDevIdentityPanel {...props} />

        {activeTab === 'teacher' ? (
          <InteractiveTeacherDashboard
            {...props}
            view={teacherStage === 'review' ? 'review' : 'setup'}
          />
        ) : (
          <InteractiveLearnerPlayback {...props} />
        )}

        <DemoGuidePanel />

        <details className={interactiveDetailsClassName}>
          <summary className={interactiveSummaryClassName}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="i-ph-bug-duotone text-base" />
              Debug details
            </span>
            <span aria-hidden="true" className="i-ph-caret-down-bold transition-transform group-open:rotate-180" />
          </summary>
          <p className="mb-0 mt-2 text-xs text-tk-text-secondary">
            Compatibility localStorage keys, generated ids, playback timestamps, and raw status values are retained for local thesis validation.
          </p>
        </details>
      </div>
    </div>
  );
}

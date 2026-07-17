import { useEffect, useRef } from 'react';
import { classNames } from '../utils/classnames.js';
import { InteractiveDevIdentityPanel } from './InteractiveDevIdentityPanel.js';
import { InteractiveLearnerLibrary } from './InteractiveLearnerLibrary.js';
import { InteractiveMaterialPreparation } from './InteractiveMaterialPreparation.js';
import { InteractiveRecordingStudio } from './InteractiveRecordingStudio.js';
import {
  InteractiveTeacherDashboard,
  type InteractiveRecordingMode,
} from './InteractiveTeacherDashboard.js';
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
  exerciseDrafts: Array<{
    exerciseId: string;
    title: string;
    complete: boolean;
    publishable: boolean;
    publicationReasons: string[];
  }>;
  exerciseAuthoringStatus: string;
  onCreatePreparedExercise: () => void;
  onOpenPreparedExercise: (exerciseId: string) => void;
  onPublishPreparedExercise: (exerciseId: string) => void;
  onOpenLearnerLesson: (recordingId: string) => void;
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
      className="min-h-0 flex-1 overflow-y-auto bg-tk-background-primary p-4 text-sm"
    >
      <div className="mx-auto grid max-w-6xl gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 flex items-center gap-2 truncate text-base font-600 text-tk-text-primary">
              <span aria-hidden="true" className="i-ph-chalkboard-teacher-duotone text-xl text-tk-text-accent" />
              Interactive Learning
            </h1>
            <p className="m-0 text-xs text-tk-text-secondary">Create interactive lectures or learn by working alongside them.</p>
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
          <InteractiveTeacherDashboard {...props} />
        ) : (
          <InteractiveLearnerLibrary {...props} onOpenLesson={props.onOpenLearnerLesson} />
        )}

      </div>
    </div>
  );
}

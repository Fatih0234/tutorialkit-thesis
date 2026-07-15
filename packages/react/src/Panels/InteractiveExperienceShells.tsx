import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '../utils/classnames.js';
import type { Theme } from '../core/types.js';
import type { InteractiveExperienceScreen } from './interactive-session.js';
import { InteractiveTeacherPointer, useTeacherPointerCapture } from './interactive/pointer/InteractiveTeacherPointer.js';
import type { EditorPointerAnchor, TeacherPointerButton, TeacherPointerChangedPayload, TeacherPointerClickedPayload } from '@tutorialkit/runtime';

interface InteractiveExperienceRootProps {
  children: ReactNode;
  screen: InteractiveExperienceScreen;
  theme: Theme;
  hydrated: boolean;
  mount: HTMLElement | null;
  captureTeacherPointer: boolean;
  teacherPointer: TeacherPointerChangedPayload;
  teacherPointerClickButton: TeacherPointerButton | null;
  teacherPointerClickSequence: number;
  showTeacherPointer: boolean;
  onTeacherPointerChange: (pointer: TeacherPointerChangedPayload) => void;
  onTeacherPointerClick: (click: TeacherPointerClickedPayload) => void;
  getEditorPointerAnchor: (clientX: number, clientY: number) => EditorPointerAnchor | null;
  resolveEditorPointerAnchor: (anchor: EditorPointerAnchor) => { clientX: number; clientY: number } | null;
}

export function InteractiveExperienceRoot({ children, screen, theme, hydrated, mount, captureTeacherPointer, teacherPointer, teacherPointerClickButton, teacherPointerClickSequence, showTeacherPointer, onTeacherPointerChange, onTeacherPointerClick, getEditorPointerAnchor, resolveEditorPointerAnchor }: InteractiveExperienceRootProps) {
  const rootRef = useRef<HTMLElement>(null);
  useTeacherPointerCapture({ enabled: captureTeacherPointer, rootRef, onPointerChange: onTeacherPointerChange, onPointerClick: onTeacherPointerClick, getEditorPointerAnchor });
  const application = (
    <main
      ref={rootRef}
      data-interactive-experience-root
      data-interactive-screen={screen}
      data-interactive-hydrated={hydrated ? 'true' : 'false'}
      className={classNames(
        'fixed inset-0 z-[1000] flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-tk-elements-panel-backgroundColor text-tk-elements-panel-textColor',
        theme,
      )}
    >
      {children}
      <InteractiveTeacherPointer pointer={teacherPointer} clickButton={teacherPointerClickButton} clickSequence={teacherPointerClickSequence} rootRef={rootRef} visible={showTeacherPointer} resolveEditorPointerAnchor={resolveEditorPointerAnchor} />
    </main>
  );

  return hydrated && mount ? createPortal(application, mount) : application;
}

export function InteractiveManagementShell({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) {
    return null;
  }

  return (
    <section data-interactive-management-shell className="flex min-h-0 flex-1 flex-col">
      {children}
    </section>
  );
}

export function InteractiveWorkspaceShell({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <section
      data-interactive-workspace-shell
      aria-hidden={!active}
      className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
    >
      {children}
    </section>
  );
}

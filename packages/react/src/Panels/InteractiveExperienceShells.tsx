import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '../utils/classnames.js';
import type { Theme } from '../core/types.js';
import type { InteractiveExperienceScreen } from './interactive-session.js';

interface InteractiveExperienceRootProps {
  children: ReactNode;
  screen: InteractiveExperienceScreen;
  theme: Theme;
  hydrated: boolean;
  mount: HTMLElement | null;
}

export function InteractiveExperienceRoot({ children, screen, theme, hydrated, mount }: InteractiveExperienceRootProps) {
  const application = (
    <main
      data-interactive-experience-root
      data-interactive-screen={screen}
      data-interactive-hydrated={hydrated ? 'true' : 'false'}
      className={classNames(
        'fixed inset-0 z-[1000] flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-tk-elements-panel-backgroundColor text-tk-elements-panel-textColor',
        theme,
      )}
    >
      {children}
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

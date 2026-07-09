import { useState } from 'react';
import { InteractiveDevIdentityPanel } from './InteractiveDevIdentityPanel.js';
import { InteractiveLearnerPlayback } from './InteractiveLearnerPlayback.js';
import { InteractiveTeacherDashboard } from './InteractiveTeacherDashboard.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

type InteractiveProductTab = 'teacher' | 'learner';

export function InteractivePocControls(props: InteractivePocControlsModel) {
  const [activeTab, setActiveTab] = useState<InteractiveProductTab>('teacher');

  return (
    <div
      aria-label="Interactive tutorial controls"
      style={{
        borderBottom: '1px solid var(--tk-elements-panel-borderColor)',
        display: 'grid',
        gap: '1rem',
        padding: '0.75rem',
      }}
    >
      <header style={{ display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ fontSize: '1rem', margin: 0 }}>Interactive lesson studio</h1>
        <nav aria-label="Interactive role views" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" aria-pressed={activeTab === 'teacher'} onClick={() => setActiveTab('teacher')}>
            Teacher
          </button>
          <button type="button" aria-pressed={activeTab === 'learner'} onClick={() => setActiveTab('learner')}>
            Learner
          </button>
        </nav>
      </header>

      <InteractiveDevIdentityPanel {...props} />

      {activeTab === 'teacher' ? <InteractiveTeacherDashboard {...props} /> : <InteractiveLearnerPlayback {...props} />}

      <details>
        <summary>Debug details</summary>
        <p style={{ margin: '0.5rem 0 0' }}>
          Raw debug controls were replaced by the Teacher dashboard and Learner playback sections for Milestone D.
        </p>
      </details>
    </div>
  );
}

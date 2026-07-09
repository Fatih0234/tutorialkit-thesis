import { useState } from 'react';
import { InteractiveDevIdentityPanel } from './InteractiveDevIdentityPanel.js';
import { InteractiveLearnerPlayback } from './InteractiveLearnerPlayback.js';
import { InteractiveTeacherDashboard } from './InteractiveTeacherDashboard.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

type InteractiveProductTab = 'teacher' | 'learner';

function DemoGuidePanel() {
  return (
    <section
      aria-labelledby="interactive-demo-guide-heading"
      style={{
        border: '1px solid var(--tk-elements-panel-borderColor)',
        borderRadius: '0.375rem',
        display: 'grid',
        gap: '0.5rem',
        padding: '0.5rem',
      }}
    >
      <h2 id="interactive-demo-guide-heading" style={{ fontSize: '0.95rem', margin: 0 }}>
        Thesis demo walkthrough
      </h2>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
        <div>
          <h3 style={{ fontSize: '0.9rem', margin: 0 }}>Teacher Studio</h3>
          <ol style={{ margin: '0.25rem 0 0', paddingInlineStart: '1.25rem' }}>
            <li>Sign in as Teacher Demo</li>
            <li>Seed demo lesson or create a recording</li>
            <li>Preview recording</li>
            <li>Publish recording</li>
            <li>Export package if desired</li>
          </ol>
        </div>
        <div>
          <h3 style={{ fontSize: '0.9rem', margin: 0 }}>Learner Lesson</h3>
          <ol style={{ margin: '0.25rem 0 0', paddingInlineStart: '1.25rem' }}>
            <li>Sign in as Learner Demo</li>
            <li>Open published lesson</li>
            <li>Play lesson</li>
            <li>Try it yourself</li>
            <li>Save my work</li>
            <li>Resume teacher</li>
            <li>Restore my work</li>
            <li>Resolve conflict if prompted</li>
          </ol>
        </div>
      </div>
    </section>
  );
}

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
        <h1 style={{ fontSize: '1rem', margin: 0 }}>Interactive Thesis Demo</h1>
        <nav aria-label="Interactive role views" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" aria-pressed={activeTab === 'teacher'} onClick={() => setActiveTab('teacher')}>
            Teacher Studio
          </button>
          <button type="button" aria-pressed={activeTab === 'learner'} onClick={() => setActiveTab('learner')}>
            Learner Lesson
          </button>
        </nav>
      </header>

      <DemoGuidePanel />
      <InteractiveDevIdentityPanel {...props} />

      {activeTab === 'teacher' ? <InteractiveTeacherDashboard {...props} /> : <InteractiveLearnerPlayback {...props} />}

      <details>
        <summary>Debug details</summary>
        <p style={{ margin: '0.5rem 0 0' }}>
          Compatibility localStorage keys, generated ids, playback timestamps, and raw status values are retained for local thesis validation.
        </p>
      </details>
    </div>
  );
}

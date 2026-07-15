import { useEffect, useState, type ComponentType } from 'react';
import type { WhiteboardScene } from '@tutorialkit/runtime';

interface Props {
  scene: WhiteboardScene;
  readOnly: boolean;
  error?: string;
  onSceneCommit: (scene: WhiteboardScene) => void;
}

export function InteractiveWhiteboard(props: Props) {
  const [Canvas, setCanvas] = useState<ComponentType<Props> | null>(null);
  useEffect(() => {
    let active = true;
    void import('./ExcalidrawCanvas.js').then((module) => { if (active) setCanvas(() => module.ExcalidrawCanvas); });
    return () => { active = false; };
  }, []);
  if (!Canvas) return <div role="status" className="grid h-full place-items-center bg-white text-sm text-slate-600">Loading whiteboard…</div>;
  return <Canvas {...props} />;
}

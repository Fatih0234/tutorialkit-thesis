import { useCallback, useEffect, useRef, useState } from 'react';
import { cloneWhiteboardScene, whiteboardSceneFingerprint, type WhiteboardScene } from '@tutorialkit/runtime';
import type { WhiteboardUpdateSource } from './excalidraw-adapter.js';

export function evaluateWhiteboardCommit(previousFingerprint: string, scene: WhiteboardScene) {
  const fingerprint = whiteboardSceneFingerprint(scene);
  return { fingerprint, changed: fingerprint !== previousFingerprint };
}

export interface InteractiveWhiteboardController {
  scene: WhiteboardScene;
  error: string;
  applyScene: (scene: WhiteboardScene, source: WhiteboardUpdateSource) => void;
  commitTeacherScene: (scene: WhiteboardScene) => void;
}

export function useInteractiveWhiteboard(initialScene: WhiteboardScene, onTeacherCommit: (scene: WhiteboardScene) => void): InteractiveWhiteboardController {
  const [scene, setScene] = useState(() => cloneWhiteboardScene(initialScene));
  const [error, setError] = useState('');
  const fingerprintRef = useRef(whiteboardSceneFingerprint(initialScene));
  const sourceRef = useRef<WhiteboardUpdateSource>('initialization');
  const onTeacherCommitRef = useRef(onTeacherCommit);

  useEffect(() => { onTeacherCommitRef.current = onTeacherCommit; }, [onTeacherCommit]);

  const applyScene = useCallback((nextScene: WhiteboardScene, source: WhiteboardUpdateSource) => {
    try {
      const cloned = cloneWhiteboardScene(nextScene);
      sourceRef.current = source;
      fingerprintRef.current = whiteboardSceneFingerprint(cloned);
      setScene(cloned);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to apply whiteboard scene.');
    }
  }, []);

  const commitTeacherScene = useCallback((nextScene: WhiteboardScene) => {
    try {
      const cloned = cloneWhiteboardScene(nextScene);
      const { fingerprint, changed } = evaluateWhiteboardCommit(fingerprintRef.current, cloned);
      if (!changed) return;
      sourceRef.current = 'teacher';
      fingerprintRef.current = fingerprint;
      setScene(cloned);
      setError('');
      onTeacherCommitRef.current(cloned);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Whiteboard scene is too large to record.');
    }
  }, []);

  return { scene, error, applyScene, commitTeacherScene };
}

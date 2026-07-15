import type { ReactNode } from 'react';
import { InteractiveButton, InteractiveStatusBadge, formatInteractiveTime } from './InteractivePocUi.js';

interface InteractiveImmersiveHeaderProps {
  title: string;
  eyebrow: string;
  status?: string;
  statusTone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'info';
  currentTimeMs?: number;
  onExit?: () => void;
  exitLabel?: string;
  actions?: ReactNode;
}

export function InteractiveImmersiveHeader({
  title,
  eyebrow,
  status,
  statusTone = 'neutral',
  currentTimeMs,
  onExit,
  exitLabel = 'Back',
  actions,
}: InteractiveImmersiveHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-tk-border-primary bg-tk-background-primary px-4 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        {onExit ? (
          <InteractiveButton variant="ghost" icon="i-ph-arrow-left" onClick={onExit}>
            {exitLabel}
          </InteractiveButton>
        ) : null}
        <div className="min-w-0">
          <p className="m-0 text-[10px] font-700 uppercase tracking-[0.14em] text-tk-text-secondary">{eyebrow}</p>
          <h1 className="m-0 truncate text-sm font-600 text-tk-text-primary">{title}</h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {currentTimeMs !== undefined ? <strong className="font-mono text-xs text-tk-text-secondary">{formatInteractiveTime(currentTimeMs)}</strong> : null}
        {status ? <InteractiveStatusBadge tone={statusTone}>{status}</InteractiveStatusBadge> : null}
        {actions}
      </div>
    </header>
  );
}

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { classNames } from '../utils/classnames.js';

export type InteractiveButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariantClasses: Record<InteractiveButtonVariant, string> = {
  primary:
    'bg-tk-elements-primaryButton-backgroundColor text-tk-elements-primaryButton-textColor hover:bg-tk-elements-primaryButton-backgroundColorHover hover:text-tk-elements-primaryButton-textColorHover',
  secondary:
    'bg-tk-elements-secondaryButton-backgroundColor text-tk-elements-secondaryButton-textColor hover:bg-tk-elements-secondaryButton-backgroundColorHover hover:text-tk-elements-secondaryButton-textColorHover border border-tk-border-brighter',
  danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-500',
  ghost: 'bg-transparent text-tk-text-secondary hover:bg-tk-background-active hover:text-tk-text-primary border border-transparent',
};

interface InteractiveButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: string;
  variant?: InteractiveButtonVariant;
}

export const InteractiveButton = forwardRef<HTMLButtonElement, InteractiveButtonProps>(function InteractiveButton({
  children,
  className,
  icon,
  type = 'button',
  variant = 'secondary',
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={classNames(
        'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-500 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-border-accent',
        'disabled:cursor-not-allowed disabled:opacity-40',
        buttonVariantClasses[variant],
        className,
      )}
      {...props}
    >
      {icon ? <span aria-hidden="true" className={classNames('shrink-0 text-base', icon)} /> : null}
      <span>{children}</span>
    </button>
  );
});

interface InteractiveCardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  as?: 'div' | 'section';
}

export function InteractiveCard({ as: Element = 'section', children, className, ...props }: InteractiveCardProps) {
  return (
    <Element
      className={classNames(
        'rounded-lg border border-tk-border-primary bg-tk-background-secondary p-3 shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </Element>
  );
}

interface InteractiveStatusBadgeProps {
  children: ReactNode;
  icon?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'info';
}

const statusToneClasses = {
  neutral: 'border-tk-border-primary bg-tk-background-primary text-tk-text-secondary',
  positive: 'border-green-600/50 bg-green-950/25 text-green-300',
  warning: 'border-amber-500/50 bg-amber-950/25 text-amber-200',
  negative: 'border-red-500/50 bg-red-950/25 text-red-200',
  info: 'border-blue-500/50 bg-blue-950/25 text-blue-200',
};

export function InteractiveStatusBadge({ children, icon, tone = 'neutral' }: InteractiveStatusBadgeProps) {
  return (
    <span
      className={classNames(
        'inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        statusToneClasses[tone],
      )}
    >
      {icon ? <span aria-hidden="true" className={classNames('shrink-0', icon)} /> : null}
      {children}
    </span>
  );
}

export function formatInteractiveTime(durationMs: number) {
  const safeDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const totalSeconds = Math.floor(safeDurationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export const interactiveDetailsClassName =
  'group rounded-lg border border-tk-border-primary bg-tk-background-secondary px-3 py-2';
export const interactiveSummaryClassName =
  'flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-500 text-tk-text-primary marker:hidden';
export const interactiveSelectClassName =
  'min-h-9 w-full rounded-md border border-tk-border-brighter bg-tk-background-primary px-2.5 py-1.5 text-sm text-tk-text-primary outline-none focus:border-tk-border-accent';

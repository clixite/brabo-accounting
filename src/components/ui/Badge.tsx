import React from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'positive' | 'warning' | 'critical' | 'info' | 'accent';

const toneClass: Record<Tone, string> = {
  neutral:
    'bg-[var(--state-neutral-bg)] text-[var(--state-neutral-text)] border-[var(--state-neutral-border)]',
  positive:
    'bg-[var(--state-positive-bg)] text-[var(--state-positive-text)] border-[var(--state-positive-border)]',
  warning:
    'bg-[var(--state-warning-bg)] text-[var(--state-warning-text)] border-[var(--state-warning-border)]',
  critical:
    'bg-[var(--state-critical-bg)] text-[var(--state-critical-text)] border-[var(--state-critical-border)]',
  info: 'bg-[var(--state-info-bg)] text-[var(--state-info-text)] border-[var(--state-info-border)]',
  accent:
    'bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent-soft-border)]',
};

const dotClass: Record<Tone, string> = {
  neutral: 'bg-[var(--text-tertiary)]',
  positive: 'bg-[var(--state-positive-solid)]',
  warning: 'bg-[var(--state-warning-solid)]',
  critical: 'bg-[var(--state-critical-solid)]',
  info: 'bg-[var(--state-info-solid)]',
  accent: 'bg-[var(--accent-solid)]',
};

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  uppercase?: boolean;
  className?: string;
}> = ({ children, tone = 'neutral', dot, uppercase, className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 border rounded-[var(--radius-sm)]',
      'px-1.5 py-0.5 text-[length:var(--text-2xs)] font-medium leading-none',
      uppercase && 'uppercase tracking-wide',
      toneClass[tone],
      className,
    )}
  >
    {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[tone])} />}
    {children}
  </span>
);

export const StatusDot: React.FC<{
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'neutral', children, className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--text-secondary)]',
      className,
    )}
  >
    <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[tone])} />
    {children}
  </span>
);

export const CodeChip: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <span
    className={cn(
      'inline-block font-mono tnum text-[length:var(--text-2xs)]',
      'bg-[var(--bg-sunken)] border border-[var(--border-subtle)]',
      'rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[var(--text-secondary)]',
      className,
    )}
  >
    {children}
  </span>
);

import React from 'react';
import { cn } from './cn';

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}> = ({ children, className, flush }) => (
  <section
    className={cn(
      'bg-[var(--bg-surface)] border border-[var(--border-subtle)]',
      'rounded-[var(--radius-lg)] overflow-hidden',
      className,
    )}
  >
    {flush ? children : <div className="p-4">{children}</div>}
  </section>
);

export const CardHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, actions, className }) => (
  <header
    className={cn(
      'flex items-start justify-between gap-4 px-4 py-3',
      'border-b border-[var(--border-subtle)]',
      className,
    )}
  >
    <div className="min-w-0">
      <div className="text-[length:var(--text-sm)] font-semibold leading-snug text-[var(--text-primary)]">
        {title}
      </div>
      {description && (
        <div className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] leading-snug">
          {description}
        </div>
      )}
    </div>
    {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
  </header>
);

export const CardBody: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => <div className={cn('p-4', className)}>{children}</div>;

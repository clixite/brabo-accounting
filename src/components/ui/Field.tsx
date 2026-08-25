import React from 'react';
import { cn } from './cn';

export const Field: React.FC<{
  label: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ label, hint, error, required, className, children }) => (
  <label className={cn('block space-y-1.5', className)}>
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[length:var(--text-2xs)] font-medium text-[var(--text-secondary)]">
        {label}
        {required && <span className="text-[var(--state-critical-text)]"> *</span>}
      </span>
      {hint && (
        <span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          {hint}
        </span>
      )}
    </div>
    <div>{children}</div>
    {error && (
      <div className="text-[length:var(--text-2xs)] text-[var(--state-critical-text)]">
        {error}
      </div>
    )}
  </label>
);

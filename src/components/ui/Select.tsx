import React from 'react';
import { cn } from './cn';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'w-full h-[var(--control-height)] px-2.5',
        'rounded-[var(--radius-md)]',
        'bg-[var(--bg-surface)]',
        'border border-[var(--border-default)]',
        'text-[length:var(--text-xs)] text-[var(--text-primary)]',
        'focus:outline-none focus:border-[var(--border-focus)]',
        'disabled:bg-[var(--bg-subtle)] disabled:text-[var(--text-disabled)]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

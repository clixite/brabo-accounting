import React from 'react';
import { cn } from './cn';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full h-[var(--control-height)] px-2.5',
        'rounded-[var(--radius-md)]',
        'bg-[var(--bg-surface)]',
        'border border-[var(--border-default)]',
        'text-[length:var(--text-xs)] text-[var(--text-primary)]',
        'placeholder:text-[var(--text-tertiary)]',
        'focus:outline-none focus-visible:ring-0',
        'focus:border-[var(--border-focus)]',
        'disabled:bg-[var(--bg-subtle)] disabled:text-[var(--text-disabled)]',
        className,
      )}
      {...props}
    />
  );
});

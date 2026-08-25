import React from 'react';
import { cn } from './cn';

export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full min-h-[96px] px-2.5 py-2',
        'rounded-[var(--radius-md)]',
        'bg-[var(--bg-surface)]',
        'border border-[var(--border-default)]',
        'text-[length:var(--text-xs)] text-[var(--text-primary)]',
        'placeholder:text-[var(--text-tertiary)]',
        'focus:outline-none focus:border-[var(--border-focus)]',
        'disabled:bg-[var(--bg-subtle)] disabled:text-[var(--text-disabled)]',
        className,
      )}
      {...props}
    />
  );
});

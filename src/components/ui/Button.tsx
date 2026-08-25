import React from 'react';
import { cn } from './cn';

/** Compact square button used for icons (close, actions). */
export const IconButton: React.FC<{
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}> = ({ label, onClick, children, className, disabled }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'inline-flex items-center justify-center',
      'h-[var(--control-height)] w-[var(--control-height)]',
      'rounded-[var(--radius-md)]',
      'text-[var(--text-secondary)]',
      'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      className,
    )}
  >
    {children}
  </button>
);

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Standard action button. */
export const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  title?: string;
}> = ({ children, onClick, variant = 'primary', disabled, className, type = 'button', title }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      'inline-flex items-center justify-center gap-1.5',
      'h-[var(--control-height)] px-3',
      'rounded-[var(--radius-md)]',
      'text-[length:var(--text-xs)] font-semibold',
      'transition-colors',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      variant === 'primary' && 'bg-[var(--accent-solid)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)]',
      variant === 'secondary' && 'bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
      variant === 'ghost' && 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
      variant === 'danger' && 'bg-[var(--state-critical)] text-white hover:bg-[var(--state-critical-hover)]',
      className,
    )}
  >
    {children}
  </button>
);

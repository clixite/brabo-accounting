import React, { useEffect } from 'react';
import { cn } from './cn';
import { IconButton } from './Button';
import { X } from 'lucide-react';

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}> = ({ open, onClose, title, description, children, footer, width = 'md' }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const w =
    width === 'sm'
      ? 'max-w-md'
      : width === 'lg'
        ? 'max-w-3xl'
        : width === 'xl'
          ? 'max-w-5xl'
          : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[var(--bg-overlay)]"
        onMouseDown={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            'w-full',
            w,
            'mt-10 sm:mt-16',
            'bg-[var(--bg-surface)]',
            'border border-[var(--border-default)]',
            'rounded-[var(--radius-lg)]',
            'shadow-[var(--shadow-modal)]',
            'overflow-hidden',
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-4 px-4 py-3 border-b border-[var(--border-subtle)]">
            <div className="min-w-0">
              <div className="text-[length:var(--text-sm)] font-semibold leading-snug">
                {title}
              </div>
              {description && (
                <div className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] leading-snug">
                  {description}
                </div>
              )}
            </div>
            <IconButton label="Fermer" onClick={onClose}>
              <X className="w-4 h-4" />
            </IconButton>
          </header>

          <div className="px-4 py-4">{children}</div>

          {footer && (
            <footer className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>
  );
};

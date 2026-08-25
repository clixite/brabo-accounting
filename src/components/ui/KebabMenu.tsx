import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './Button';

export type MenuItem = {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
};

/**
 * Minimal kebab menu (no dependencies) — keeps row actions calm.
 */
export const KebabMenu: React.FC<{ items: MenuItem[]; label?: string }> = ({
  items,
  label = 'Plus',
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconButton
        label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal className="w-4 h-4" />
      </IconButton>

      {open && (
        <div
          className={cn(
            'absolute right-0 mt-1 w-48 z-20',
            'bg-[var(--bg-surface)] border border-[var(--border-default)]',
            'rounded-[var(--radius-md)] shadow-[var(--shadow-popover)]',
            'p-1',
          )}
          role="menu"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onClick();
              }}
              className={cn(
                'w-full text-left px-2 py-2 rounded-[var(--radius-sm)]',
                'text-[length:var(--text-xs)]',
                it.tone === 'danger'
                  ? 'text-[var(--state-critical-text)] hover:bg-[var(--state-critical-bg)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
              )}
              role="menuitem"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

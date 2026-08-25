import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';
import { Td } from './DataTable';

/** Page/panel-level empty state with optional call to action. */
export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}> = ({ icon, title, description, actionLabel, onAction, className }) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
      'rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--bg-sunken)]',
      className,
    )}
  >
    <span className="h-10 w-10 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-tertiary)]">
      {icon ?? <Inbox className="w-5 h-5" />}
    </span>
    <div>
      <div className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">{title}</div>
      {description && (
        <div className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] max-w-sm leading-relaxed">
          {description}
        </div>
      )}
    </div>
    {actionLabel && onAction && (
      <Button variant="secondary" onClick={onAction} className="mt-1">
        {actionLabel}
      </Button>
    )}
  </div>
);

/** Empty-state row spanning a DataTable (use inside <tbody>). */
export const TableEmptyRow: React.FC<{
  colSpan: number;
  children?: React.ReactNode;
}> = ({ colSpan, children }) => (
  <tr>
    <Td colSpan={colSpan} align="center" className="py-6 text-[var(--text-tertiary)]">
      {children ?? 'Aucune donnée à afficher.'}
    </Td>
  </tr>
);

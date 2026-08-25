import React from 'react';
import { cn } from './cn';

export const DataTable: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** Sticky header inside scroll container. */
  stickyHeader?: boolean;
}> = ({ children, className, stickyHeader }) => (
  <div
    className={cn(
      'w-full overflow-x-auto',
      stickyHeader && '[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10',
      className,
    )}
  >
    <table className="w-full text-left">
      {children}
    </table>
  </div>
);

export const Th: React.FC<{
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}> = ({ children, className, align = 'left' }) => (
  <th
    className={cn(
      'h-10 px-3 text-[length:var(--text-2xs)] font-semibold',
      'text-[var(--text-tertiary)] uppercase tracking-wide',
      'bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)]',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      className,
    )}
  >
    {children}
  </th>
);

export const Td: React.FC<{
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
}> = ({ children, className, align = 'left', mono }) => (
  <td
    className={cn(
      'h-[var(--row-height)] px-3',
      'text-[length:var(--text-xs)] text-[var(--text-secondary)]',
      'border-b border-[var(--border-subtle)]',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      mono && 'font-mono tnum text-[var(--text-primary)]',
      className,
    )}
  >
    {children}
  </td>
);

export const Tr: React.FC<{
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}> = ({ children, className, interactive, onClick }) => (
  <tr
    className={cn(
      interactive && 'cursor-pointer hover:bg-[var(--bg-hover)]',
      className,
    )}
    onClick={onClick}
  >
    {children}
  </tr>
);

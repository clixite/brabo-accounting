import React from 'react';
import { cn } from './cn';

/**
 * Split view layout for accounting work:
 * - Left: list/queue (dense table)
 * - Right: detail/action pane
 */
export const SplitView: React.FC<{
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}> = ({ left, right, className }) => (
  <div
    className={cn(
      'grid grid-cols-1 lg:grid-cols-[minmax(520px,1.25fr)_minmax(360px,0.75fr)] gap-4 items-start',
      className,
    )}
  >
    <div className="min-w-0">{left}</div>
    <div className="min-w-0 lg:sticky lg:top-[calc(var(--topbar-height)+16px)]">{right}</div>
  </div>
);

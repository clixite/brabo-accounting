import { cn } from './cn';

export type Segment<T extends string> = { value: T; label: string; count?: number };

export function Segmented<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  items: Segment<T>[];
  className?: string;
}) {
  const { value, onChange, items, className } = props;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 p-1',
        'rounded-[var(--radius-md)] border border-[var(--border-default)]',
        'bg-[var(--bg-surface)]',
        className,
      )}
      role="tablist"
      aria-label="Filtres"
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              'h-[var(--control-height-sm)] px-2.5 rounded-[var(--radius-sm)]',
              'text-[length:var(--text-2xs)] font-medium',
              active
                ? 'bg-[var(--accent-soft)] border border-[var(--accent-soft-border)] text-[var(--text-primary)]'
                : 'border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            )}
            role="tab"
            aria-selected={active}
          >
            <span className="inline-flex items-center gap-1.5">
              {it.label}
              {typeof it.count === 'number' && (
                <span className="font-mono tnum text-[var(--text-tertiary)]">{it.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

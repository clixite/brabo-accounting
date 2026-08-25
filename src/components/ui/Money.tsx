import React from 'react';
import { cn } from './cn';
import { formatMoney, formatAmount, formatSignedMoney } from '../../utils/format';

type MoneyMode = 'money' | 'amount' | 'signed';

export const Money: React.FC<{
  value: number;
  mode?: MoneyMode;
  /** Align right in tables by default. */
  align?: 'left' | 'right';
  tone?: 'default' | 'muted' | 'positive' | 'critical';
  className?: string;
  title?: string;
}> = ({
  value,
  mode = 'money',
  align = 'right',
  tone = 'default',
  className,
  title,
}) => {
  const text =
    mode === 'signed'
      ? formatSignedMoney(value)
      : mode === 'amount'
        ? formatAmount(value)
        : formatMoney(value);

  return (
    <span
      title={title ?? text}
      className={cn(
        'font-mono tnum',
        'text-[length:var(--text-xs)] leading-snug',
        align === 'right' ? 'text-right' : 'text-left',
        tone === 'muted'
          ? 'text-[var(--text-tertiary)]'
          : tone === 'positive'
            ? 'text-[var(--state-positive-text)]'
            : tone === 'critical'
              ? 'text-[var(--state-critical-text)]'
              : 'text-[var(--text-primary)]',
        className,
      )}
    >
      {text}
    </span>
  );
};

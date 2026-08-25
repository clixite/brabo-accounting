import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToasts } from '../../state/ToastContext';
import type { ToastTone } from '../../state/ToastContext';
import { cn } from './cn';

const toneConfig: Record<ToastTone, { icon: React.ReactNode; border: string; iconColor: string }> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    border: 'border-[var(--state-positive-border)]',
    iconColor: 'text-[var(--state-positive-text)]',
  },
  error: {
    icon: <XCircle className="w-4 h-4" />,
    border: 'border-[var(--state-critical-border)]',
    iconColor: 'text-[var(--state-critical-text)]',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    border: 'border-[var(--state-warning-border)]',
    iconColor: 'text-[var(--state-warning-text)]',
  },
  info: {
    icon: <Info className="w-4 h-4" />,
    border: 'border-[var(--state-info-border)]',
    iconColor: 'text-[var(--state-info-text)]',
  },
};

export const Toaster: React.FC = () => {
  const { toasts, dismiss } = useToasts();
  // Track remaining time to render the progress bar.
  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    if (toasts.length === 0) return;
    const start = Date.now();
    const duration = 4500;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Object.fromEntries(toasts.map((t) => [t.id, Math.max(0, 1 - elapsed / duration)])));
    }, 60);
    return () => window.clearInterval(id);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-full max-w-sm" role="region" aria-live="polite">
      {toasts.map((toast) => {
        const cfg = toneConfig[toast.tone];
        return (
          <div
            key={toast.id}
            className={cn(
              'relative overflow-hidden',
              'bg-[var(--bg-surface)] border border-[var(--border-default)]',
              'rounded-[var(--radius-lg)] shadow-[var(--shadow-popover)]',
              'px-3 py-2.5 flex items-start gap-2.5',
              'animate-[toast-in_.18s_ease-out]',
            )}
          >
            <span className={cn('shrink-0 mt-0.5', cfg.iconColor)}>{cfg.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[length:var(--text-xs)] font-semibold text-[var(--text-primary)] leading-snug">
                {toast.title}
              </div>
              {toast.message && (
                <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] leading-snug mt-0.5">
                  {toast.message}
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Fermer la notification"
              className="shrink-0 p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div
              className="absolute bottom-0 left-0 h-0.5 bg-[var(--accent-solid)]"
              style={{ width: `${(progress[toast.id] ?? 1) * 100}%` }}
            />
          </div>
        );
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

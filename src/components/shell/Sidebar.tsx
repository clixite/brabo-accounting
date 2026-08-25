import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Landmark,
  Network,
  Calculator,
  UserCheck,
  Settings,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { NavTab } from '../Navigation';
// (temporary) NavTab lives in Navigation.tsx — will be moved later.
import { cn } from '../ui/cn';

export type NavGroup = {
  label: string;
  items: {
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    tone?: 'neutral' | 'warning' | 'critical' | 'info';
  }[];
};

export const Sidebar: React.FC<{
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  groups: NavGroup[];
}> = ({ currentTab, onSelectTab, collapsed, onToggleCollapsed, groups }) => {
  return (
    <aside
      className={cn(
        'h-[calc(100vh-var(--topbar-height))] sticky top-[var(--topbar-height)]',
        'border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)]',
        'shrink-0',
        collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
      )}
    >
      <div className="h-full flex flex-col">
        <div className={cn('px-2 py-2 flex items-center', collapsed ? 'justify-center' : 'justify-end')}>
          <button
            onClick={onToggleCollapsed}
            className={cn(
              'h-8 w-8 inline-flex items-center justify-center rounded-[var(--radius-md)]',
              'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
              'transition-colors',
            )}
            aria-label={collapsed ? 'Déplier la navigation' : 'Replier la navigation'}
            title={collapsed ? 'Déplier' : 'Replier'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="px-2 pb-3 space-y-4 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.label} className="space-y-1">
              {!collapsed && (
                <div className="px-2 pt-1 pb-1 text-[length:var(--text-2xs)] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                  {g.label}
                </div>
              )}

              {g.items.map((item) => {
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-[var(--radius-md)]',
                      collapsed ? 'px-2 justify-center h-9' : 'px-2.5 h-9',
                      'text-[length:var(--text-xs)] transition-colors',
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] border border-[var(--accent-soft-border)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent',
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <span
                      className={cn(
                        'shrink-0',
                        active ? 'text-[var(--accent-text)]' : 'text-[var(--text-tertiary)]',
                      )}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <span className="flex-1 min-w-0 truncate text-left">
                        {item.label}
                      </span>
                    )}
                    {!collapsed && item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={cn(
                          'shrink-0 font-mono tnum text-[length:var(--text-2xs)] px-1.5 py-0.5 rounded-[var(--radius-sm)] border',
                          item.tone === 'critical'
                            ? 'bg-[var(--state-critical-bg)] text-[var(--state-critical-text)] border-[var(--state-critical-border)]'
                            : item.tone === 'warning'
                              ? 'bg-[var(--state-warning-bg)] text-[var(--state-warning-text)] border-[var(--state-warning-border)]'
                              : item.tone === 'info'
                                ? 'bg-[var(--state-info-bg)] text-[var(--state-info-text)] border-[var(--state-info-border)]'
                                : 'bg-[var(--state-neutral-bg)] text-[var(--state-neutral-text)] border-[var(--state-neutral-border)]',
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export function defaultNavGroups(params: {
  overdueCount: number;
  pendingExpensesCount: number;
  unreconciledBankCount: number;
  labels: {
    dashboard: string;
    invoicing: string;
    expenses: string;
    peppol: string;
    taxCenter: string;
    banking: string;
    fiduciary: string;
    reports: string;
    settings: string;
  };
}): NavGroup[] {
  const { overdueCount, pendingExpensesCount, unreconciledBankCount, labels } = params;
  return [
    {
      label: 'Pilotage',
      items: [
        { id: 'dashboard', label: labels.dashboard, icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'reports', label: labels.reports, icon: <BarChart3 className="w-4 h-4" /> },
      ],
    },
    {
      label: 'Opérations',
      items: [
        {
          id: 'invoicing',
          label: labels.invoicing,
          icon: <FileText className="w-4 h-4" />,
          badge: overdueCount > 0 ? overdueCount : undefined,
          tone: overdueCount > 0 ? 'critical' : 'neutral',
        },
        {
          id: 'expenses',
          label: labels.expenses,
          icon: <Receipt className="w-4 h-4" />,
          badge: pendingExpensesCount > 0 ? pendingExpensesCount : undefined,
          tone: pendingExpensesCount > 0 ? 'warning' : 'neutral',
        },
        {
          id: 'banking',
          label: labels.banking,
          icon: <Landmark className="w-4 h-4" />,
          badge: unreconciledBankCount > 0 ? unreconciledBankCount : undefined,
          tone: unreconciledBankCount > 0 ? 'warning' : 'neutral',
        },
      ],
    },
    {
      label: 'Conformité',
      items: [
        {
          id: 'peppol',
          label: labels.peppol,
          icon: <Network className="w-4 h-4" />,
        },
        {
          id: 'taxCenter',
          label: labels.taxCenter,
          icon: <Calculator className="w-4 h-4" />,
        },
        {
          id: 'fiduciary',
          label: labels.fiduciary,
          icon: <UserCheck className="w-4 h-4" />,
        },
      ],
    },
    {
      label: 'Administration',
      items: [
        {
          id: 'settings',
          label: labels.settings,
          icon: <Settings className="w-4 h-4" />,
        },
      ],
    },
  ];
}

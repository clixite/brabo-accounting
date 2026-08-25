import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Network,
  Calculator,
  Landmark,
  UserCheck,
  Settings
} from 'lucide-react';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

export type NavTab = 
  | 'dashboard'
  | 'invoicing'
  | 'expenses'
  | 'peppol'
  | 'taxCenter'
  | 'banking'
  | 'fiduciary'
  | 'documents'
  | 'payroll'
  | 'reports'
  | 'audit'
  | 'settings';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  lang: Language;
  overdueCount?: number;
  pendingExpensesCount?: number;
  unreconciledBankCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  lang,
  overdueCount = 1,
  pendingExpensesCount = 1,
  unreconciledBankCount = 2,
}) => {
  const t = translations[lang].nav;

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number; badgeColor?: string; highlight?: boolean }[] = [
    {
      id: 'dashboard',
      label: t.dashboard,
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'invoicing',
      label: t.invoicing,
      icon: <FileText className="w-4 h-4" />,
      badge: overdueCount > 0 ? overdueCount : undefined,
      badgeColor: 'bg-red-500/20 text-red-400 border border-red-500/30',
    },
    {
      id: 'expenses',
      label: t.expenses,
      icon: <Receipt className="w-4 h-4" />,
      badge: pendingExpensesCount > 0 ? pendingExpensesCount : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    },
    {
      id: 'peppol',
      label: t.peppol,
      icon: <Network className="w-4 h-4" />,
      highlight: true,
    },
    {
      id: 'taxCenter',
      label: t.taxCenter,
      icon: <Calculator className="w-4 h-4" />,
    },
    {
      id: 'banking',
      label: t.banking,
      icon: <Landmark className="w-4 h-4" />,
      badge: unreconciledBankCount > 0 ? unreconciledBankCount : undefined,
      badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    },
    {
      id: 'fiduciary',
      label: t.fiduciary,
      icon: <UserCheck className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: t.settings,
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar py-2">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap relative ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                } ${item.highlight && !isActive ? 'border border-amber-500/30 text-amber-300 hover:bg-amber-500/10' : ''}`}
              >
                <span className={isActive ? 'text-slate-950' : item.highlight ? 'text-amber-400' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>

                {item.badge !== undefined && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-slate-950 text-amber-300' : item.badgeColor
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                
                {item.highlight && !isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

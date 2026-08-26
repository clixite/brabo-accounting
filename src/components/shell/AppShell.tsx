import React, { useMemo, useState } from 'react';
import type { CompanyProfile } from '../../types/accounting';
import type { Language } from '../../i18n/translations';
import { translations } from '../../i18n/translations';
import type { NavTab } from '../../types/navigation';
import { Sidebar, defaultNavGroups } from './Sidebar';
import { Topbar } from './Topbar';
import { useTheme } from '../../theme/useTheme';

export const AppShell: React.FC<{
  company: CompanyProfile;
  lang: Language;
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  overdueCount: number;
  pendingExpensesCount: number;
  unreconciledBankCount: number;
  visibleTabs?: Set<NavTab>;
  children: React.ReactNode;
}> = ({
  company,
  lang,
  currentTab,
  onSelectTab,
  overdueCount,
  pendingExpensesCount,
  unreconciledBankCount,
  visibleTabs,
  children,
}) => {
  const t = translations[lang];
  const { theme, density, toggleTheme, toggleDensity } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const groups = useMemo(() => {
    const all = defaultNavGroups({
      overdueCount,
      pendingExpensesCount,
      unreconciledBankCount,
      labels: {
        dashboard: t.nav.dashboard,
        invoicing: t.nav.invoicing,
        expenses: t.nav.expenses,
        peppol: t.nav.peppol,
        taxCenter: t.nav.taxCenter,
        banking: t.nav.banking,
        fiduciary: t.nav.fiduciary,
        documents: t.nav.documents,
        payroll: t.nav.payroll,
        reports: t.nav.reports,
        audit: t.nav.audit,
        settings: t.nav.settings,
      },
    });
    if (!visibleTabs) return all;
    return all
      .map((g) => ({ ...g, items: g.items.filter((i) => visibleTabs.has(i.id)) }))
      .filter((g) => g.items.length > 0);
  }, [overdueCount, pendingExpensesCount, unreconciledBankCount, t, visibleTabs]);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
      <Topbar
        company={company}
        appTitle={t.appTitle}
        subtitle={t.appSubtitle}
        theme={theme}
        density={density}
        onToggleTheme={toggleTheme}
        onToggleDensity={toggleDensity}
      />

      <div className="flex">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={onSelectTab}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
          groups={groups}
        />

        <main className="flex-1 min-w-0">
          <div className="p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
};

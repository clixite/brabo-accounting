import React from 'react';
import {
  TrendingUp,
  Landmark,
  Receipt,
  FileText,
  Sparkles,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Hash,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import type { Invoice, PurchaseExpense, BankTransaction, CompanyProfile } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { calculateVatGrids } from '../utils/belgianAccounting';
import { runFiscalAudit } from '../services/fiscalAudit';
import { Money } from './ui/Money';
import { Badge } from './ui/Badge';
import { cn } from './ui/cn';
import { Sparkline } from './ui/Sparkline';
import { formatDate, formatMoney } from '../utils/format';

interface DashboardViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  transactions: BankTransaction[];
  lang: Language;
  onNewInvoice: () => void;
  onScanExpense: () => void;
  onOpenOgmTool: () => void;
  onNavigateTab: (tab: any) => void;
  onViewInvoice: (invoice: Invoice) => void;
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  trend,
  trendTone = 'positive',
  spark,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  tone: 'blue' | 'emerald' | 'amber' | 'purple';
  trend?: string;
  trendTone?: 'positive' | 'negative';
  spark?: number[];
}) {
  const toneMap = {
    blue: 'text-[var(--state-info-text)] bg-[var(--state-info-bg)]',
    emerald: 'text-[var(--state-positive-text)] bg-[var(--state-positive-bg)]',
    amber: 'text-[var(--state-warning-text)] bg-[var(--state-warning-bg)]',
    purple: 'text-[#a78bfa] bg-[rgba(139,92,246,0.12)]',
  } as const;
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow)] flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[length:var(--text-2xs)] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
          {label}
        </span>
        <span className={cn('shrink-0 h-8 w-8 rounded-[var(--radius-md)] flex items-center justify-center', toneMap[tone])}>
          {icon}
        </span>
      </div>
      <div>
        <div className="text-[length:var(--text-xl)] font-semibold tracking-tight text-[var(--text-primary)] font-mono tnum leading-tight">
          {value}
        </div>
        {(trend || sub) && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {trend && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-[length:var(--text-2xs)] font-medium',
                  trendTone === 'positive' ? 'text-[var(--state-positive-text)]' : 'text-[var(--state-critical-text)]',
                )}
              >
                {trendTone === 'positive' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {trend}
              </span>
            )}
            {sub && <span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">{sub}</span>}
          </div>
        )}
        {spark && (
          <div className="mt-2 -mb-1">
            <Sparkline data={spark} />
          </div>
        )}
      </div>
    </div>
  );
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  company,
  invoices,
  purchases,
  transactions,
  lang,
  onNewInvoice,
  onScanExpense,
  onOpenOgmTool,
  onNavigateTab,
  onViewInvoice,
}) => {
  const t = translations[lang].dashboard;

  const totalTurnover = invoices
    .filter((i) => i.status !== 'cancelled' && i.type !== 'quote')
    .reduce((acc, i) => acc + (i.type === 'credit_note' ? -i.subtotalExclVat : i.subtotalExclVat), 0);

  const totalOutstanding = invoices
    .filter((i) => (i.status === 'sent' || i.status === 'overdue' || i.status === 'peppol_delivered') && i.type === 'invoice')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const totalOverdue = invoices
    .filter((i) => i.status === 'overdue' && i.type === 'invoice')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const bankBalance = 24850.5 + transactions.reduce((acc, tx) => acc + tx.amount, 0);
  const vatDeclaration = calculateVatGrids(invoices, purchases, '2026-Q1');
  const vatDue = vatDeclaration.grid71 > 0 ? vatDeclaration.grid71 : vatDeclaration.grid72;
  const vatIsCredit = vatDeclaration.grid71 === 0;
  const fiscalAudit = runFiscalAudit(invoices, purchases, company, '2026-Q1');

  const recentInvoices = [...invoices].slice(0, 4);
  const recentPurchases = [...purchases].slice(0, 4);

  const monthlyData = [
    { month: 'Nov', sales: 12400, expenses: 4200 },
    { month: 'Déc', sales: 16800, expenses: 5800 },
    { month: 'Jan', sales: 8400, expenses: 3200 },
    { month: 'Fév', sales: 12882, expenses: 4615 },
    { month: 'Mar', sales: 14500, expenses: 4900 },
  ];
  const maxVal = 18000;
  const totalSales = monthlyData.reduce((a, d) => a + d.sales, 0);
  const totalExpenses = monthlyData.reduce((a, d) => a + d.expenses, 0);

  const statusTone = (s: Invoice['status']) =>
    s === 'paid' ? 'positive' : s === 'overdue' ? 'critical' : s === 'peppol_delivered' ? 'info' : 'neutral';

  return (
    <div className="space-y-5">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge tone="positive" dot>{'100% prêt pour le B2B 2026'}</Badge>
            <Badge
              tone={fiscalAudit.totalErrors > 0 ? 'critical' : fiscalAudit.totalWarnings > 0 ? 'warning' : 'neutral'}
              dot
            >
              Risque fiscal {fiscalAudit.riskScore}/100
            </Badge>
            <span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Régime TVA : trimestriel</span>
          </div>
          <div>
            <h1 className="text-[length:var(--text-2xl)] font-semibold tracking-tight text-[var(--text-primary)]">
              {t.welcome} <span className="text-[var(--accent-solid)]">{company.name}</span>
            </h1>
            <p className="text-[length:var(--text-sm)] text-[var(--text-secondary)]">{t.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenOgmTool}
            className="h-[var(--control-height)] inline-flex items-center gap-1.5 px-3 rounded-[var(--radius-md)] text-[length:var(--text-xs)] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] bg-[var(--bg-surface)] transition-colors"
          >
            <Hash className="w-4 h-4 text-[var(--text-tertiary)]" />
            {t.generateOgm}
          </button>
          <button
            onClick={onScanExpense}
            className="h-[var(--control-height)] inline-flex items-center gap-1.5 px-3 rounded-[var(--radius-md)] text-[length:var(--text-xs)] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] bg-[var(--bg-surface)] transition-colors"
          >
            <Sparkles className="w-4 h-4 text-[var(--text-tertiary)]" />
            {t.scanExpense}
          </button>
          <button
            onClick={onNewInvoice}
            className="h-[var(--control-height)] inline-flex items-center gap-1.5 px-3.5 rounded-[var(--radius-md)] text-[length:var(--text-xs)] font-semibold bg-[var(--accent-solid)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <FileText className="w-4 h-4" />
            {t.newInvoice}
          </button>
        </div>
      </div>

      {/* ── KPI grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label={t.kpiTurnover}
          value={formatMoney(totalTurnover)}
          sub="HTVA"
          icon={<TrendingUp className="w-4 h-4" />}
          tone="blue"
          trend="+18% vs T4 2025"
          spark={[4200, 5800, 3200, 4615, 8400, 12882, 14500]}
        />
        <KpiCard
          label={t.kpiTreasury}
          value={formatMoney(bankBalance)}
          sub={`${company.iban.slice(0, 4)} ••• ${company.iban.slice(-4)}`}
          icon={<Landmark className="w-4 h-4" />}
          tone="emerald"
          spark={[21400, 22800, 24150, 23600, 25200, 26600, bankBalance]}
        />
        <KpiCard
          label="Encaissement"
          value={formatMoney(totalOutstanding)}
          sub={`dont ${formatMoney(totalOverdue)} en retard`}
          icon={<Clock className="w-4 h-4" />}
          tone="purple"
          spark={[8409, 8228, 7540, 6910, 6450, 5720, totalOutstanding]}
        />
        <KpiCard
          label={t.kpiVatPayable}
          value={formatMoney(vatDue)}
          sub={vatIsCredit ? 'Crédit TVA à récupérer' : 'Grille 71 (à payer)'}
          icon={<Receipt className="w-4 h-4" />}
          tone="amber"
          spark={[2100, 2600, 1459, 1980, 2236, 2450, vatDue]}
        />
      </div>

      {/* ── Chart + Deadlines ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Cashflow chart */}
        <div className="lg:col-span-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <div className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--text-tertiary)]" />
                Évolution CA & dépenses
              </div>
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                {formatMoneyShort(totalSales)} vendues · {formatMoneyShort(totalExpenses)} dépensées (5 mois)
              </div>
            </div>
            <div className="flex items-center gap-3 text-[length:var(--text-2xs)]">
              <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent-solid)]" /> Ventes
              </span>
              <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-sm bg-[var(--text-tertiary)]" /> Dépenses
              </span>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3 pt-3 items-end h-44">
            {monthlyData.map((d, i) => (
              <div key={i} className="flex flex-col items-center justify-end h-full group">
                <div className="w-full flex justify-center items-end gap-1.5 h-32 relative">
                  <div className="opacity-0 group-hover:opacity-100 transition absolute -top-9 bg-[var(--bg-surface-raised)] px-2 py-1 rounded-[var(--radius-sm)] text-[length:var(--text-2xs)] font-mono text-[var(--text-primary)] border border-[var(--border-default)] pointer-events-none z-10 whitespace-nowrap shadow-[var(--shadow-popover)]">
                    {formatMoneyShort(d.sales)} / {formatMoneyShort(d.expenses)}
                  </div>
                  <div className="w-4 bg-[var(--accent-solid)] rounded-t" style={{ height: `${(d.sales / maxVal) * 100}%` }} />
                  <div className="w-4 bg-[var(--text-tertiary)] rounded-t" style={{ height: `${(d.expenses / maxVal) * 100}%` }} />
                </div>
                <span className="text-[length:var(--text-2xs)] font-medium text-[var(--text-tertiary)] mt-2">
                  {d.month}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Deadlines */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
            <div className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--text-tertiary)]" />
              {t.deadlinesTitle}
            </div>
            <Badge tone="warning">2026</Badge>
          </div>

          <div className="space-y-2">
            {[
              { date: '20 Avr', title: 'Déclaration TVA Q1', amount: `${formatMoneyShort(vatDue)}`, tone: 'info' as const },
              { date: '31 Mar', title: 'Cotisations INASTI Q1', amount: 'Liantis', tone: 'warning' as const },
              { date: '31 Mar', title: 'Listing annuel clients', amount: 'SPF', tone: 'neutral' as const },
            ].map((d, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
                <div className="shrink-0 text-center leading-none">
                  <div className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">{d.date.split(' ')[0]}</div>
                  <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] uppercase">{d.date.split(' ')[1]}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">{d.title}</div>
                  <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">{d.amount}</div>
                </div>
                <Badge tone={d.tone}>{d.tone === 'info' ? 'À payer' : d.tone === 'warning' ? 'Échéance' : 'Dossier'}</Badge>
              </div>
            ))}
          </div>

          <button
            onClick={() => onNavigateTab('taxCenter')}
            className="w-full text-left text-[length:var(--text-xs)] font-medium text-[var(--accent-solid)] hover:text-[var(--accent-hover)] flex items-center justify-end gap-1 pt-1"
          >
            Ouvrir le centre fiscal <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Recent activity ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent invoices */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
            <div className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--text-tertiary)]" />
              {t.recentInvoices}
            </div>
            <button onClick={() => onNavigateTab('invoicing')} className="text-[length:var(--text-2xs)] font-medium text-[var(--accent-solid)] hover:text-[var(--accent-hover)] flex items-center gap-1">
              Tout voir <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1.5">
            {recentInvoices.map((inv) => (
              <button
                key={inv.id}
                onClick={() => onViewInvoice(inv)}
                className="w-full flex items-center justify-between gap-3 p-2.5 rounded-[var(--radius-md)] hover:bg-[var(--bg-hover)] transition-colors text-left"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono tnum text-[length:var(--text-xs)] font-semibold text-[var(--text-primary)]">
                      {inv.invoiceNumber}
                    </span>
                    <span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">·</span>
                    <span className="text-[length:var(--text-xs)] text-[var(--text-secondary)] truncate">{inv.client.name}</span>
                  </div>
                  <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] font-mono tnum">{formatDate(inv.date)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Money value={inv.totalInclVat} />
                  <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent expenses */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
            <div className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[var(--text-tertiary)]" />
              {t.recentExpenses}
            </div>
            <button onClick={() => onNavigateTab('expenses')} className="text-[length:var(--text-2xs)] font-medium text-[var(--accent-solid)] hover:text-[var(--accent-hover)] flex items-center gap-1">
              Tout voir <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1.5">
            {recentPurchases.map((exp) => (
              <div
                key={exp.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-[var(--radius-md)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[length:var(--text-xs)] text-[var(--text-secondary)] font-medium truncate">
                      {exp.supplierName}
                    </span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[length:var(--text-2xs)] font-mono text-[var(--text-tertiary)]">
                      {exp.pcmnAccount}
                    </span>
                  </div>
                  <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] truncate">{exp.description}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Money value={exp.amountInclVat} />
                  <Badge tone="neutral">{exp.deductibilityRate}%</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Small helper: formats money without the full Money component for inline labels. */
function formatMoneyShort(value: number): string {
  return new Intl.NumberFormat('fr-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value) + ' €';
}

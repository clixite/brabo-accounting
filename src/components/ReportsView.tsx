import { BarChart3, CircleDollarSign, Landmark, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { BankTransaction, CompanyProfile, Invoice, PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import {
  computeCashFlow,
  computeMonthlyRevenue,
  computeOverdueAging,
  computeProfitLoss,
} from '../services/reporting';

const eur = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

interface ReportsViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  transactions: BankTransaction[];
  lang: Language;
}

/**
 * Client financial reporting: P&L, cash flow, VAT position and overdue aging —
 * computed live from the ledger, no spreadsheet needed.
 */
export function ReportsView({ company, invoices, purchases, transactions, lang }: ReportsViewProps) {
  const t = translations[lang].reports;
  const pl = computeProfitLoss(invoices, purchases);
  const cash = computeCashFlow(transactions);
  const aging = computeOverdueAging(invoices);
  const monthly = computeMonthlyRevenue(invoices, 2026);
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.revenue));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-wider uppercase mb-1">
          <BarChart3 className="h-4 w-4" /> Reporting & pilotage
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{t.title}</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          {company.name} · {t.subtitle}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t.revenue, value: eur.format(pl.revenueExclVat), icon: TrendingUp, tone: 'text-amber-300' },
          { label: t.expenses, value: eur.format(pl.expensesExclVat), icon: TrendingDown, tone: 'text-slate-200' },
          { label: t.grossResult, value: eur.format(pl.grossResult), icon: CircleDollarSign, tone: pl.grossResult >= 0 ? 'text-emerald-300' : 'text-red-400' },
          { label: t.vatNet, value: eur.format(pl.vatNet), icon: Landmark, tone: pl.vatNet >= 0 ? 'text-emerald-300' : 'text-sky-300' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-slate-400 text-[11px] uppercase tracking-wide mb-2">
              <c.icon className={`h-4 w-4 ${c.tone}`} /> {c.label}
            </div>
            <div className={`text-xl font-extrabold ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Monthly revenue chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-4">{t.monthlyRevenue}</h3>
          <div className="flex items-end gap-1.5 h-40">
            {monthly.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-amber-600 to-amber-400 group-hover:from-amber-500 group-hover:to-amber-300 transition-all"
                  style={{ height: `${Math.max(3, (m.revenue / maxMonthly) * 100)}%` }}
                  title={`${m.month}: ${eur.format(m.revenue)}`}
                />
                <span className="text-[9px] text-slate-500 font-mono">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cash flow */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-400" /> {t.cashFlow}
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[10px] uppercase text-slate-500">Encaissements</div>
              <div className="font-mono font-bold text-emerald-300">{eur.format(cash.inflows)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[10px] uppercase text-slate-500">Décaissements</div>
              <div className="font-mono font-bold text-slate-200">{eur.format(cash.outflows)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[10px] uppercase text-slate-500">Solde net</div>
              <div className={`font-mono font-bold ${cash.netCashFlow >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                {eur.format(cash.netCashFlow)}
              </div>
            </div>
          </div>

          {/* Overdue aging */}
          <div>
            <h4 className="text-[11px] uppercase text-slate-500 mb-2">{t.aging}</h4>
            <div className="space-y-1.5">
              {aging.buckets.map((b) => (
                <div key={b.key} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-slate-400">{b.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${b.key === '60plus' ? 'bg-red-500' : b.key === '31_60' ? 'bg-amber-500' : b.key === '0_30' ? 'bg-amber-400' : 'bg-slate-600'}`}
                      style={{ width: `${aging.totalAmount > 0 ? (b.amount / aging.totalAmount) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-24 text-right font-mono text-slate-300">{eur.format(b.amount)}</span>
                  <span className="w-6 text-right text-slate-500">{b.count}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {aging.totalCount} facture(s) en attente · {eur.format(aging.totalAmount)} au total
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

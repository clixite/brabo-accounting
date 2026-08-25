import { BarChart3, CircleDollarSign, Download, Landmark, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { BankTransaction, CompanyProfile, Invoice, PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import {
  computeCashFlow,
  computeMonthlyRevenue,
  computeOverdueAging,
  computeProfitLoss,
} from '../services/reporting';
import { Card, CardHeader, CardBody } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { toCsv, downloadCsv } from '../utils/csv';

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

  const handleExportCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    // Section 1 — Monthly revenue
    const revRows = monthly.map((m) => [m.month, m.revenue.toFixed(2)]);
    // Section 2 — P&L summary
    const plRows: (string | number)[][] = [
      ['Produits (HTVA)', pl.revenueExclVat.toFixed(2)],
      ['Charges (HTVA)', pl.expensesExclVat.toFixed(2)],
      ['Résultat brut', pl.grossResult.toFixed(2)],
      ['TVA nette', pl.vatNet.toFixed(2)],
    ];
    // Section 3 — Cash flow
    const cfRows: (string | number)[][] = [
      ['Encaissements', cash.inflows.toFixed(2)],
      ['Décaissements', cash.outflows.toFixed(2)],
      ['Solde', cash.netCashFlow.toFixed(2)],
    ];
    const csv = toCsv(['Chiffre d\'affaires mensuel (HTVA)', 'Montant'], revRows)
      .concat('\r\n\r\n')
      .concat(toCsv(['Compte de résultat', 'Montant'], plRows))
      .concat('\r\n\r\n')
      .concat(toCsv(['Flux de trésorerie', 'Montant'], cfRows));
    downloadCsv(`BRABO_RAPPORT_${company.bceNumber.replace(/[^0-9]/g, '')}_${date}.csv`, csv);
  };

  return (
    <div className="space-y-4">
      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          <Badge tone="accent" dot>Reporting &amp; pilotage</Badge>
        </div>
        <h1 className="text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[var(--text-tertiary)]" />
          {t.title}
        </h1>
        <p className="text-[length:var(--text-xs)] text-[var(--text-secondary)]">
          {company.name} · {t.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={handleExportCsv} className="h-[var(--control-height-sm)] px-2">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: t.revenue,
            value: eur.format(pl.revenueExclVat),
            icon: TrendingUp,
            tone: 'text-[var(--accent-solid)]',
          },
          {
            label: t.expenses,
            value: eur.format(pl.expensesExclVat),
            icon: TrendingDown,
            tone: 'text-[var(--text-primary)]',
          },
          {
            label: t.grossResult,
            value: eur.format(pl.grossResult),
            icon: CircleDollarSign,
            tone: pl.grossResult >= 0 ? 'text-[var(--state-positive-text)]' : 'text-[var(--state-critical-text)]',
          },
          {
            label: t.vatNet,
            value: eur.format(pl.vatNet),
            icon: Landmark,
            tone: pl.vatNet >= 0 ? 'text-[var(--state-positive-text)]' : 'text-[var(--state-info-text)]',
          },
        ].map((c) => (
          <Card key={c.label}>
            <div className="flex items-center gap-2 text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] mb-2">
              <c.icon className={`h-4 w-4 ${c.tone}`} /> {c.label}
            </div>
            <div className={`text-[length:var(--text-xl)] font-semibold font-mono tnum ${c.tone}`}>{c.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── Monthly revenue chart ─────────────────────────────────────── */}
        <Card flush>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--text-tertiary)]" />
                {t.monthlyRevenue}
              </span>
            }
            description="Chiffre d'affaires mensuel · exercice 2026"
          />
          <CardBody>
            <div className="flex items-end gap-1.5 h-40">
              {monthly.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] bg-[var(--accent-solid)] opacity-80 group-hover:opacity-100 transition-all"
                    style={{ height: `${Math.max(3, (m.revenue / maxMonthly) * 100)}%` }}
                    title={`${m.month}: ${eur.format(m.revenue)}`}
                  />
                  <span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] font-mono tnum">
                    {m.month.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* ── Cash flow ─────────────────────────────────────────────────── */}
        <Card flush>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[var(--accent-solid)]" />
                {t.cashFlow}
              </span>
            }
            description="Mouvements bancaires rapprochés"
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[var(--bg-sunken)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-3">
                <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
                  Encaissements
                </div>
                <div className="font-mono tnum font-semibold text-[var(--state-positive-text)]">
                  {eur.format(cash.inflows)}
                </div>
              </div>
              <div className="bg-[var(--bg-sunken)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-3">
                <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
                  Décaissements
                </div>
                <div className="font-mono tnum font-semibold text-[var(--text-primary)]">
                  {eur.format(cash.outflows)}
                </div>
              </div>
              <div className="bg-[var(--bg-sunken)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-3">
                <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
                  Solde net
                </div>
                <div
                  className={`font-mono tnum font-semibold ${
                    cash.netCashFlow >= 0
                      ? 'text-[var(--state-positive-text)]'
                      : 'text-[var(--state-critical-text)]'
                  }`}
                >
                  {eur.format(cash.netCashFlow)}
                </div>
              </div>
            </div>

            {/* Overdue aging */}
            <div>
              <h4 className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] font-semibold mb-2">
                {t.aging}
              </h4>
              <div className="space-y-1.5">
                {aging.buckets.map((b) => (
                  <div key={b.key} className="flex items-center gap-2 text-[length:var(--text-xs)]">
                    <span className="w-16 text-[var(--text-tertiary)]">{b.label}</span>
                    <div className="flex-1 h-2 rounded-[var(--radius-full)] bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className={`h-full rounded-[var(--radius-full)] ${
                          b.key === '60plus'
                            ? 'bg-[var(--state-critical-solid)]'
                            : b.key === '31_60'
                              ? 'bg-[var(--state-warning-solid)]'
                              : b.key === '0_30'
                                ? 'bg-[var(--accent-solid)]'
                                : 'bg-[var(--text-disabled)]'
                        }`}
                        style={{ width: `${aging.totalAmount > 0 ? (b.amount / aging.totalAmount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-24 text-right font-mono tnum text-[var(--text-secondary)]">
                      {eur.format(b.amount)}
                    </span>
                    <span className="w-6 text-right text-[var(--text-tertiary)]">{b.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                {aging.totalCount} facture(s) en attente · {eur.format(aging.totalAmount)} au total
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

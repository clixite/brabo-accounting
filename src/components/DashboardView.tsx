import React from 'react';
import { 
  TrendingUp, 
  Landmark, 
  Receipt, 
  FileText, 
  AlertTriangle, 
  Sparkles, 
  Calendar, 
  ArrowUpRight, 
  ShieldCheck, 
  Network, 
  Clock, 
  Hash,
  BarChart3
} from 'lucide-react';
import type { Invoice, PurchaseExpense, BankTransaction, CompanyProfile } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { calculateVatGrids } from '../utils/belgianAccounting';

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
    .filter(i => i.status !== 'cancelled' && i.type !== 'quote')
    .reduce((acc, i) => acc + (i.type === 'credit_note' ? -i.subtotalExclVat : i.subtotalExclVat), 0);

  const totalOutstanding = invoices
    .filter(i => (i.status === 'sent' || i.status === 'overdue' || i.status === 'peppol_delivered') && i.type === 'invoice')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const totalOverdue = invoices
    .filter(i => i.status === 'overdue' && i.type === 'invoice')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const bankBalance = 24850.50 + transactions.reduce((acc, tx) => acc + tx.amount, 0);
  const vatDeclaration = calculateVatGrids(invoices, purchases, '2026-Q1');

  const recentInvoices = [...invoices].slice(0, 4);
  const recentPurchases = [...purchases].slice(0, 4);

  const monthlyData = [
    { month: 'Nov 25', sales: 12400, expenses: 4200, vat: 2560 },
    { month: 'Déc 25', sales: 16800, expenses: 5800, vat: 3200 },
    { month: 'Jan 26', sales: 8400, expenses: 3200, vat: 1459 },
    { month: 'Fév 26', sales: 12882, expenses: 4615, vat: 2236 },
    { month: 'Mar 26 (Est.)', sales: 14500, expenses: 4900, vat: 2650 },
  ];

  const maxMonthVal = 18000;

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-amber-950/40 border border-amber-500/30 p-6 shadow-xl">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                {t.peppolBadge}
              </span>
              <span className="text-xs text-slate-400">Régime TVA : Trimestriel</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
              {t.welcome} <span className="text-amber-400">{company.name}</span>
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              {t.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onOpenOgmTool}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-amber-500/40 transition shadow-sm"
            >
              <Hash className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              {t.generateOgm}
            </button>
            <button
              onClick={onScanExpense}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-slate-600 transition shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              {t.scanExpense}
            </button>
            <button
              onClick={onNewInvoice}
              className="inline-flex items-center px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 transition"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5 stroke-[2.5]" />
              {t.newInvoice}
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Turnover HTVA */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{t.kpiTurnover}</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-white font-mono tracking-tight">
              {totalTurnover.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
            <div className="flex items-center text-xs text-emerald-400 mt-1 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              <span>+18.4% vs Q4 2025</span>
            </div>
          </div>
        </div>

        {/* Bank Treasury */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{t.kpiTreasury}</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-white font-mono tracking-tight">
              {bankBalance.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              BNP Paribas : {company.iban.substring(0, 9)}...
            </div>
          </div>
        </div>

        {/* VAT Estimate Q1 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{t.kpiVatPayable}</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-amber-400 font-mono tracking-tight">
              {vatDeclaration.grid71 > 0 
                ? `${vatDeclaration.grid71.toLocaleString('fr-BE', { minimumFractionDigits: 2 })} €` 
                : `${vatDeclaration.grid72.toLocaleString('fr-BE', { minimumFractionDigits: 2 })} € (Crédit)`}
            </span>
            <div className="text-[11px] text-slate-400 mt-1">
              Grille 54 (Dues) - Grille 59 (Déd.)
            </div>
          </div>
        </div>

        {/* Receivables & Overdue */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{t.kpiReceivables}</span>
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-white font-mono tracking-tight">
              {totalOutstanding.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
            <div className="flex items-center text-xs text-red-400 mt-1 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
              <span>{totalOverdue.toFixed(2)} € en retard</span>
            </div>
          </div>
        </div>

      </div>

      {/* Visual Analytics */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center">
              <BarChart3 className="w-4 h-4 mr-2 text-amber-400" />
              Évolution du Chiffre d'Affaires & Dépenses (Mois par Mois)
            </h3>
            <p className="text-xs text-slate-400">
              Chiffres réels HTVA et estimation du solde TVA à verser au SPF Finances
            </p>
          </div>

          <div className="flex items-center space-x-4 text-xs font-semibold">
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-amber-500" />
              <span className="text-slate-300">Ventes HTVA</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-slate-600" />
              <span className="text-slate-300">Achats HTVA</span>
            </div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="grid grid-cols-5 gap-3 pt-4 items-end h-48">
          {monthlyData.map((d, i) => {
            const salesHeight = (d.sales / maxMonthVal) * 100;
            const expHeight = (d.expenses / maxMonthVal) * 100;
            return (
              <div key={i} className="flex flex-col items-center h-full justify-end group">
                <div className="w-full flex justify-center items-end space-x-1.5 h-36 relative">
                  <div className="opacity-0 group-hover:opacity-100 transition absolute -top-8 bg-slate-950 px-2 py-1 rounded text-[10px] font-mono text-amber-300 border border-slate-700 pointer-events-none z-20 whitespace-nowrap">
                    CA: {d.sales}€ | Dép: {d.expenses}€
                  </div>

                  <div 
                    style={{ height: `${salesHeight}%` }}
                    className="w-5 bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-md transition-all duration-300"
                  />
                  <div 
                    style={{ height: `${expHeight}%` }}
                    className="w-5 bg-gradient-to-t from-slate-700 to-slate-500 rounded-t-md transition-all duration-300"
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-400 mt-2 block">{d.month}</span>
                <span className="text-[10px] font-mono text-slate-500">{d.sales.toLocaleString()} €</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deadlines & Peppol Real-time Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Belgian Fiscal Deadlines */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center">
              <Calendar className="w-4 h-4 mr-2 text-amber-400" />
              {t.deadlinesTitle}
            </h3>
            <span className="text-[11px] text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              Belgique 2026
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 font-bold text-center leading-none">
                <span className="block text-sm">20</span>
                <span className="text-[9px] uppercase">Avr</span>
              </div>
              <div className="flex-1">
                <span className="font-bold text-slate-200 block">Déclaration TVA Q1 (SPF Finances)</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Dépôt Intervat & paiement du solde de la grille 71 ({vatDeclaration.grid71.toFixed(2)} €).
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 font-bold text-center leading-none">
                <span className="block text-sm">31</span>
                <span className="text-[9px] uppercase">Mar</span>
              </div>
              <div className="flex-1">
                <span className="font-bold text-slate-200 block">Cotisations Sociales INASTI Q1</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Paiement trimestriel caisse Liantis / UCM / Partena.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 font-bold text-center leading-none">
                <span className="block text-sm">31</span>
                <span className="text-[9px] uppercase">Mar</span>
              </div>
              <div className="flex-1">
                <span className="font-bold text-slate-200 block">Listing annuel clients assujettis</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Clients belges avec CA &gt; 250 € HTVA. Fichier XML prêt.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Fiduciary Sync & Peppol Live Monitor */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center">
                <Network className="w-4 h-4 mr-2 text-emerald-400" />
                Passerelle Peppol & Échanges Fiduciaire
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Surveillance de transmission UBL 2.1 et conformité légale belge
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('peppol')}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
            >
              Ouvrir le Hub Peppol →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">Point d'accès Peppol (SMP)</span>
                <span className="inline-flex items-center text-emerald-400 text-[10px] font-bold">
                  ✓ Opérationnel
                </span>
              </div>
              <div className="font-mono text-[11px] text-amber-300 bg-slate-950 p-2 rounded-lg border border-slate-800 truncate">
                {company.peppolEndpointId}
              </div>
              <p className="text-[11px] text-slate-400">
                Vos factures sont transmises instantanément au format UBL BIS 3.0 avec notification accusé de réception.
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">Fiduciaire Agréée ITAA</span>
                <span className="inline-flex items-center text-blue-400 text-[10px] font-bold">
                  <ShieldCheck className="w-3 h-3 mr-1" /> Sync Live
                </span>
              </div>
              <div className="text-[11px] text-slate-200 bg-slate-950 p-2 rounded-lg border border-slate-800 truncate">
                {company.fiduciaryName}
              </div>
              <p className="text-[11px] text-slate-400">
                Export direct compatible Sage BOB, WinBooks, Horus Office et Exact Online.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 text-center text-xs">
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-750">
              <span className="text-slate-400 block text-[10px]">Factures émises</span>
              <span className="font-bold text-white text-base">{invoices.length}</span>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-750">
              <span className="text-slate-400 block text-[10px]">Livrées via Peppol</span>
              <span className="font-bold text-emerald-400 text-base">
                {invoices.filter(i => i.peppolStatus?.isSent).length}
              </span>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-750">
              <span className="text-slate-400 block text-[10px]">Dépenses OCR traitées</span>
              <span className="font-bold text-amber-400 text-base">{purchases.length}</span>
            </div>
          </div>

        </div>

      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Invoices */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center">
              <FileText className="w-4 h-4 mr-2 text-amber-400" />
              {t.recentInvoices}
            </h3>
            <button
              onClick={() => onNavigateTab('invoicing')}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
            >
              Voir tout ({invoices.length}) →
            </button>
          </div>

          <div className="space-y-2.5">
            {recentInvoices.map((inv) => (
              <div
                key={inv.id}
                onClick={() => onViewInvoice(inv)}
                className="p-3 bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/60 transition cursor-pointer flex items-center justify-between text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-white">{inv.invoiceNumber}</span>
                    <span className="text-slate-400">•</span>
                    <span className="font-semibold text-slate-200">{inv.client.name}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                    <span>{inv.date}</span>
                    <span>•</span>
                    <span className="font-mono text-amber-300/90">{inv.structuredCommunication}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <span className="font-mono font-bold text-white block">
                    {inv.totalInclVat.toFixed(2)} €
                  </span>
                  <span className={`inline-flex px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    inv.status === 'paid' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                    inv.status === 'overdue' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                    'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  }`}>
                    {inv.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Purchases */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center">
              <Receipt className="w-4 h-4 mr-2 text-amber-400" />
              {t.recentExpenses}
            </h3>
            <button
              onClick={() => onNavigateTab('expenses')}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
            >
              Voir tout ({purchases.length}) →
            </button>
          </div>

          <div className="space-y-2.5">
            {recentPurchases.map((exp) => (
              <div
                key={exp.id}
                className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-200">{exp.supplierName}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-700">
                      PCMN {exp.pcmnAccount}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate max-w-xs">
                    {exp.description}
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <span className="font-mono font-bold text-white block">
                    {exp.amountInclVat.toFixed(2)} €
                  </span>
                  <span className="text-[10px] text-amber-300 block font-semibold">
                    Déd. {exp.deductibilityRate}% (TVA {exp.deductibleVat.toFixed(2)}€)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};

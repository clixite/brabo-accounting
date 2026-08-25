import React, { useState } from 'react';
import { 
  Landmark, 
  Upload, 
  CheckCircle2, 
  Check, 
  Zap,
  FileCode,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import type { BankTransaction, Invoice, PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { SAMPLE_CODA_FILE_CONTENT } from '../data/mockBelgianData';
import { parseCODAStatement } from '../utils/belgianAccounting';
import { codaBoxConnector } from '../services/codaBoxConnector';
import confetti from 'canvas-confetti';

interface BankingViewProps {
  transactions: BankTransaction[];
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  lang: Language;
  onReconcileTransaction: (txId: string, invoiceId?: string, expenseId?: string) => void;
  onImportCodaTransactions: (newTxs: BankTransaction[]) => void;
}

export const BankingView: React.FC<BankingViewProps> = ({
  transactions,
  invoices,
  purchases,
  lang,
  onReconcileTransaction,
  onImportCodaTransactions,
}) => {
  const t = translations[lang].banking;
  const [filterReconciled, setFilterReconciled] = useState<'all' | 'unreconciled' | 'reconciled'>('all');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCodaBoxSyncing, setIsCodaBoxSyncing] = useState(false);

  const filteredTransactions = transactions.filter(tx => {
    if (filterReconciled === 'unreconciled') return !tx.reconciled;
    if (filterReconciled === 'reconciled') return tx.reconciled;
    return true;
  });

  const unreconciledCount = transactions.filter(t => !t.reconciled).length;

  const handleAutoReconcileAll = () => {
    transactions.forEach(tx => {
      if (!tx.reconciled) {
        if (tx.structuredCommunication) {
          const matchedInv = invoices.find(i => i.structuredCommunication === tx.structuredCommunication);
          if (matchedInv) {
            onReconcileTransaction(tx.id, matchedInv.id, undefined);
            return;
          }
          const matchedExp = purchases.find(p => p.structuredCommunication === tx.structuredCommunication);
          if (matchedExp) {
            onReconcileTransaction(tx.id, undefined, matchedExp.id);
            return;
          }
        }
        if (tx.matchedInvoiceId) {
          onReconcileTransaction(tx.id, tx.matchedInvoiceId, undefined);
        }
      }
    });

    confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const processCodaContent = (rawText: string) => {
    const parsed = parseCODAStatement(rawText);
    const newItems: BankTransaction[] = parsed.transactions.map((t, idx) => ({
      id: `coda-tx-${Date.now()}-${idx}`,
      statementNumber: parsed.statementNumber,
      date: t.valutaDate,
      valutaDate: t.valutaDate,
      amount: t.amount,
      currency: 'EUR',
      counterpartyName: t.counterpartyName || 'Contrepartie CODA',
      counterpartyIban: t.counterpartyIban || 'BE68 0000 0000 0000',
      communication: t.structuredCommunication || t.freeCommunication,
      isStructured: !!t.structuredCommunication,
      structuredCommunication: t.structuredCommunication,
      reconciled: false,
    }));

    onImportCodaTransactions(newItems);
    confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
  };

  const handleSimulateCodaImport = () => {
    processCodaContent(SAMPLE_CODA_FILE_CONTENT);
  };

  const handleCodaBoxSync = async () => {
    setIsCodaBoxSyncing(true);
    try {
      const deliveries = await codaBoxConnector.syncAllAccounts();
      const allTransactions = deliveries.flatMap((d) => d.batch.transactions);
      if (allTransactions.length > 0) {
        onImportCodaTransactions(allTransactions);
      }
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
    } finally {
      setIsCodaBoxSyncing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        processCodaContent(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        processCodaContent(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Standard Febelfin CODA / CAMT.053
            </span>
            <span className="text-xs text-slate-400">Rapprochement Bancaire Belge</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center mt-1">
            <Landmark className="w-6 h-6 mr-2 text-amber-400" />
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {t.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition flex items-center shadow-sm cursor-pointer">
            <Upload className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            <span>Charger Fichier .cod / .xml</span>
            <input
              type="file"
              accept=".cod,.txt,.xml"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <button
            onClick={handleSimulateCodaImport}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-amber-500/40 transition flex items-center shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            <span>Démo Extrait Febelfin</span>
          </button>

          <button
            onClick={handleCodaBoxSync}
            disabled={isCodaBoxSyncing}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 border border-emerald-500/40 hover:border-emerald-500/60 transition flex items-center shadow-sm disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-emerald-400 ${isCodaBoxSyncing ? 'animate-spin' : ''}`} />
            <span>{isCodaBoxSyncing ? 'Synchronisation...' : 'Sync CodaBox (Isabel Group)'}</span>
          </button>

          <button
            onClick={handleAutoReconcileAll}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 transition flex items-center"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5 stroke-[2.5]" />
            {t.matchAllBtn}
          </button>
        </div>
      </div>

      {/* Drag & Drop CODA Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-4 text-center transition ${
          isDragOver 
            ? 'border-amber-500 bg-amber-500/10' 
            : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-center space-x-3 text-xs text-slate-300">
          <FileCode className="w-5 h-5 text-amber-400" />
          <span>
            Glissez-déposez ici votre fichier d'extraits bancaires <strong>CODA Febelfin (.cod)</strong> ou <strong>CAMT.053 XML (PSD2)</strong>
          </span>
        </div>
      </div>

      {/* Info Card / Reconciliation Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-slate-400 block">Total Mouvements bancaires</span>
          <span className="text-xl font-bold font-mono text-white mt-1 block">
            {transactions.length} opérations
          </span>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-slate-400 block">Réconciliés (Match OGM 100%)</span>
          <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
            {transactions.filter(t => t.reconciled).length} opérations
          </span>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-slate-400 block">À rapprocher</span>
          <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
            {unreconciledCount} en attente
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs w-fit">
        <button
          onClick={() => setFilterReconciled('all')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition ${
            filterReconciled === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          Tous ({transactions.length})
        </button>
        <button
          onClick={() => setFilterReconciled('unreconciled')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition ${
            filterReconciled === 'unreconciled' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          Non réconciliés ({unreconciledCount})
        </button>
        <button
          onClick={() => setFilterReconciled('reconciled')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition ${
            filterReconciled === 'reconciled' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          Réconciliés ({transactions.filter(t => t.reconciled).length})
        </button>
      </div>

      {/* Transactions Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5 pl-5">{t.thStatement}</th>
                <th className="p-3.5">{t.thCounterparty}</th>
                <th className="p-3.5">{t.thCommunication}</th>
                <th className="p-3.5 text-right">{t.thAmount}</th>
                <th className="p-3.5 text-center">{t.thMatch}</th>
                <th className="p-3.5 pr-5 text-right">Statut / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                  
                  <td className="p-3.5 pl-5">
                    <div>
                      <span className="font-mono font-bold text-slate-200 block">Extrait #{tx.statementNumber}</span>
                      <span className="text-[10px] text-slate-400">{tx.valutaDate}</span>
                    </div>
                  </td>

                  <td className="p-3.5">
                    <div>
                      <span className="font-semibold text-white block">{tx.counterpartyName}</span>
                      <span className="font-mono text-[10px] text-slate-400">{tx.counterpartyIban}</span>
                    </div>
                  </td>

                  <td className="p-3.5">
                    {tx.structuredCommunication ? (
                      <span className="font-mono font-bold text-amber-300 bg-slate-950 px-2 py-0.5 rounded border border-amber-500/30 text-[11px] inline-block">
                        {tx.structuredCommunication}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">
                        {tx.communication}
                      </span>
                    )}
                  </td>

                  <td className="p-3.5 text-right">
                    <span className={`font-mono font-bold text-sm ${
                      tx.amount > 0 ? 'text-emerald-400' : 'text-slate-200'
                    }`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} €
                    </span>
                  </td>

                  <td className="p-3.5 text-center">
                    {tx.matchedInvoiceId ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                        Facture #{tx.matchedInvoiceId.replace('inv-', '')}
                      </span>
                    ) : tx.matchedExpenseId ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                        Dépense #{tx.matchedExpenseId}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[10px]">—</span>
                    )}
                  </td>

                  <td className="p-3.5 pr-5 text-right">
                    {tx.reconciled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <Check className="w-3 h-3 mr-1" /> RAPPROCHÉ
                      </span>
                    ) : (
                      <button
                        onClick={() => onReconcileTransaction(tx.id, tx.matchedInvoiceId, tx.matchedExpenseId)}
                        className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-sm"
                      >
                        Valider rapprochement
                      </button>
                    )}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

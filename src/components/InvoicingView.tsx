import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Download, 
  Send, 
  CheckCircle2, 
  Copy, 
  Check, 
  Trash2, 
  Edit2, 
  Network, 
  ShieldAlert 
} from 'lucide-react';
import type { Invoice, CompanyProfile, InvoiceStatus } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { generateInvoicePDF } from '../services/pdfGenerator';
import confetti from 'canvas-confetti';

interface InvoicingViewProps {
  invoices: Invoice[];
  company: CompanyProfile;
  lang: Language;
  onNewInvoice: () => void;
  onNewQuote: () => void;
  onNewCreditNote: () => void;
  onEditInvoice: (invoice: Invoice) => void;
  onViewPeppolXml: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onUpdateStatus: (id: string, status: InvoiceStatus) => void;
  onOpenLatePaymentModal: (invoice: Invoice) => void;
}

export const InvoicingView: React.FC<InvoicingViewProps> = ({
  invoices,
  company,
  lang,
  onNewInvoice,
  onNewQuote,
  onNewCreditNote,
  onEditInvoice,
  onViewPeppolXml,
  onDeleteInvoice,
  onUpdateStatus,
  onOpenLatePaymentModal,
}) => {
  const t = translations[lang].invoicing;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [copiedOgm, setCopiedOgm] = useState<string | null>(null);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch = 
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.client.bceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.structuredCommunication.includes(searchTerm);

    const matchesType = filterType === 'all' || inv.type === filterType;
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  const totalInvoiced = invoices
    .filter(i => i.type === 'invoice' && i.status !== 'cancelled')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const totalPaid = invoices
    .filter(i => i.status === 'paid' && i.type === 'invoice')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const totalOutstanding = invoices
    .filter(i => (i.status === 'sent' || i.status === 'peppol_delivered' || i.status === 'overdue') && i.type === 'invoice')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const handleCopyOgm = (ogm: string) => {
    navigator.clipboard.writeText(ogm);
    setCopiedOgm(ogm);
    setTimeout(() => setCopiedOgm(null), 2000);
  };

  const handleSendPeppolDirect = (inv: Invoice) => {
    onUpdateStatus(inv.id, 'peppol_delivered');
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 }
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center">
            <FileText className="w-6 h-6 mr-2 text-amber-400" />
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {t.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onNewQuote}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition"
          >
            + {t.createQuote}
          </button>
          <button
            onClick={onNewCreditNote}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition"
          >
            + {t.createCreditNote}
          </button>
          <button
            onClick={onNewInvoice}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 transition flex items-center"
          >
            <Plus className="w-4 h-4 mr-1 stroke-[3]" />
            {t.createInvoice}
          </button>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-slate-400 font-medium block">Total Facturé TVAC</span>
          <span className="text-xl font-bold font-mono text-white mt-1 block">
            {totalInvoiced.toLocaleString('fr-BE', { minimumFractionDigits: 2 })} €
          </span>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-slate-400 font-medium block">Total Encaissé</span>
          <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
            {totalPaid.toLocaleString('fr-BE', { minimumFractionDigits: 2 })} €
          </span>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-slate-400 font-medium block">En attente de paiement</span>
          <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
            {totalOutstanding.toLocaleString('fr-BE', { minimumFractionDigits: 2 })} €
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tous types (Factures, Devis, Avoirs)</option>
            <option value="invoice">Factures</option>
            <option value="quote">Devis</option>
            <option value="credit_note">Notes de crédit</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">{t.statusAll} statuts</option>
            <option value="draft">{t.statusDraft}</option>
            <option value="sent">{t.statusSent}</option>
            <option value="peppol_delivered">{t.statusPeppol}</option>
            <option value="paid">{t.statusPaid}</option>
            <option value="overdue">{t.statusOverdue}</option>
          </select>

        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5 pl-5">{t.thNumber}</th>
                <th className="p-3.5">{t.thClient}</th>
                <th className="p-3.5">{t.thDate} / {t.thDueDate}</th>
                <th className="p-3.5">{t.thOgm}</th>
                <th className="p-3.5 text-right">{t.thAmount}</th>
                <th className="p-3.5 text-center">{t.thPeppol}</th>
                <th className="p-3.5 text-center">{t.thStatus}</th>
                <th className="p-3.5 pr-5 text-right">{t.thActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                  
                  <td className="p-3.5 pl-5">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-white text-sm">
                        {inv.invoiceNumber}
                      </span>
                      {inv.type === 'quote' && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          DEVIS
                        </span>
                      )}
                      {inv.type === 'credit_note' && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                          AVOIR
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-3.5">
                    <div>
                      <span className="font-semibold text-slate-100 block">{inv.client.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{inv.client.bceNumber}</span>
                    </div>
                  </td>

                  <td className="p-3.5">
                    <div className="space-y-0.5">
                      <span className="text-slate-300 block">{inv.date}</span>
                      <span className="text-[10px] text-slate-500 block">Éch: {inv.dueDate}</span>
                    </div>
                  </td>

                  <td className="p-3.5">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-mono font-bold text-amber-300 bg-slate-950 px-2 py-1 rounded border border-amber-500/20 text-[11px]">
                        {inv.structuredCommunication}
                      </span>
                      <button
                        onClick={() => handleCopyOgm(inv.structuredCommunication)}
                        title="Copier la communication structurée"
                        className="p-1 text-slate-400 hover:text-amber-400 transition"
                      >
                        {copiedOgm === inv.structuredCommunication ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>

                  <td className="p-3.5 text-right font-mono font-extrabold text-white text-sm">
                    {inv.type === 'credit_note' ? '-' : ''}
                    {inv.totalInclVat.toFixed(2)} €
                    <span className="block text-[10px] text-slate-400 font-normal">
                      HT: {inv.subtotalExclVat.toFixed(2)} €
                    </span>
                  </td>

                  <td className="p-3.5 text-center">
                    {inv.peppolStatus?.isSent ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <Network className="w-3 h-3 mr-1" /> Livré
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSendPeppolDirect(inv)}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                        title="Envoyer maintenant via le réseau Peppol"
                      >
                        <Send className="w-2.5 h-2.5 mr-1" /> Envoyer
                      </button>
                    )}
                  </td>

                  <td className="p-3.5 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      inv.status === 'paid' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                      inv.status === 'overdue' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                      inv.status === 'peppol_delivered' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                      inv.status === 'sent' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {inv.status.toUpperCase()}
                    </span>
                  </td>

                  <td className="p-3.5 pr-5 text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      
                      {/* Late payment reminder button if overdue */}
                      {inv.status === 'overdue' && (
                        <button
                          onClick={() => onOpenLatePaymentModal(inv)}
                          title="Générer lettre de rappel / mise en demeure légale belge"
                          className="p-1.5 text-red-400 hover:text-white bg-red-950/40 hover:bg-red-900 border border-red-500/40 rounded-lg transition"
                        >
                          <ShieldAlert className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => generateInvoicePDF(inv, company)}
                        title="Télécharger PDF"
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onViewPeppolXml(inv)}
                        title="Inspecter Peppol UBL 2.1 XML"
                        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                      >
                        <Network className="w-4 h-4" />
                      </button>

                      {inv.status !== 'paid' && (
                        <button
                          onClick={() => onUpdateStatus(inv.id, 'paid')}
                          title="Marquer comme payée"
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => onEditInvoice(inv)}
                        title="Modifier"
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onDeleteInvoice(inv.id)}
                        title="Supprimer"
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

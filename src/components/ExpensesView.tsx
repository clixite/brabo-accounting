import React, { useState } from 'react';
import { 
  Receipt, 
  UploadCloud, 
  Sparkles, 
  Search, 
  CheckCircle2, 
  Trash2
} from 'lucide-react';
import type { PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface ExpensesViewProps {
  purchases: PurchaseExpense[];
  lang: Language;
  onScanExpense: () => void;
  onDeleteExpense: (id: string) => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  purchases,
  lang,
  onScanExpense,
  onDeleteExpense,
}) => {
  const t = translations[lang].expenses;
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filteredPurchases = purchases.filter((exp) => {
    const matchesSearch = 
      exp.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.supplierBce.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.pcmnAccount.includes(searchTerm);

    const matchesCategory = categoryFilter === 'all' || exp.category.includes(categoryFilter);

    return matchesSearch && matchesCategory;
  });

  const totalSpent = purchases.reduce((acc, p) => acc + p.amountInclVat, 0);
  const totalDeductibleBase = purchases.reduce((acc, p) => acc + p.deductibleAmount, 0);
  const totalDeductibleVat = purchases.reduce((acc, p) => acc + p.deductibleVat, 0);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center">
            <Receipt className="w-6 h-6 mr-2 text-amber-400" />
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {t.subtitle}
          </p>
        </div>

        <button
          onClick={onScanExpense}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 transition flex items-center self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5 stroke-[2.5]" />
          {t.scanButton}
        </button>
      </div>

      {/* Smart OCR Dropzone */}
      <div 
        onClick={onScanExpense}
        className="cursor-pointer border-2 border-dashed border-slate-700 hover:border-amber-500/60 bg-slate-900/60 hover:bg-slate-850/80 rounded-2xl p-6 text-center transition group shadow-lg"
      >
        <div className="max-w-md mx-auto space-y-2">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center group-hover:scale-110 transition duration-200">
            <UploadCloud className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">{t.dropzoneTitle}</h3>
          <p className="text-xs text-slate-400">{t.dropzoneSubtitle}</p>
          <div className="flex items-center justify-center space-x-2 pt-2 text-[10px] text-amber-400/80 font-mono">
            <span>✓ OCR Français / Néerlandais</span>
            <span>•</span>
            <span>✓ Vérification BCE Mod97</span>
            <span>•</span>
            <span>✓ Règles déductibilité SPF Finances</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-slate-400 font-medium block">Total Dépenses TVAC</span>
          <span className="text-xl font-bold font-mono text-white mt-1 block">
            {totalSpent.toLocaleString('fr-BE', { minimumFractionDigits: 2 })} €
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-slate-400 font-medium block">Base Déductible Fiscale (ISOC/IPP)</span>
          <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
            {totalDeductibleBase.toLocaleString('fr-BE', { minimumFractionDigits: 2 })} €
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-slate-400 font-medium block">TVA Déductible Récupérable (Grille 59)</span>
          <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
            {totalDeductibleVat.toLocaleString('fr-BE', { minimumFractionDigits: 2 })} €
          </span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par fournisseur, n° BCE ou compte PCMN..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
        >
          <option value="all">Toutes les catégories</option>
          <option value="Télécom">Télécom & Abonnements</option>
          <option value="Véhicule">Véhicules & Déplacements</option>
          <option value="représentation">Restaurant & Réception</option>
          <option value="Matériel">Matériel & Investissements</option>
          <option value="Sociales">Cotisations Sociales</option>
        </select>
      </div>

      {/* Expenses Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5 pl-5">{t.thSupplier}</th>
                <th className="p-3.5">{t.thPcmn}</th>
                <th className="p-3.5">Date / Référence</th>
                <th className="p-3.5 text-right">{t.thBase}</th>
                <th className="p-3.5 text-right">{t.thVat}</th>
                <th className="p-3.5 text-center">{t.thDeductibility}</th>
                <th className="p-3.5 text-right">{t.thDeductibleAmount}</th>
                <th className="p-3.5 text-center">{t.thStatus}</th>
                <th className="p-3.5 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPurchases.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-800/40 transition">
                  
                  {/* Supplier & BCE */}
                  <td className="p-3.5 pl-5">
                    <div>
                      <span className="font-semibold text-white block">{exp.supplierName}</span>
                      <span className="font-mono text-[10px] text-slate-400">{exp.supplierBce}</span>
                    </div>
                  </td>

                  {/* PCMN & Category */}
                  <td className="p-3.5">
                    <div>
                      <span className="font-mono font-bold text-amber-300 text-[11px] block">
                        {exp.pcmnAccount}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[140px] block">
                        {exp.category}
                      </span>
                    </div>
                  </td>

                  {/* Date & Invoice No */}
                  <td className="p-3.5">
                    <div>
                      <span className="text-slate-200 block">{exp.date}</span>
                      <span className="text-[10px] text-slate-500 block font-mono">{exp.invoiceNumber}</span>
                    </div>
                  </td>

                  {/* Base HTVA */}
                  <td className="p-3.5 text-right font-mono font-semibold text-slate-200">
                    {exp.amountExclVat.toFixed(2)} €
                  </td>

                  {/* VAT */}
                  <td className="p-3.5 text-right">
                    <span className="font-mono font-semibold text-amber-400 block">
                      {exp.vatAmount.toFixed(2)} €
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({exp.vatRate}%)
                    </span>
                  </td>

                  {/* Deductibility */}
                  <td className="p-3.5 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                      exp.deductibilityRate === 100 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                      exp.deductibilityRate === 75 ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                      exp.deductibilityRate === 50 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}>
                      {exp.deductibilityRate}%
                    </span>
                  </td>

                  {/* Deductible Amount */}
                  <td className="p-3.5 text-right font-mono font-bold text-emerald-400">
                    {exp.deductibleAmount.toFixed(2)} €
                    <span className="block text-[10px] text-slate-400 font-normal">
                      TVA: {exp.deductibleVat.toFixed(2)} €
                    </span>
                  </td>

                  {/* Status */}
                  <td className="p-3.5 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      <CheckCircle2 className="w-2.5 h-2.5 mr-1 text-emerald-400" />
                      {exp.status.toUpperCase()}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="p-3.5 pr-5 text-right">
                    <button
                      onClick={() => onDeleteExpense(exp.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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

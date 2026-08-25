import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Receipt
} from 'lucide-react';
import type { PurchaseExpense, BelgianVatRate } from '../types/accounting';
import { validateBCE, BELGIAN_PCMN_ACCOUNTS } from '../utils/belgianAccounting';
import confetti from 'canvas-confetti';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: PurchaseExpense) => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose, onSave }) => {
  const [supplierName, setSupplierName] = useState('Proximus SA');
  const [supplierBce, setSupplierBce] = useState('BE 0202.239.951');
  const [invoiceNumber, setInvoiceNumber] = useState('PROX-2026-9912');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amountExclVat, setAmountExclVat] = useState<number>(185.00);
  const [vatRate, setVatRate] = useState<BelgianVatRate>(21);
  const [pcmnAccount, setPcmnAccount] = useState('616100');
  const [category, setCategory] = useState('Télécom & Abonnements Pro');
  const [description, setDescription] = useState('Fibre Pro Bizz + Pack Mobile 5G illimité');
  const [deductibilityRate, setDeductibilityRate] = useState<number>(100);
  const [deductibleVatRate, setDeductibleVatRate] = useState<number>(100);
  const [isScanning, setIsScanning] = useState(false);

  if (!isOpen) return null;

  const vatAmount = Math.round(amountExclVat * (vatRate / 100) * 100) / 100;
  const amountInclVat = Math.round((amountExclVat + vatAmount) * 100) / 100;

  const deductibleAmount = Math.round(amountExclVat * (deductibilityRate / 100) * 100) / 100;
  const nonDeductibleAmount = Math.round((amountExclVat - deductibleAmount) * 100) / 100;

  const deductibleVat = Math.round(vatAmount * (deductibleVatRate / 100) * 100) / 100;
  const nonDeductibleVat = Math.round((vatAmount - deductibleVat) * 100) / 100;

  const loadPreset = (presetType: 'proximus' | 'car' | 'resto' | 'social' | 'apple') => {
    setIsScanning(true);

    setTimeout(() => {
      setIsScanning(false);
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });

      if (presetType === 'proximus') {
        setSupplierName('Proximus SA');
        setSupplierBce('BE 0202.239.951');
        setInvoiceNumber('PROX-2026-9912');
        setAmountExclVat(245.00);
        setVatRate(21);
        setPcmnAccount('616100');
        setCategory('Télécom & Internet');
        setDescription('Abonnement Fibre Bizz & Cartes Sim Pro');
        setDeductibilityRate(100);
        setDeductibleVatRate(100);
      } else if (presetType === 'car') {
        setSupplierName('D\'Ieteren Lease SA');
        setSupplierBce('BE 0403.448.140');
        setInvoiceNumber('DIET-2026-1049');
        setAmountExclVat(850.00);
        setVatRate(21);
        setPcmnAccount('614100');
        setCategory('Véhicule & Leasing');
        setDescription('Loyer leasing mensuel Audi électrique + Carte de recharge');
        setDeductibilityRate(75);
        setDeductibleVatRate(50);
      } else if (presetType === 'resto') {
        setSupplierName('Brasserie Les Brigittines');
        setSupplierBce('BE 0465.123.890');
        setInvoiceNumber('TICKET-BRIG-088');
        setAmountExclVat(140.00);
        setVatRate(12);
        setPcmnAccount('615100');
        setCategory('Frais de représentation & Restaurant');
        setDescription('Repas de travail avec client néerlandophone (50% déductible, TVA non récupérable)');
        setDeductibilityRate(50);
        setDeductibleVatRate(0);
      } else if (presetType === 'social') {
        setSupplierName('Liantis Guichet & Caisse Sociale');
        setSupplierBce('BE 0406.879.803');
        setInvoiceNumber('LIAN-2026-COTIS');
        setAmountExclVat(1520.00);
        setVatRate(0);
        setPcmnAccount('617000');
        setCategory('Cotisations Sociales Indépendant');
        setDescription('Appel trimestriel INASTI / Cotisations sociales Q1 2026');
        setDeductibilityRate(100);
        setDeductibleVatRate(100);
      } else if (presetType === 'apple') {
        setSupplierName('Apple Retail Belgium BV');
        setSupplierBce('BE 0474.965.249');
        setInvoiceNumber('APPL-2026-901');
        setAmountExclVat(2399.00);
        setVatRate(21);
        setPcmnAccount('240000');
        setCategory('Investissement Matériel IT');
        setDescription('MacBook Pro M3 16 pouces pour comptabilité et développement');
        setDeductibilityRate(100);
        setDeductibleVatRate(100);
      }
    }, 600);
  };

  const bceVal = validateBCE(supplierBce);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newExpense: PurchaseExpense = {
      id: 'exp-' + Date.now(),
      supplierName,
      supplierBce: bceVal.isValid ? bceVal.formatted : supplierBce,
      invoiceNumber,
      date,
      dueDate: date,
      category,
      pcmnAccount,
      description,
      amountExclVat,
      vatRate,
      vatAmount,
      amountInclVat,
      deductibilityRate,
      deductibleVatRate,
      deductibleAmount,
      nonDeductibleAmount,
      deductibleVat,
      nonDeductibleVat,
      status: 'approved',
      ocrConfidence: 98.8,
      ocrExtractedData: {
        supplierRecognized: true,
        vatDetected: vatAmount,
        bceValidated: bceVal.isValid,
      }
    };

    onSave(newExpense);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Scanner / Saisir une dépense professionnelle</h2>
              <p className="text-xs text-slate-400">Extraction OCR & règles de déductibilité fiscale belge</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-sm">
          
          {/* Preset Buttons for Quick Demo */}
          <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center">
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                Simulateur OCR IA (Reçus belges types) :
              </span>
              {isScanning && (
                <span className="text-xs text-amber-400 animate-pulse font-mono">
                  Analyse OCR en cours...
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => loadPreset('proximus')}
                className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-amber-500/40 transition"
              >
                📡 Proximus (100%)
              </button>
              <button
                type="button"
                onClick={() => loadPreset('car')}
                className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-amber-500/40 transition"
              >
                🚗 D'Ieteren Auto (75% / TVA 50%)
              </button>
              <button
                type="button"
                onClick={() => loadPreset('resto')}
                className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-amber-500/40 transition"
              >
                🍽️ Restaurant (50% / TVA 0%)
              </button>
              <button
                type="button"
                onClick={() => loadPreset('social')}
                className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-amber-500/40 transition"
              >
                🏛️ Liantis INASTI (100% Exonéré)
              </button>
              <button
                type="button"
                onClick={() => loadPreset('apple')}
                className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-amber-500/40 transition"
              >
                💻 Apple Matériel (100% Immo)
              </button>
            </div>
          </div>

          {/* Supplier Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Fournisseur</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">N° d'entreprise BCE (Fournisseur)</label>
              <input
                type="text"
                value={supplierBce}
                onChange={(e) => setSupplierBce(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
              />
              {bceVal.isValid ? (
                <span className="text-[10px] text-emerald-400 mt-0.5 block">✓ BCE Mod97 vérifié</span>
              ) : (
                <span className="text-[10px] text-amber-400 mt-0.5 block">{bceVal.error}</span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">N° Facture / Référence ticket</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Date de la dépense</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* PCMN & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Imputation comptable (PCMN Belge)</label>
              <select
                value={pcmnAccount}
                onChange={(e) => {
                  setPcmnAccount(e.target.value);
                  const found = BELGIAN_PCMN_ACCOUNTS.find(a => a.code === e.target.value);
                  if (found) {
                    if (found.deduct !== undefined) setDeductibilityRate(found.deduct);
                    if (found.vat !== undefined) setVatRate(found.vat as BelgianVatRate);
                  }
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {BELGIAN_PCMN_ACCOUNTS.filter(a => a.code.startsWith('6') || a.code.startsWith('2')).map(a => (
                  <option key={a.code} value={a.code}>
                    {a.code} - {a.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Libellé / Objet</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Financials */}
          <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-300 block">
              Calcul de la TVA & Déductibilité Fiscale Belge
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Montant HTVA (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={amountExclVat}
                  onChange={(e) => setAmountExclVat(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Taux TVA Belge</label>
                <select
                  value={vatRate}
                  onChange={(e) => setVatRate(parseInt(e.target.value, 10) as BelgianVatRate)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value={21}>21% - Taux Normal</option>
                  <option value={12}>12% - Taux Réduit</option>
                  <option value={6}>6% - Taux Réduit (Alimentation)</option>
                  <option value={0}>0% - Taux Zéro / Exonéré</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Déductibilité Fiscale (%)</label>
                <select
                  value={deductibilityRate}
                  onChange={(e) => setDeductibilityRate(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-bold"
                >
                  <option value={100}>100% (Frais 100% Pro)</option>
                  <option value={75}>75% (Frais de voiture/carburant)</option>
                  <option value={50}>50% (Restaurant d'affaires)</option>
                  <option value={0}>0% (Amendes, non déductible)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-700 text-xs">
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">TVA totale</span>
                <span className="font-mono font-bold text-white">{vatAmount.toFixed(2)} €</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">TVA déductible (Grille 59)</span>
                <span className="font-mono font-bold text-emerald-400">{deductibleVat.toFixed(2)} €</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Base déductible IPP/ISOC</span>
                <span className="font-mono font-bold text-emerald-400">{deductibleAmount.toFixed(2)} €</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Total TTC / TVAC</span>
                <span className="font-mono font-bold text-amber-400">{amountInclVat.toFixed(2)} €</span>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
            >
              Enregistrer la dépense
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

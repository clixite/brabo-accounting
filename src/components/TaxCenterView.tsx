import React, { useState } from 'react';
import { 
  Calculator, 
  Download, 
  Users, 
  PiggyBank,
  Building,
  Car,
  FileText
} from 'lucide-react';
import type { CompanyProfile, Invoice, PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { 
  calculateVatGrids, 
  generateAnnualClientListing, 
  generateIntervatClientListingXML,
  simulateBelgianSocialContributions 
} from '../utils/belgianAccounting';
import { generateBelcotaxXml, downloadBelcotaxFile } from '../services/belcotaxGenerator';
import confetti from 'canvas-confetti';

interface TaxCenterViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  lang: Language;
}

export const TaxCenterView: React.FC<TaxCenterViewProps> = ({
  company,
  invoices,
  purchases,
  lang,
}) => {
  const t = translations[lang].taxCenter;
  const [activeTab, setActiveTab] = useState<'vat' | 'listing' | 'social' | 'isoc' | 'atn'>('vat');
  const [selectedPeriod, setSelectedPeriod] = useState('2026-Q1');
  const [netIncomeInput, setNetIncomeInput] = useState<number>(68000);

  const [isocTaxableProfit, setIsocTaxableProfit] = useState<number>(85000);
  const [hasDirectorRemuneration45k, setHasDirectorRemuneration45k] = useState<boolean>(true);

  const [carCatalogValue, setCarCatalogValue] = useState<number>(55000);
  const [carCo2, setCarCo2] = useState<number>(0);
  const [carFuelType, setCarFuelType] = useState<'electric' | 'petrol' | 'diesel'>('electric');
  const [carAgeMonths, setCarAgeMonths] = useState<number>(6);

  const vatDeclaration = calculateVatGrids(invoices, purchases, selectedPeriod);
  const clientListing = generateAnnualClientListing(invoices, 2026);
  const socialSimulation = simulateBelgianSocialContributions(netIncomeInput);

  const isSmeEligible = hasDirectorRemuneration45k;
  let isocTaxAmount = 0;
  if (isSmeEligible) {
    if (isocTaxableProfit <= 100000) {
      isocTaxAmount = isocTaxableProfit * 0.20;
    } else {
      isocTaxAmount = (100000 * 0.20) + ((isocTaxableProfit - 100000) * 0.25);
    }
  } else {
    isocTaxAmount = isocTaxableProfit * 0.25;
  }
  const isocStandardTax = isocTaxableProfit * 0.25;
  const isocSavings = Math.max(0, isocStandardTax - isocTaxAmount);

  const refCo2Petrol = 91;
  const refCo2Diesel = 71;
  let co2Percentage = 5.5;
  if (carFuelType === 'electric') {
    co2Percentage = 4.0;
  } else if (carFuelType === 'petrol') {
    co2Percentage = 5.5 + (carCo2 - refCo2Petrol) * 0.1;
  } else {
    co2Percentage = 5.5 + (carCo2 - refCo2Diesel) * 0.1;
  }
  co2Percentage = Math.min(18.0, Math.max(4.0, co2Percentage));

  let ageMultiplier = 1.0;
  if (carAgeMonths > 60) ageMultiplier = 0.70;
  else if (carAgeMonths > 48) ageMultiplier = 0.76;
  else if (carAgeMonths > 36) ageMultiplier = 0.82;
  else if (carAgeMonths > 24) ageMultiplier = 0.88;
  else if (carAgeMonths > 12) ageMultiplier = 0.94;

  const rawAnnualAtn = (carCatalogValue * ageMultiplier) * (co2Percentage / 100) * (6 / 7);
  const minAtn2026 = 1600.00;
  const finalAnnualAtn = Math.max(minAtn2026, rawAnnualAtn);
  const monthlyAtn = finalAnnualAtn / 12;

  const handleDownloadIntervatListing = () => {
    const xml = generateIntervatClientListingXML(2026, clientListing, company);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `INTERVAT_ClientListing_${company.vatNumber}_2026.xml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
  };

  const handleDownloadBelcotax = () => {
    const file = generateBelcotaxXml({
      ficheType: '281.50',
      incomeYear: 2026,
      declarant: company,
      beneficiaries: [
        {
          identificationNumber: '82010112345',
          lastName: 'Simon',
          firstName: 'Nicolas',
          street: 'Avenue Louise',
          number: '240',
          postalCode: '1050',
          city: 'Bruxelles',
          country: 'Belgique',
          amount: 4500.00,
          withholdingTax: 0,
          description: 'Honoraires de consultance IT indépendant',
        },
      ],
    });
    downloadBelcotaxFile(file);
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              SPF Finances / FOD Financiën
            </span>
            <span className="text-xs text-slate-400">Portail Intervat, ISOC, ATN & INASTI</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center mt-1">
            <Calculator className="w-6 h-6 mr-2 text-amber-400" />
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {t.subtitle}
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs gap-1">
          <button
            onClick={() => setActiveTab('vat')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'vat' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            TVA (Grilles 00-72)
          </button>
          <button
            onClick={() => setActiveTab('listing')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'listing' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Listing Clients
          </button>
          <button
            onClick={() => setActiveTab('social')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'social' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            INASTI & PLCI
          </button>
          <button
            onClick={() => setActiveTab('isoc')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'isoc' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            ISOC (20%/25%)
          </button>
          <button
            onClick={() => setActiveTab('atn')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'atn' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            ATN Voiture
          </button>
        </div>
      </div>

      {/* TAB 1: VAT RETURN */}
      {activeTab === 'vat' && (
        <div className="space-y-6">
          
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-xs text-slate-400 block font-medium">Période de déclaration :</span>
              <div className="flex items-center space-x-3 mt-1">
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                >
                  <option value="2026-Q1">1er Trimestre 2026 (Jan - Mar)</option>
                  <option value="2026-Q2">2ème Trimestre 2026 (Avr - Jun)</option>
                  <option value="2026-Q3">3ème Trimestre 2026 (Jul - Sep)</option>
                  <option value="2026-Q4">4ème Trimestre 2026 (Oct - Déc)</option>
                </select>
                <span className="text-xs text-slate-400">Échéance de dépôt : 20 Avril 2026</span>
              </div>
            </div>

            <div className={`px-5 py-3 rounded-xl border text-right ${
              vatDeclaration.grid71 > 0 
                ? 'bg-amber-950/40 border-amber-500/40' 
                : 'bg-emerald-950/40 border-emerald-500/40'
            }`}>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                {vatDeclaration.grid71 > 0 ? 'Solde à payer à l\'État (Grille 71)' : 'Solde à récupérer (Grille 72)'}
              </span>
              <span className="text-2xl font-mono font-black text-amber-300">
                {(vatDeclaration.grid71 > 0 ? vatDeclaration.grid71 : vatDeclaration.grid72).toFixed(2)} €
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <div className="space-y-6">
              
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                  {t.cadreSales}
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [00] — Opérations au taux de 0%</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid00.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [01] — Opérations au taux de 6%</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid01.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [02] — Opérations au taux de 12%</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid02.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/70 p-2.5 rounded-lg border border-amber-500/30">
                    <span className="text-amber-200 font-semibold">Grille [03] — Opérations au taux de 21%</span>
                    <span className="font-mono font-extrabold text-amber-300">{vatDeclaration.grid03.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [44] — Services Intracommunautaires (Art. 21 §2)</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid44.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [45] — Opérations Cocontractant (Art. 20)</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid45.toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                  {t.cadreDueVat}
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center bg-slate-800/70 p-2.5 rounded-lg border border-amber-500/30">
                    <span className="text-amber-200 font-semibold">Grille [54] — TVA due sur opérations des grilles 01, 02, 03</span>
                    <span className="font-mono font-extrabold text-amber-300">{vatDeclaration.grid54.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [55] — TVA due sur acquisitions intracommunautaires</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid55.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [56] — TVA due sur opérations cocontractant</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid56.toFixed(2)} €</span>
                  </div>
                </div>
              </div>

            </div>

            <div className="space-y-6">
              
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                  {t.cadrePurchases}
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [81] — Marchandises, matières premières (PCMN 60)</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid81.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [82] — Services et biens divers (PCMN 61)</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid82.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-300">Grille [83] — Biens d'investissement (PCMN 2x)</span>
                    <span className="font-mono font-bold text-white">{vatDeclaration.grid83.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/70 p-2.5 rounded-lg border border-emerald-500/30">
                    <span className="text-emerald-300 font-bold">Grille [59] — Total TVA Déductible</span>
                    <span className="font-mono font-extrabold text-emerald-400">{vatDeclaration.grid59.toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                  {t.cadreBalance}
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-850 rounded-xl border border-slate-700/60 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-white block">Grille [71] — TVA due à l'État</span>
                      <span className="text-[10px] text-slate-400">Total taxes dues [54+55+56] - TVA déductible [59]</span>
                    </div>
                    <span className="font-mono text-lg font-black text-amber-400">{vatDeclaration.grid71.toFixed(2)} €</span>
                  </div>

                  <div className="p-3 bg-slate-850 rounded-xl border border-slate-700/60 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-white block">Grille [72] — TVA à récupérer par l'assujetti</span>
                      <span className="text-[10px] text-slate-400">Excédent de taxe déductible reporté</span>
                    </div>
                    <span className="font-mono text-lg font-black text-emerald-400">{vatDeclaration.grid72.toFixed(2)} €</span>
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* TAB 2: CLIENT LISTING */}
      {activeTab === 'listing' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center">
                  <Users className="w-5 h-5 mr-2 text-amber-400" />
                  Listing Annuel des Clients Assujettis (Année 2026)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Seuls les clients belges assujettis avec un chiffre d'affaires supérieur à <strong className="text-white">250,00 € HTVA</strong> sont repris (Obligation légale SPF Finances).
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleDownloadIntervatListing}
                  className="inline-flex items-center px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition self-start sm:self-auto"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  {t.generateIntervatXml}
                </button>

                <button
                  onClick={handleDownloadBelcotax}
                  className="inline-flex items-center px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-blue-500/40 transition self-start sm:self-auto"
                >
                  <FileText className="w-4 h-4 mr-1.5 text-blue-400" />
                  Fiche 281.50 (Belcotax)
                </button>
              </div>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3 pl-4">N° BCE / TVA</th>
                    <th className="p-3">Raison Sociale</th>
                    <th className="p-3">Localité</th>
                    <th className="p-3 text-center">Factures</th>
                    <th className="p-3 text-right">CA Total HTVA</th>
                    <th className="p-3 pr-4 text-right">TVA Facturée</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {clientListing.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="p-3 pl-4 font-mono text-amber-400 font-semibold">{item.clientBce}</td>
                      <td className="p-3 font-semibold text-white">{item.clientName}</td>
                      <td className="p-3 text-slate-400">{item.postalCode} {item.city}</td>
                      <td className="p-3 text-center font-mono">{item.invoiceCount}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">{item.totalTurnoverExclVat.toFixed(2)} €</td>
                      <td className="p-3 pr-4 text-right font-mono font-bold text-amber-300">{item.totalVatCharged.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 text-xs">
              <span className="font-semibold text-slate-300">
                Total clients assujettis déclarés : <strong className="text-white">{clientListing.length}</strong>
              </span>
              <div className="space-x-4">
                <span className="text-slate-400">Total CA : <strong className="font-mono text-white text-sm">{clientListing.reduce((a, c) => a + c.totalTurnoverExclVat, 0).toFixed(2)} €</strong></span>
                <span className="text-slate-400">Total TVA : <strong className="font-mono text-amber-400 text-sm">{clientListing.reduce((a, c) => a + c.totalVatCharged, 0).toFixed(2)} €</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SOCIAL CONTRIBUTIONS */}
      {activeTab === 'social' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center">
                  <PiggyBank className="w-5 h-5 mr-2 text-amber-400" />
                  Simulateur Cotisations Sociales Belges & Optimisation PLCI / VAPZ
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Barèmes officiels INASTI / RSVZ 2026 (20,50% jusqu'au 1er plafond, 14,16% jusqu'au 2ème).
                </p>
              </div>
            </div>

            <div className="bg-slate-800/60 p-5 rounded-xl border border-slate-700/60 space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-200">
                  Revenu net imposable annuel estimé (€) :
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={netIncomeInput}
                    onChange={(e) => setNetIncomeInput(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1 text-sm font-mono font-bold text-amber-400 text-right"
                  />
                  <span className="text-xs text-slate-400">€/an</span>
                </div>
              </div>

              <input
                type="range"
                min="10000"
                max="150000"
                step="1000"
                value={netIncomeInput}
                onChange={(e) => setNetIncomeInput(parseInt(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Cotisation Trimestrielle</span>
                <span className="text-xl font-mono font-extrabold text-amber-400 mt-1 block">
                  {socialSimulation.totalQuarterlyPayment.toFixed(2)} €
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Inclut frais de gestion caisse (3.05%)
                </span>
              </div>

              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Cotisation Annuelle Totale</span>
                <span className="text-xl font-mono font-extrabold text-white mt-1 block">
                  {socialSimulation.totalAnnualPayment.toFixed(2)} €
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  100% déductible comme charge pro
                </span>
              </div>

              <div className="bg-slate-850 p-4 rounded-xl border border-emerald-500/30">
                <span className="text-emerald-300 block text-[10px] uppercase font-bold">Plafond PLCI / VAPZ Max (8.17%)</span>
                <span className="text-xl font-mono font-extrabold text-emerald-400 mt-1 block">
                  {socialSimulation.vapzMaxDeductible.toFixed(2)} €
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Pension complémentaire défiscalisée
                </span>
              </div>

              <div className="bg-slate-850 p-4 rounded-xl border border-emerald-500/30">
                <span className="text-emerald-300 block text-[10px] uppercase font-bold">Économie d'impôt IPP estimée</span>
                <span className="text-xl font-mono font-extrabold text-emerald-300 mt-1 block">
                  ~ {socialSimulation.taxShieldSavingsEstimate.toFixed(2)} €
                </span>
                <span className="text-[10px] text-emerald-400/80 mt-1 block">
                  À la tranche marginale belge de 53.5%
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/60 text-xs text-slate-300 space-y-1">
              <span className="font-bold text-amber-300 block">💡 Conseil d'optimisation fiscale belge :</span>
              <p className="leading-relaxed">
                Verser le montant maximum de votre PLCI (VAPZ) permet non seulement de réduire votre base imposable à l'impôt des personnes physiques (tranche marginale de 50% + taxes communales), mais diminue également l'assiette de calcul de vos futures cotisations sociales de l'année N+3.
              </p>
            </div>

          </div>
        </div>
      )}

      {/* TAB 4: ISOC CORPORATE TAX SIMULATOR */}
      {activeTab === 'isoc' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center">
                  <Building className="w-5 h-5 mr-2 text-amber-400" />
                  Simulateur Impôt des Sociétés (ISOC / VenB) & Taux Réduit PME (20%)
                </h3>
                <p className="text-slate-400 mt-1">
                  Article 215 du CIR 92 : Taux réduit de 20% sur la 1ère tranche de 100.000 € de bénéfice réservé aux PME.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-800/60 p-5 rounded-xl border border-slate-700/60">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Bénéfice imposable de la société (€) :</label>
                <input
                  type="number"
                  value={isocTaxableProfit}
                  onChange={(e) => setIsocTaxableProfit(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-3 pt-6">
                <input
                  type="checkbox"
                  id="dirSalary"
                  checked={hasDirectorRemuneration45k}
                  onChange={(e) => setHasDirectorRemuneration45k(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
                <label htmlFor="dirSalary" className="text-slate-300 cursor-pointer">
                  <strong className="text-white">Rémunération dirigeant ≥ 45.000 €</strong> (Condition légale taux réduit 20%)
                </label>
              </div>
            </div>

            {/* ISOC Comparison Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Impôt Société Dû (ISOC)</span>
                <span className="text-2xl font-mono font-black text-amber-400 mt-1 block">
                  {isocTaxAmount.toFixed(2)} €
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Taux effectif : {((isocTaxAmount / (isocTaxableProfit || 1)) * 100).toFixed(1)}%
                </span>
              </div>

              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Bénéfice Net Après ISOC</span>
                <span className="text-2xl font-mono font-black text-emerald-400 mt-1 block">
                  {(isocTaxableProfit - isocTaxAmount).toFixed(2)} €
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Disponible pour dividendes VVPR-bis
                </span>
              </div>

              <div className="bg-slate-850 p-4 rounded-xl border border-emerald-500/30">
                <span className="text-emerald-300 block text-[10px] uppercase font-bold">Économie Taux Réduit PME (20%)</span>
                <span className="text-2xl font-mono font-black text-emerald-300 mt-1 block">
                  {isocSavings.toFixed(2)} €
                </span>
                <span className="text-[10px] text-emerald-400/80 mt-1 block">
                  Par rapport au taux standard de 25%
                </span>
              </div>
            </div>

            {/* Dividend regimes comparison */}
            <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-3">
              <span className="font-bold text-amber-300 block">📊 Comparatif Régimes de Distribution de Dividendes :</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="font-bold text-emerald-400 block">VVPR-bis (15% précompte)</span>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sociétés constituées après le 01/07/2013 avec actions nominatives nouvelles libérées (dividende de l'année N+3).
                  </p>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="font-bold text-blue-400 block">Réserve de Liquidation (10% + 5%)</span>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Constitution immédiate à 10% + distribution après 5 ans d'attente à 5% de précompte mobilier.
                  </p>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="font-bold text-slate-400 block">Dividende Ordinaire (30%)</span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Taux standard belge sans condition particulière de délai ou de capital.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* TAB 5: ATN CAR SIMULATOR */}
      {activeTab === 'atn' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center">
                  <Car className="w-5 h-5 mr-2 text-amber-400" />
                  Simulateur Avantage de Toute Nature (ATN / VAA) Voiture de Société
                </h3>
                <p className="text-slate-400 mt-1">
                  Formule fiscale officielle belge : Valeur catalogue × Coeff. âge × % CO2 × 6/7 (Minimum 1.600 € / an).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-800/60 p-5 rounded-xl border border-slate-700/60">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Prix Catalogue TVAC (€)</label>
                <input
                  type="number"
                  value={carCatalogValue}
                  onChange={(e) => setCarCatalogValue(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Motorisation</label>
                <select
                  value={carFuelType}
                  onChange={(e) => {
                    const f = e.target.value as any;
                    setCarFuelType(f);
                    if (f === 'electric') setCarCo2(0);
                    else if (f === 'petrol') setCarCo2(115);
                    else setCarCo2(95);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value="electric">100% Électrique (CO2 = 0g)</option>
                  <option value="petrol">Essence / Hybride</option>
                  <option value="diesel">Diesel</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Émissions CO2 (g/km)</label>
                <input
                  type="number"
                  disabled={carFuelType === 'electric'}
                  value={carCo2}
                  onChange={(e) => setCarCo2(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-sm disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Âge du véhicule (mois)</label>
                <input
                  type="number"
                  value={carAgeMonths}
                  onChange={(e) => setCarAgeMonths(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-sm"
                />
              </div>
            </div>

            {/* ATN Results */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">ATN Mensuel Imposable</span>
                <span className="text-2xl font-mono font-black text-amber-400 mt-1 block">
                  {monthlyAtn.toFixed(2)} € / mois
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Ajouté à la fiche de paie 281.20 / 281.10
                </span>
              </div>

              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">ATN Annuel Total</span>
                <span className="text-2xl font-mono font-black text-white mt-1 block">
                  {finalAnnualAtn.toFixed(2)} € / an
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Taux CO2 appliqué : {co2Percentage.toFixed(1)}%
                </span>
              </div>

              <div className="bg-slate-850 p-4 rounded-xl border border-emerald-500/30">
                <span className="text-emerald-300 block text-[10px] uppercase font-bold">Déductibilité Fiscale Véhicule</span>
                <span className="text-2xl font-mono font-black text-emerald-400 mt-1 block">
                  {carFuelType === 'electric' ? '100% Déductible' : '50% à 75%'}
                </span>
                <span className="text-[10px] text-emerald-400/80 mt-1 block">
                  Frais déductibles dans la société
                </span>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

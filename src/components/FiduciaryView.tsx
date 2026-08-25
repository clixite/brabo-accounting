import React, { useState } from 'react';
import { 
  UserCheck, 
  ShieldCheck, 
  Download, 
  Send, 
  MessageSquare, 
  CheckCircle2,
  Scale
} from 'lucide-react';
import type { CompanyProfile, Invoice, PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { exportFiduciaryPackage, downloadFiduciaryPackage } from '../services/fiduciaryBridge';
import type { FiduciaryFormat } from '../services/fiduciaryBridge';
import confetti from 'canvas-confetti';

interface FiduciaryViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  lang: Language;
}

export const FiduciaryView: React.FC<FiduciaryViewProps> = ({
  company,
  invoices,
  purchases,
  lang,
}) => {
  const t = translations[lang].fiduciary;
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [messages, setMessages] = useState<{
    id: string;
    sender: 'accountant' | 'client';
    senderName: string;
    text: string;
    time: string;
  }[]>([
    {
      id: 'm-1',
      sender: 'accountant',
      senderName: 'Fiduciaire Flagey (Marc Vandevelde, ITAA)',
      text: 'Bonjour ! J\'ai bien validé vos écritures de ventes de janvier 2026. N\'oubliez pas d\'imputer le ticket de restaurant Le Cirio en 50% déductible.',
      time: 'Hier, 16:45',
    },
    {
      id: 'm-2',
      sender: 'client',
      senderName: 'Vous (Brabo Solutions)',
      text: 'Bonjour Marc, c\'est fait ! Le compte PCMN 615100 a été correctement renseigné avec la TVA non récupérable.',
      time: 'Aujourd\'hui, 09:12',
    }
  ]);
  const [newMessage, setNewMessage] = useState('');

  const handleExportSoftware = (format: 'bob' | 'winbooks' | 'horus' | 'exact' | 'full') => {
    const formatMap: Record<typeof format, FiduciaryFormat> = {
      bob: 'sage_bob50',
      winbooks: 'winbooks',
      horus: 'horus',
      exact: 'exact_online',
      full: 'full_bundle',
    };

    try {
      const pkg = exportFiduciaryPackage(invoices, purchases, company, formatMap[format], {
        fiscalYear: new Date().getFullYear(),
        includeMasterData: true,
      });

      downloadFiduciaryPackage(pkg);
      setExportSuccess(`Dossier fiduciaire ${pkg.files.length} fichier(s) généré(s) et vérifié(s) (partie double équilibrée) !`);
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setExportSuccess(`⚠️ Export bloqué : ${message}`);
    }
    setTimeout(() => setExportSuccess(null), 5000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const msg = {
      id: 'm-' + Date.now(),
      sender: 'client' as const,
      senderName: 'Vous',
      text: newMessage,
      time: 'À l\'instant',
    };

    setMessages([...messages, msg]);
    setNewMessage('');
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Institut des Conseillers Fiscaux et Experts-Comptables (ITAA)
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center mt-1">
            <UserCheck className="w-6 h-6 mr-2 text-amber-400" />
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {t.subtitle}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center text-slate-300">
            <ShieldCheck className="w-4 h-4 mr-2 text-emerald-400" />
            <span>N° Agrément ITAA : <strong className="text-amber-400 font-mono">{company.fiduciaryItaaNumber}</strong></span>
          </div>
        </div>
      </div>

      {/* Fiduciary Profile Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-blue-500/20">
            FF
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white">{company.fiduciaryName}</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Connecté en direct
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Contact référent : <strong className="text-slate-300">expert@fiduciaire-flagey.be</strong> • Révision trimestrielle TVA & Clôture annuelle
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button 
            onClick={() => handleExportSoftware('bob')}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
          >
            {t.exportBob}
          </button>
          <button 
            onClick={() => handleExportSoftware('winbooks')}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
          >
            {t.exportWinbooks}
          </button>
          <button 
            onClick={() => handleExportSoftware('horus')}
            className="px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold transition"
          >
            {t.exportHorus}
          </button>
          <button 
            onClick={() => handleExportSoftware('full')}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
          >
            Bundle complet (tous formats)
          </button>
        </div>
      </div>

      {exportSuccess && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center space-x-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{exportSuccess}</span>
        </div>
      )}

      {/* Collaboration Chat & Document Exchange */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chat / Queries */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-[460px]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center">
              <MessageSquare className="w-4 h-4 mr-2 text-amber-400" />
              Fil de discussion direct & Questions Pièces Comptables
            </h3>
            <span className="text-[11px] text-emerald-400 font-mono">En ligne</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1 text-xs">
            {messages.map((m) => {
              const isClient = m.sender === 'client';
              return (
                <div key={m.id} className={`flex flex-col ${isClient ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center space-x-1.5 mb-1">
                    <span className="font-semibold text-slate-300">{m.senderName}</span>
                    <span className="text-[10px] text-slate-500">{m.time}</span>
                  </div>
                  <div className={`p-3 rounded-2xl max-w-md ${
                    isClient 
                      ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-none' 
                      : 'bg-slate-800 text-slate-200 border border-slate-700/60 rounded-tl-none'
                  }`}>
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSendMessage} className="flex gap-2 pt-3 border-t border-slate-800">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Poser une question à votre expert-comptable ITAA..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 transition flex items-center"
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              Envoyer
            </button>
          </form>
        </div>

        {/* Fiduciary Tools & Verification Checklist */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 text-xs">
          <h3 className="text-sm font-bold text-white flex items-center border-b border-slate-800 pb-3">
            <ShieldCheck className="w-4 h-4 mr-2 text-emerald-400" />
            Checklist Clôture Trimestrielle Q1
          </h3>

          <div className="space-y-2.5">
            <div className="flex items-center space-x-2 text-slate-300 p-2 rounded-lg bg-slate-800/40">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Toutes les factures de ventes transmises en Peppol UBL</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-300 p-2 rounded-lg bg-slate-800/40">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Dépenses catégorisées selon le PCMN belge</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-300 p-2 rounded-lg bg-slate-800/40">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Extraits CODA réconciliés par OGM Modulo 97</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-300 p-2 rounded-lg bg-slate-800/40">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Calcul prévisionnel grille 71 TVA validé</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800">
            <button
              onClick={() => handleExportSoftware('exact')}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Exporter Exact Online (CSV/XML)</span>
            </button>

            <button
              onClick={() => handleExportSoftware('full')}
              className="w-full mt-2 py-2 px-3 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
            >
              <Scale className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dossier Fiduciaire Complet (Vérifié Partie Double)</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};

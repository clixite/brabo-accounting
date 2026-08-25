import React from 'react';
import { ShieldCheck, Building2, Globe, Plus, Sparkles, CheckCircle2 } from 'lucide-react';
import type { CompanyProfile } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface HeaderProps {
  company: CompanyProfile;
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  onNewInvoice: () => void;
  onScanExpense: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  company,
  lang,
  onLanguageChange,
  onNewInvoice,
  onScanExpense,
}) => {
  const t = translations[lang];

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-lg">
      <div className="h-1 w-full grid grid-cols-3">
        <div className="bg-slate-950" />
        <div className="bg-amber-400" />
        <div className="bg-red-600" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Logo */}
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-red-600 text-white font-black text-xl shadow-md shadow-amber-500/20 ring-2 ring-amber-400/30">
              B
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-amber-200 bg-clip-text text-transparent">
                  {t.appTitle}
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  BE 2026
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                {t.appSubtitle}
              </p>
            </div>
          </div>

          {/* Center Info: Fiduciary ITAA link */}
          <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="text-left">
              <span className="text-slate-400 block text-[10px] leading-tight">Fiduciaire ITAA Connectée</span>
              <span className="font-semibold text-slate-200">{company.fiduciaryName.split('(')[0]}</span>
            </div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Sync Live
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onScanExpense}
              className="hidden md:inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition shadow-sm"
              title="Scanner un ticket ou reçu avec l'OCR belge"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              Scan OCR
            </button>

            <button
              onClick={onNewInvoice}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition shadow-md shadow-amber-500/20 font-bold"
            >
              <Plus className="w-4 h-4 mr-1 stroke-[3]" />
              {t.invoicing.createInvoice}
            </button>

            {/* Language Selector */}
            <div className="relative flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              <Globe className="w-3.5 h-3.5 ml-2 text-slate-400" />
              <select
                value={lang}
                onChange={(e) => onLanguageChange(e.target.value as Language)}
                className="bg-transparent text-xs text-slate-200 font-medium pl-1.5 pr-2 py-1 outline-none cursor-pointer"
              >
                <option value="fr" className="bg-slate-800 text-white">FR (Belgique)</option>
                <option value="nl" className="bg-slate-800 text-white">NL (België)</option>
                <option value="en" className="bg-slate-800 text-white">EN (Belgium)</option>
              </select>
            </div>

            {/* Company Badge */}
            <div className="hidden sm:flex items-center space-x-2 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="text-left text-xs">
                <div className="font-semibold text-slate-200 leading-tight truncate max-w-[120px]">{company.name}</div>
                <div className="text-[10px] text-amber-400 font-mono">{company.bceNumber}</div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};

import { useState } from 'react';
import { Briefcase, Wallet, TrendingDown, TrendingUp } from 'lucide-react';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { computePayroll } from '../services/payroll';

const eur = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

/**
 * Client-side Belgian payroll simulator (brut → net + coût employeur).
 * Planning tool — not a substitute for a certified social secretariat.
 */
export function PayrollView({ lang }: { lang: Language }) {
  const t = translations[lang].payroll;
  const [gross, setGross] = useState(3500);
  const payroll = computePayroll(gross);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-wider uppercase mb-1">
          <Briefcase className="h-4 w-4" /> Paie & charges sociales
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{t.title}</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">{t.subtitle}</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-200">{t.gross}</label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="number"
              value={gross}
              onChange={(e) => setGross(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-36 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-amber-300"
            />
            <input
              type="range"
              min="1500"
              max="10000"
              step="100"
              value={gross}
              onChange={(e) => setGross(parseInt(e.target.value))}
              className="flex-1 accent-amber-500 cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-center">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-500">Brut mensuel</div>
            <div className="font-mono font-bold text-slate-100">{eur.format(payroll.grossMonthly)}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-500">ONSS employé (13,07 %)</div>
            <div className="font-mono font-bold text-red-400">{eur.format(payroll.employeeOnss)}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-500">Précompte professionnel</div>
            <div className="font-mono font-bold text-red-400">{eur.format(payroll.withholdingTax)}</div>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-3">
            <div className="text-[10px] uppercase text-emerald-400">{t.net}</div>
            <div className="font-mono font-black text-emerald-300">{eur.format(payroll.netMonthly)}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-500">ONSS employeur (25 %)</div>
            <div className="font-mono font-bold text-red-400">{eur.format(payroll.employerOnss)}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-500">{t.employerCost}</div>
            <div className="font-mono font-bold text-amber-300">{eur.format(payroll.employerTotalCost)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950">
            <div className="text-[10px] uppercase text-slate-500 flex items-center justify-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Net annuel
            </div>
            <div className="font-mono font-bold text-slate-100">{eur.format(payroll.netAnnual)}</div>
          </div>
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950">
            <div className="text-[10px] uppercase text-slate-500 flex items-center justify-center gap-1">
              <Wallet className="h-3.5 w-3.5" /> Coût annuel employeur
            </div>
            <div className="font-mono font-bold text-slate-100">{eur.format(payroll.employerAnnualCost)}</div>
          </div>
        </div>

        <p className="flex items-start gap-2 text-[11px] text-slate-500">
          <TrendingDown className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            Simulation indicative — ne tient pas compte des réductions (travailleur, groupe cible), du pécule de
            vacances ni des avantages en nature. Intégrez votre secrétariat social pour les fiches 281.10/281.20.
          </span>
        </p>
      </div>
    </div>
  );
}

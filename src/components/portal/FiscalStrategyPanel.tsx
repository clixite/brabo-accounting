import { useState } from 'react';
import {
  Building2,
  Landmark,
  PiggyBank,
  Scale,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  compareDividendRegimes,
  simulateBelgianSocialContributions,
  simulateIsoc,
} from '../../services/fiscalStrategy';

const eur = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

/**
 * Fiscal strategy & optimisation panel for a client dossier (cabinet side).
 * Lets the expert-comptable simulate ISOC (20 % / 25 %), dividend regimes and
 * social contributions + PLCI/VAPZ — the "améliorer, optimiser" layer.
 */
export function FiscalStrategyPanel({ clientName }: { clientName: string }) {
  const [profit, setProfit] = useState(85000);
  const [hasDirectorRemuneration, setHasDirectorRemuneration] = useState(true);
  const [income, setIncome] = useState(68000);

  const isoc = simulateIsoc(profit, hasDirectorRemuneration);
  const dividends = compareDividendRegimes(isoc.netAfterTax);
  const social = simulateBelgianSocialContributions(income);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Scale className="h-4 w-4 text-amber-400" /> Stratégie fiscale & optimisation
        <span className="text-xs font-normal text-slate-500">— {clientName}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ISOC */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Building2 className="h-4 w-4" /> ISOC / VenB (20 % vs 25 %)
            </div>
            <span className="text-[10px] text-slate-500">art. 215 CIR 92</span>
          </div>

          <div>
            <label className="text-[11px] text-slate-400">Bénéfice imposable (€)</label>
            <input
              type="number"
              value={profit}
              onChange={(e) => setProfit(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-amber-300"
            />
          </div>

          <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={hasDirectorRemuneration}
              onChange={(e) => setHasDirectorRemuneration(e.target.checked)}
              className="accent-amber-500"
            />
            Rémunération dirigeant ≥ 45 000 € (taux réduit)
          </label>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
              <div className="text-[10px] uppercase text-slate-500">ISOC dû</div>
              <div className="font-mono font-bold text-amber-300">{eur.format(isoc.taxAmount)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
              <div className="text-[10px] uppercase text-slate-500">Taux effectif</div>
              <div className="font-mono font-bold text-slate-100">{isoc.effectiveRate.toFixed(1)} %</div>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2">
              <div className="text-[10px] uppercase text-emerald-400">Économie</div>
              <div className="font-mono font-bold text-emerald-300">{eur.format(isoc.savings)}</div>
            </div>
          </div>
          {!isoc.isSmeEligible && (
            <p className="text-[11px] text-amber-400/80">
              Sans rémunération dirigeant ≥ 45 k€, la société perd le taux réduit PME de 20 %.
            </p>
          )}
        </div>

        {/* Dividends */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <TrendingUp className="h-4 w-4" /> Distribution de dividendes
            <span className="text-[10px] font-normal text-slate-500">sur {eur.format(isoc.netAfterTax)} après ISOC</span>
          </div>

          <div className="space-y-2">
            {dividends.regimes.map((r) => (
              <div key={r.kind} className="flex items-center justify-between rounded-lg bg-slate-950 border border-slate-800 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200">
                    {r.label}
                    <span className="ml-1.5 text-[10px] text-slate-500">({r.withholdingRate} %{r.upfrontRate > 0 ? ` + ${r.upfrontRate} %` : ''})</span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{r.description}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="font-mono font-bold text-emerald-300">{eur.format(r.netReceived)}</div>
                  <div className="text-[10px] text-slate-500">net reçu</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Social contributions + PLCI */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <PiggyBank className="h-4 w-4" /> Cotisations sociales & PLCI / VAPZ
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400">Revenu net imposable (€)</label>
            <input
              type="number"
              value={income}
              onChange={(e) => setIncome(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-mono text-amber-300 text-right"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] uppercase text-slate-500">Cotisation annuelle</div>
            <div className="font-mono font-bold text-slate-100">{eur.format(social.totalAnnualPayment)}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] uppercase text-slate-500">Cotisation trimestrielle</div>
            <div className="font-mono font-bold text-slate-300">{eur.format(social.totalQuarterlyPayment)}</div>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2">
            <div className="text-[10px] uppercase text-emerald-400">Plafond PLCI/VAPZ</div>
            <div className="font-mono font-bold text-emerald-300">{eur.format(social.vapzMaxDeductible)}</div>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2">
            <div className="text-[10px] uppercase text-emerald-400">Économie IPP estimée</div>
            <div className="font-mono font-bold text-emerald-300">~ {eur.format(social.taxShieldSavingsEstimate)}</div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-900/50 border border-slate-800 rounded-lg p-3">
        <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <span>
          <strong className="text-amber-300">Recommandation :</strong> combiner le taux réduit ISOC (20 %),
          la distribution VVPR-bis (15 %) et le plafond PLCI/VAPZ maximise le revenu net du dirigeant tout en
          sécurisant la retraite complémentaire.
        </span>
      </div>

      <div className="text-[10px] text-slate-600 flex items-center gap-1.5">
        <Landmark className="h-3.5 w-3.5" /> Simulation indicative — ne remplace pas un avis fiscal personnalisé ITAA.
      </div>
    </div>
  );
}

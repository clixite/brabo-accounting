import { useMemo, useState } from 'react';
import { AlertTriangle, Lightbulb, ShieldAlert, Sparkles } from 'lucide-react';
import { recommendFiscalStrategy } from '../../services/fiscalRecommender';
import type { ClientFinancialProfile } from '../../services/fiscalRecommender';

const eur = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

const SEVERITY_STYLES: Record<string, { box: string; icon: React.ReactNode }> = {
  critical: {
    box: 'border-red-500/30 bg-red-950/20',
    icon: <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />,
  },
  important: {
    box: 'border-amber-500/30 bg-amber-950/20',
    icon: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />,
  },
  opportunity: {
    box: 'border-sky-500/30 bg-sky-950/20',
    icon: <Lightbulb className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />,
  },
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critique',
  important: 'Important',
  opportunity: 'Opportunité',
};

/**
 * Data-driven fiscal recommendations for a client dossier. The accountant can
 * flip the director-remuneration condition to see the ISOC recommendation react.
 */
export function FiscalRecommendationsPanel({ profile }: { profile: ClientFinancialProfile }) {
  const [hasDirectorRem, setHasDirectorRem] = useState(profile.hasDirectorRemuneration45k);
  const recommendations = useMemo(
    () => recommendFiscalStrategy({ ...profile, hasDirectorRemuneration45k: hasDirectorRem }),
    [profile, hasDirectorRem],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sparkles className="h-4 w-4 text-amber-400" /> Recommandations de stratégie fiscale
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={hasDirectorRem}
            onChange={(e) => setHasDirectorRem(e.target.checked)}
            className="accent-amber-500"
          />
          Rémunération dirigeant ≥ 45 k€
        </label>
      </div>

      <div className="space-y-2">
        {recommendations.map((r) => {
          const style = SEVERITY_STYLES[r.severity];
          return (
            <div key={r.id} className={`flex items-start gap-3 rounded-lg border p-3 ${style.box}`}>
              {style.icon}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {SEVERITY_LABEL[r.severity]}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">· {r.category}</span>
                  {r.estimatedBenefit !== undefined && r.estimatedBenefit > 0 && (
                    <span className="text-[10px] font-bold text-emerald-300">≈ {eur.format(r.estimatedBenefit)}/an</span>
                  )}
                </div>
                <div className="text-xs font-semibold text-slate-200 mt-0.5">{r.title}</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">{r.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

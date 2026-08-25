import { useMemo, useState } from 'react';
import { AlertTriangle, Lightbulb, ShieldAlert, Sparkles } from 'lucide-react';
import { recommendFiscalStrategy } from '../../services/fiscalRecommender';
import type { ClientFinancialProfile } from '../../services/fiscalRecommender';

const eur = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

const SEVERITY_STYLES: Record<string, { box: string; icon: React.ReactNode }> = {
  critical: {
    box: 'border-[var(--state-critical-border)] bg-[var(--state-critical-bg)]',
    icon: <ShieldAlert className="h-4 w-4 text-[var(--state-critical-text)] shrink-0 mt-0.5" />,
  },
  important: {
    box: 'border-[var(--state-warning-border)] bg-[var(--state-warning-bg)]',
    icon: <AlertTriangle className="h-4 w-4 text-[var(--accent-solid)] shrink-0 mt-0.5" />,
  },
  opportunity: {
    box: 'border-[var(--state-info-border)] bg-[var(--state-info-bg)]',
    icon: <Lightbulb className="h-4 w-4 text-[var(--state-info-text)] shrink-0 mt-0.5" />,
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
        <div className="flex items-center gap-2 text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">
          <Sparkles className="h-4 w-4 text-[var(--accent-solid)]" /> Recommandations de stratégie fiscale
        </div>
        <label className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] cursor-pointer">
          <input
            type="checkbox"
            checked={hasDirectorRem}
            onChange={(e) => setHasDirectorRem(e.target.checked)}
            className="accent-[var(--accent-solid)]"
          />
          Rémunération dirigeant ≥ 45 k€
        </label>
      </div>

      <div className="space-y-2">
        {recommendations.map((r) => {
          const style = SEVERITY_STYLES[r.severity];
          return (
            <div key={r.id} className={`flex items-start gap-3 rounded-[var(--radius-md)] border p-3 ${style.box}`}>
              {style.icon}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[length:var(--text-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                    {SEVERITY_LABEL[r.severity]}
                  </span>
                  <span className="text-[length:var(--text-2xs)] font-bold text-[var(--text-disabled)]">· {r.category}</span>
                  {r.estimatedBenefit !== undefined && r.estimatedBenefit > 0 && (
                    <span className="text-[length:var(--text-2xs)] font-bold text-[var(--state-positive-text)]">≈ {eur.format(r.estimatedBenefit)}/an</span>
                  )}
                </div>
                <div className="text-[length:var(--text-xs)] font-semibold text-[var(--text-primary)] mt-0.5">{r.title}</div>
                <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] leading-relaxed">{r.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

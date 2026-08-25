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
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Input } from '../ui/Input';

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
      <div className="flex items-center gap-2 text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">
        <Scale className="h-4 w-4 text-[var(--accent-solid)]" /> Stratégie fiscale & optimisation
        <span className="text-[length:var(--text-xs)] font-normal text-[var(--text-tertiary)]">— {clientName}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ISOC */}
        <Card flush>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2 text-[var(--accent-solid)]">
                <Building2 className="h-4 w-4" /> ISOC / VenB (20 % vs 25 %)
              </span>
            }
            actions={<span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">art. 215 CIR 92</span>}
          />
          <CardBody className="space-y-3">
            <div>
              <label className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Bénéfice imposable (€)</label>
              <Input
                type="number"
                value={profit}
                onChange={(e) => setProfit(Math.max(0, parseInt(e.target.value) || 0))}
                className="mt-1 bg-[var(--bg-sunken)] font-mono tnum text-[var(--accent-solid)]"
              />
            </div>

            <label className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={hasDirectorRemuneration}
                onChange={(e) => setHasDirectorRemuneration(e.target.checked)}
                className="accent-[var(--accent-solid)]"
              />
              Rémunération dirigeant ≥ 45 000 € (taux réduit)
            </label>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[var(--bg-sunken)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-2">
                <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">ISOC dû</div>
                <div className="font-mono tnum font-bold text-[var(--accent-solid)]">{eur.format(isoc.taxAmount)}</div>
              </div>
              <div className="bg-[var(--bg-sunken)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-2">
                <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Taux effectif</div>
                <div className="font-mono tnum font-bold text-[var(--text-primary)]">{isoc.effectiveRate.toFixed(1)} %</div>
              </div>
              <div className="bg-[var(--state-positive-bg)] border border-[var(--state-positive-border)] rounded-[var(--radius-md)] p-2">
                <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--state-positive-text)]">Économie</div>
                <div className="font-mono tnum font-bold text-[var(--state-positive-text)]">{eur.format(isoc.savings)}</div>
              </div>
            </div>
            {!isoc.isSmeEligible && (
              <p className="text-[length:var(--text-2xs)] text-[var(--state-warning-text)]">
                Sans rémunération dirigeant ≥ 45 k€, la société perd le taux réduit PME de 20 %.
              </p>
            )}
          </CardBody>
        </Card>

        {/* Dividends */}
        <Card flush>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2 text-[var(--accent-solid)]">
                <TrendingUp className="h-4 w-4" /> Distribution de dividendes
              </span>
            }
            description={`sur ${eur.format(isoc.netAfterTax)} après ISOC`}
          />
          <CardBody>
            <div className="space-y-2">
              {dividends.regimes.map((r) => (
                <div
                  key={r.kind}
                  className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--bg-sunken)] border border-[var(--border-subtle)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-[length:var(--text-xs)] font-semibold text-[var(--text-primary)]">
                      {r.label}
                      <span className="ml-1.5 text-[length:var(--text-2xs)] font-normal text-[var(--text-tertiary)]">({r.withholdingRate} %{r.upfrontRate > 0 ? ` + ${r.upfrontRate} %` : ''})</span>
                    </div>
                    <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] truncate">{r.description}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="font-mono tnum font-bold text-[var(--state-positive-text)]">{eur.format(r.netReceived)}</div>
                    <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">net reçu</div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Social contributions + PLCI */}
      <Card flush>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2 text-[var(--accent-solid)]">
              <PiggyBank className="h-4 w-4" /> Cotisations sociales & PLCI / VAPZ
            </span>
          }
          actions={
            <div className="flex items-center gap-2">
              <label className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Revenu net imposable (€)</label>
              <Input
                type="number"
                value={income}
                onChange={(e) => setIncome(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-28 bg-[var(--bg-sunken)] font-mono tnum text-[var(--accent-solid)] text-right"
              />
            </div>
          }
        />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
            <div className="bg-[var(--bg-sunken)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-2">
              <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Cotisation annuelle</div>
              <div className="font-mono tnum font-bold text-[var(--text-primary)]">{eur.format(social.totalAnnualPayment)}</div>
            </div>
            <div className="bg-[var(--bg-sunken)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-2">
              <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Cotisation trimestrielle</div>
              <div className="font-mono tnum font-bold text-[var(--text-secondary)]">{eur.format(social.totalQuarterlyPayment)}</div>
            </div>
            <div className="bg-[var(--state-positive-bg)] border border-[var(--state-positive-border)] rounded-[var(--radius-md)] p-2">
              <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--state-positive-text)]">Plafond PLCI/VAPZ</div>
              <div className="font-mono tnum font-bold text-[var(--state-positive-text)]">{eur.format(social.vapzMaxDeductible)}</div>
            </div>
            <div className="bg-[var(--state-positive-bg)] border border-[var(--state-positive-border)] rounded-[var(--radius-md)] p-2">
              <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--state-positive-text)]">Économie IPP estimée</div>
              <div className="font-mono tnum font-bold text-[var(--state-positive-text)]">~ {eur.format(social.taxShieldSavingsEstimate)}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-start gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-3">
        <Sparkles className="h-4 w-4 text-[var(--accent-solid)] shrink-0 mt-0.5" />
        <span>
          <strong className="text-[var(--accent-solid)]">Recommandation :</strong> combiner le taux réduit ISOC (20 %),
          la distribution VVPR-bis (15 %) et le plafond PLCI/VAPZ maximise le revenu net du dirigeant tout en
          sécurisant la retraite complémentaire.
        </span>
      </div>

      <div className="text-[length:var(--text-2xs)] text-[var(--text-disabled)] flex items-center gap-1.5">
        <Landmark className="h-3.5 w-3.5" /> Simulation indicative — ne remplace pas un avis fiscal personnalisé ITAA.
      </div>
    </div>
  );
}

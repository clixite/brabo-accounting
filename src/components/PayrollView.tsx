import { useState } from 'react';
import { Briefcase, Wallet, TrendingDown, TrendingUp } from 'lucide-react';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { computePayroll } from '../services/payroll';
import { Card, CardHeader, CardBody } from './ui/Card';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { cn } from './ui/cn';

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
    <div className="space-y-4">
      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          <Badge tone="accent" dot>Paie & charges sociales</Badge>
          <span>Barèmes ONSS belges</span>
        </div>
        <h1 className="text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-[var(--text-tertiary)]" />
          {t.title}
        </h1>
        <p className="text-[length:var(--text-xs)] text-[var(--text-secondary)]">{t.subtitle}</p>
      </div>

      {/* ── Simulator ─────────────────────────────────────────────────────── */}
      <Card flush>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[var(--text-tertiary)]" />
              Simulateur brut → net
            </span>
          }
          description="Outil de planification — ne remplace pas un secrétariat social agréé"
          actions={<Badge tone="warning">Indicatif</Badge>}
        />
        <CardBody className="space-y-4">
          {/* Gross input */}
          <div className="space-y-2">
            <label className="block text-[length:var(--text-2xs)] font-medium text-[var(--text-secondary)]">
              {t.gross}
            </label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={gross}
                onChange={(e) => setGross(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-36 font-mono tnum font-semibold text-[var(--accent-solid)]"
              />
              <input
                type="range"
                min="1500"
                max="10000"
                step="100"
                value={gross}
                onChange={(e) => setGross(parseInt(e.target.value))}
                className="flex-1 cursor-pointer accent-[var(--accent-solid)]"
              />
            </div>
          </div>

          {/* Monthly breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-center">
            {[
              { label: 'Brut mensuel', value: payroll.grossMonthly, tone: 'default' as const },
              { label: 'ONSS employé (13,07 %)', value: payroll.employeeOnss, tone: 'critical' as const },
              { label: 'Précompte professionnel', value: payroll.withholdingTax, tone: 'critical' as const },
              { label: t.net, value: payroll.netMonthly, tone: 'positive' as const },
              { label: 'ONSS employeur (25 %)', value: payroll.employerOnss, tone: 'critical' as const },
              { label: t.employerCost, value: payroll.employerTotalCost, tone: 'accent' as const },
            ].map((cell) => (
              <div
                key={cell.label}
                className={cn(
                  'p-3 rounded-[var(--radius-md)] border space-y-1',
                  cell.tone === 'positive'
                    ? 'bg-[var(--state-positive-bg)] border-[var(--state-positive-border)]'
                    : 'bg-[var(--bg-sunken)] border-[var(--border-subtle)]',
                )}
              >
                <div
                  className={cn(
                    'text-[length:var(--text-2xs)] uppercase tracking-wide',
                    cell.tone === 'positive'
                      ? 'text-[var(--state-positive-text)]'
                      : 'text-[var(--text-tertiary)]',
                  )}
                >
                  {cell.label}
                </div>
                <div
                  className={cn(
                    'font-mono tnum font-semibold text-[length:var(--text-sm)]',
                    cell.tone === 'critical'
                      ? 'text-[var(--state-critical-text)]'
                      : cell.tone === 'positive'
                        ? 'text-[var(--state-positive-text)]'
                        : cell.tone === 'accent'
                          ? 'text-[var(--accent-solid)]'
                          : 'text-[var(--text-primary)]',
                  )}
                >
                  {eur.format(cell.value)}
                </div>
              </div>
            ))}
          </div>

          {/* Annual totals */}
          <div className="grid grid-cols-2 gap-3 text-center">
            {[
              { label: 'Net annuel', value: payroll.netAnnual, Icon: TrendingUp },
              { label: 'Coût annuel employeur', value: payroll.employerAnnualCost, Icon: Wallet },
            ].map(({ label, value, Icon }) => (
              <div
                key={label}
                className="p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] space-y-1"
              >
                <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] flex items-center justify-center gap-1">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </div>
                <div className="font-mono tnum font-semibold text-[length:var(--text-sm)] text-[var(--text-primary)]">
                  {eur.format(value)}
                </div>
              </div>
            ))}
          </div>

          <p className="flex items-start gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] leading-relaxed">
            <TrendingDown className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-solid)]" />
            <span>
              Simulation indicative — ne tient pas compte des réductions (travailleur, groupe cible), du pécule de
              vacances ni des avantages en nature. Intégrez votre secrétariat social pour les fiches 281.10/281.20.
            </span>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

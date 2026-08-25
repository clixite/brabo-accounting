/**
 * BRABO — fiscal strategy recommender (cabinet side).
 *
 * Analyses a client's actual financial position and emits prioritised,
 * concrete optimisation recommendations. This is the "piloter et raffiner la
 * stratégie fiscale" layer: the accountant gets an automated, data-driven
 * shortlist of actions per dossier, each with an estimated benefit.
 */

import { simulateBelgianSocialContributions } from '../utils/belgianAccounting';
import { simulateIsoc } from './fiscalStrategy';

export type RecommendationSeverity = 'critical' | 'important' | 'opportunity';
export type RecommendationCategory =
  | 'ISOC'
  | 'TVA'
  | 'PLCI'
  | 'Recouvrement'
  | 'Franchise'
  | 'Déclaration'
  | 'Dividendes';

export interface ClientFinancialProfile {
  turnoverExclVat: number;
  vatCollected: number;
  vatDeductible: number;
  expensesExclVat: number;
  overdueCount: number;
  overdueAmount: number;
  /** True when the cabinet granted the client the autonomous VAT filing right. */
  selfDeclarationGranted: boolean;
  vatRegime: string;
  /** Whether the 45 k€ director-remuneration condition is already met. */
  hasDirectorRemuneration45k: boolean;
}

export interface FiscalRecommendation {
  id: string;
  severity: RecommendationSeverity;
  category: RecommendationCategory;
  title: string;
  detail: string;
  estimatedBenefit?: number;
}

const FRANCHISE_THRESHOLD = 25000;
const FRANCHISE_WARNING_RATIO = 0.85;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Produces a ranked list of recommendations (critical → opportunity, then by
 * estimated benefit descending).
 */
export function recommendFiscalStrategy(profile: ClientFinancialProfile): FiscalRecommendation[] {
  const out: FiscalRecommendation[] = [];
  const profitEstimate = round2(profile.turnoverExclVat - profile.expensesExclVat);
  const vatNet = round2(profile.vatCollected - profile.vatDeductible);

  // 1. Overdue receivables — always the priority when money is stuck.
  if (profile.overdueCount > 0 && profile.overdueAmount > 0) {
    const recoverable = round2(profile.overdueAmount * 0.125 + profile.overdueCount * 40);
    out.push({
      id: 'recouvrement',
      severity: 'critical',
      category: 'Recouvrement',
      title: `${profile.overdueCount} facture(s) en retard pour ${profile.overdueAmount.toFixed(2)} €`,
      detail:
        'Activer les rappels (amical → formel → mise en demeure) et appliquer les intérêts légaux B2B (12,5 %) + l\'indemnité forfaitaire de 40 € par facture.',
      estimatedBenefit: recoverable,
    });
  }

  // 2. VAT to be paid — anticipate before the filing deadline.
  if (vatNet > 0) {
    out.push({
      id: 'vat_due',
      severity: vatNet > 10000 ? 'important' : 'opportunity',
      category: 'TVA',
      title: `TVA nette à verser : ${vatNet.toFixed(2)} €`,
      detail:
        'Provisionser le montant avant l\'échéance Intervat et vérifier la déductibilité des achats (véhicules, restaurant) pour réduire la grille 59.',
    });
  } else if (vatNet < 0) {
    out.push({
      id: 'vat_credit',
      severity: 'opportunity',
      category: 'TVA',
      title: `Crédit TVA récupérable : ${Math.abs(vatNet).toFixed(2)} €`,
      detail: 'Demander le remboursement ou le report du crédit TVA (grille 72) dans la déclaration périodique.',
    });
  }

  // 3. Reduced SME corporate tax rate (20 % vs 25 %).
  if (profitEstimate > 0 && !profile.hasDirectorRemuneration45k) {
    const benefit = round2(Math.min(profitEstimate, 100000) * 0.05);
    out.push({
      id: 'isoc_reduced',
      severity: 'important',
      category: 'ISOC',
      title: 'Sécuriser le taux réduit ISOC de 20 %',
      detail:
        'La condition de rémunération dirigeant ≥ 45 000 € n\'est pas remplie : sans elle, la société paie 25 % au lieu de 20 % sur la première tranche de 100 000 €.',
      estimatedBenefit: benefit,
    });
  } else if (profitEstimate > 0) {
    const isoc = simulateIsoc(profitEstimate, true);
    if (isoc.savings > 0) {
      out.push({
        id: 'isoc_ok',
        severity: 'opportunity',
        category: 'ISOC',
        title: `Taux réduit ISOC appliqué — ${isoc.savings.toFixed(2)} € économisés`,
        detail: 'Le bénéfice reste sous la tranche réduite ; veiller à conserver la rémunération dirigeant ≥ 45 000 € chaque exercice.',
      });
    }
  }

  // 4. PLCI / VAPZ supplementary pension.
  if (profitEstimate > 40000) {
    const social = simulateBelgianSocialContributions(profitEstimate);
    const benefit = round2(social.vapzMaxDeductible * 0.5);
    out.push({
      id: 'plci_vapz',
      severity: 'important',
      category: 'PLCI',
      title: `Maximiser la pension complémentaire PLCI/VAPZ (plafond ${social.vapzMaxDeductible.toFixed(2)} €)`,
      detail:
        'Verser le maximum déductible réduit la base imposable à l\'IPP (tranche marginale ~50 %) et l\'assiette des cotisations sociales N+3.',
      estimatedBenefit: benefit,
    });
  }

  // 5. Dividend distribution regime.
  if (profitEstimate > 50000) {
    out.push({
      id: 'dividends',
      severity: 'opportunity',
      category: 'Dividendes',
      title: 'Optimiser la distribution : VVPR-bis (15 %) vs réserve de liquidation',
      detail:
        'Comparer VVPR-bis (15 %, après 3 ans), réserve de liquidation (10 % + 5 %, après 5 ans) et dividende ordinaire (30 %).',
    });
  }

  // 6. Franchise regime threshold watch.
  if (profile.vatRegime === 'franchise_art56bis' && profile.turnoverExclVat >= FRANCHISE_THRESHOLD * FRANCHISE_WARNING_RATIO) {
    out.push({
      id: 'franchise_threshold',
      severity: 'critical',
      category: 'Franchise',
      title: 'Seuil de franchise TVA (25 000 €) bientôt dépassé',
      detail:
        'Le CA HTVA approche le plafond du régime de franchise (art. 56bis) : préparer le passage au régime normal (assujettissement, facturation avec TVA).',
    });
  }

  // 7. Self-declaration status (permission note).
  out.push({
    id: 'declaration_status',
    severity: profile.selfDeclarationGranted ? 'opportunity' : 'important',
    category: 'Déclaration',
    title: profile.selfDeclarationGranted
      ? 'Auto-déclaration TVA activée pour le client'
      : 'Déclaration TVA gérée par le cabinet (auto-déclaration désactivée)',
    detail: profile.selfDeclarationGranted
      ? 'Le client peut déposer sa propre déclaration Intervat ; le cabinet reste en supervision.'
      : 'Le cabinet dépose la déclaration ; octroyer l\'accès autonome si le client le demande.',
  });

  const order: Record<RecommendationSeverity, number> = { critical: 0, important: 1, opportunity: 2 };
  return out.sort(
    (a, b) => order[a.severity] - order[b.severity] || (b.estimatedBenefit ?? 0) - (a.estimatedBenefit ?? 0),
  );
}

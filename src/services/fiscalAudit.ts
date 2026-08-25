/**
 * BRABO — Belgian Accounting Platform
 * Fiscal anomaly detection engine (pre-declaration audit).
 *
 * Runs a set of Belgian tax-compliance checks over sales invoices and purchase
 * expenses, producing a structured report the business owner and ITAA
 * accountant can review before filing the periodic VAT return.
 *
 * Rules reference: Code TVA, AR n°1, CIR 92, and the Peppol BIS 3.0 CIUS-BE.
 */

import type {
  CompanyProfile,
  Invoice,
  PurchaseExpense,
} from '../types/accounting';
import { validateBCE, validateOGM } from '../utils/belgianAccounting';
import { calculateVatGrids } from '../utils/belgianAccounting';

export type FiscalSeverity = 'error' | 'warning' | 'info';

export interface FiscalAuditIssue {
  severity: FiscalSeverity;
  /** Stable rule identifier, e.g. "FIS-001". */
  code: string;
  /** Human-readable description (FR). */
  message: string;
  /** Source document reference when applicable. */
  documentId?: string;
  /** Monetary amount attached to the anomaly, when applicable. */
  amount?: number;
}

export interface FiscalAuditReport {
  issues: FiscalAuditIssue[];
  errors: FiscalAuditIssue[];
  warnings: FiscalAuditIssue[];
  infos: FiscalAuditIssue[];
  totalErrors: number;
  totalWarnings: number;
  /** 0–100 risk score (higher = more anomalies). */
  riskScore: number;
  /** Aggregated VAT grids used to spot threshold breaches. */
  grids: ReturnType<typeof calculateVatGrids>;
  recommendations: string[];
}

const FRANCHISE_THRESHOLD = 25000; // Article 56bis — franchise des petites entreprises
const CLIENT_LISTING_THRESHOLD = 250; // Listing annuel clients assujettis

/** Belgian VAT rates used for arithmetic consistency checks. */
const VAT_TOLERANCE = 0.02;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Audits a single sales invoice for Belgian VAT compliance.
 */
export function auditInvoice(invoice: Invoice): FiscalAuditIssue[] {
  const issues: FiscalAuditIssue[] = [];

  if (invoice.type === 'quote' || invoice.status === 'cancelled') return issues;

  // FIS-001: line VAT arithmetic mismatch.
  invoice.lines.forEach((line, idx) => {
    const expectedVat = round2(line.totalExclVat * (line.vatRate / 100));
    if (Math.abs(line.vatAmount - expectedVat) > VAT_TOLERANCE) {
      issues.push({
        severity: 'error',
        code: 'FIS-001',
        message: `Ligne ${idx + 1} « ${line.description} » : TVA calculée ${line.vatAmount.toFixed(2)} € ≠ attendu ${expectedVat.toFixed(2)} €.`,
        documentId: invoice.invoiceNumber,
        amount: Math.abs(line.vatAmount - expectedVat),
      });
    }
  });

  // FIS-002: document VAT total ≠ sum of line VAT.
  const lineVatSum = round2(invoice.lines.reduce((acc, l) => acc + l.vatAmount, 0));
  if (Math.abs(invoice.totalVatAmount - lineVatSum) > VAT_TOLERANCE) {
    issues.push({
      severity: 'error',
      code: 'FIS-002',
      message: `Total TVA document ${invoice.totalVatAmount.toFixed(2)} € ≠ somme des lignes ${lineVatSum.toFixed(2)} €.`,
      documentId: invoice.invoiceNumber,
      amount: Math.abs(invoice.totalVatAmount - lineVatSum),
    });
  }

  // FIS-003: missing/invalid structured communication (OGM).
  if (!validateOGM(invoice.structuredCommunication).isValid) {
    issues.push({
      severity: 'warning',
      code: 'FIS-003',
      message: `Communication structurée OGM absente ou invalide pour la facture ${invoice.invoiceNumber}.`,
      documentId: invoice.invoiceNumber,
    });
  }

  // FIS-004: invalid buyer BCE.
  const bce = validateBCE(invoice.client.bceNumber);
  if (!bce.isValid) {
    issues.push({
      severity: 'error',
      code: 'FIS-004',
      message: `Numéro BCE client invalide (${invoice.client.bceNumber}) — impossible de justifier l'exonération.`,
      documentId: invoice.invoiceNumber,
    });
  }

  // FIS-005: intra-community sale without Peppol transmission evidence.
  const hasIntraCommunity = invoice.lines.some(
    (l) => l.vatRegime === 'intracommunity_art39bis' || l.vatRegime === 'intracommunity_service_art21',
  );
  if (hasIntraCommunity && !invoice.peppolStatus?.isSent) {
    issues.push({
      severity: 'warning',
      code: 'FIS-005',
      message: `Opération intracommunautaire (Art. 39bis/21 §2) sans preuve de transmission Peppol ni validation VIES.`,
      documentId: invoice.invoiceNumber,
    });
  }

  return issues;
}

/**
 * Audits a single purchase expense for Belgian deductibility rules.
 */
export function auditExpense(expense: PurchaseExpense): FiscalAuditIssue[] {
  const issues: FiscalAuditIssue[] = [];

  // FIS-101: restaurant/reception VAT must not be deductible (Belgian rule).
  if (expense.pcmnAccount === '615100' && expense.deductibleVatRate > 0) {
    issues.push({
      severity: 'warning',
      code: 'FIS-101',
      message: `Frais de restaurant (PCMN 615100) : TVA non récupérable en Belgique, mais un taux de déduction TVA de ${expense.deductibleVatRate}% est appliqué.`,
      documentId: expense.invoiceNumber,
      amount: expense.deductibleVat,
    });
  }

  // FIS-102: fuel/car VAT deduction above the 50% legal ceiling.
  if (expense.pcmnAccount === '614100' && expense.deductibleVatRate > 50) {
    issues.push({
      severity: 'warning',
      code: 'FIS-102',
      message: `Carburant/leasing (PCMN 614100) : déduction TVA plafonnée à 50% en Belgique, ${expense.deductibleVatRate}% appliqué.`,
      documentId: expense.invoiceNumber,
    });
  }

  // FIS-103: missing or invalid supplier BCE.
  const bce = validateBCE(expense.supplierBce);
  if (!bce.isValid) {
    issues.push({
      severity: 'error',
      code: 'FIS-103',
      message: `N° BCE fournisseur invalide (${expense.supplierBce}) — pièce non justifiée fiscalement.`,
      documentId: expense.invoiceNumber,
    });
  }

  // FIS-104: expense VAT arithmetic mismatch.
  const expectedVat = round2(expense.amountExclVat * (expense.vatRate / 100));
  if (Math.abs(expense.vatAmount - expectedVat) > VAT_TOLERANCE) {
    issues.push({
      severity: 'error',
      code: 'FIS-104',
      message: `TVA dépense ${expense.vatAmount.toFixed(2)} € ≠ attendu ${expectedVat.toFixed(2)} €.`,
      documentId: expense.invoiceNumber,
      amount: Math.abs(expense.vatAmount - expectedVat),
    });
  }

  return issues;
}

/**
 * Runs the full Belgian pre-declaration fiscal audit.
 */
export function runFiscalAudit(
  invoices: Invoice[],
  purchases: PurchaseExpense[],
  company: CompanyProfile,
  period: string = '2026-Q1',
): FiscalAuditReport {
  const issues: FiscalAuditIssue[] = [];

  for (const invoice of invoices) {
    issues.push(...auditInvoice(invoice));
  }
  for (const expense of purchases) {
    issues.push(...auditExpense(expense));
  }

  const grids = calculateVatGrids(invoices, purchases, period);

  // FIS-201: turnover near/over the 25k € franchise threshold.
  const annualTurnover = invoices
    .filter((i) => i.type !== 'quote' && i.status !== 'cancelled')
    .reduce((acc, i) => acc + i.subtotalExclVat, 0);

  if (company.vatRegime === 'franchise_art56bis' && annualTurnover >= FRANCHISE_THRESHOLD) {
    issues.push({
      severity: 'error',
      code: 'FIS-201',
      message: `Chiffre d'affaires annuel ${annualTurnover.toFixed(2)} € dépasse le plafond de franchise de 25 000 € (Art. 56bis) — basculement obligatoire en régime normal.`,
      amount: annualTurnover,
    });
  } else if (annualTurnover >= FRANCHISE_THRESHOLD * 0.8) {
    issues.push({
      severity: 'warning',
      code: 'FIS-202',
      message: `Chiffre d'affaires ${annualTurnover.toFixed(2)} € proche du plafond de franchise (25 000 €).`,
      amount: annualTurnover,
    });
  }

  // FIS-203: client listing reminder.
  const clientsAboveThreshold = new Set(
    invoices
      .filter((i) => i.type !== 'quote' && i.status !== 'cancelled')
      .filter((i) => validateBCE(i.client.bceNumber).isValid)
      .map((i) => i.client.bceNumber),
  );
  if (clientsAboveThreshold.size > 0) {
    issues.push({
      severity: 'info',
      code: 'FIS-203',
      message: `${clientsAboveThreshold.size} client(s) assujetti(s) belge(s) à reprendre au listing annuel (> ${CLIENT_LISTING_THRESHOLD} € HTVA).`,
    });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  const riskScore = Math.max(0, Math.min(100, errors.length * 20 + warnings.length * 5));

  const recommendations: string[] = [];
  if (errors.some((e) => e.code === 'FIS-001' || e.code === 'FIS-002' || e.code === 'FIS-104')) {
    recommendations.push('Corriger les écarts de TVA calculée avant le dépôt de la déclaration périodique.');
  }
  if (warnings.some((w) => w.code === 'FIS-003')) {
    recommendations.push('Attribuer une communication structurée OGM valide à chaque facture pour le lettrage bancaire automatique.');
  }
  if (errors.some((e) => e.code === 'FIS-103')) {
    recommendations.push('Vérifier les numéros BCE des fournisseurs et demander les pièces justificatives manquantes.');
  }
  if (issues.some((i) => i.code === 'FIS-005')) {
    recommendations.push('Conserver la preuve de validation VIES pour toute opération intracommunautaire exonérée.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Aucune anomalie bloquante — le dossier est prêt pour la clôture trimestrielle.');
  }

  return {
    issues,
    errors,
    warnings,
    infos,
    totalErrors: errors.length,
    totalWarnings: warnings.length,
    riskScore,
    grids,
    recommendations,
  };
}

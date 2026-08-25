/**
 * BRABO — automatic booking (encodage automatique) engine for the client side.
 *
 * Turns raw bank transactions into draft purchase expenses, automatically
 * classifying the PCMN account, VAT rate and deductibility from the
 * counterparty / communication text. This is the "encodage automatique" layer:
 * the client imports a CODA/CAMT statement, reviews the proposals, and confirms
 * — no manual chart-of-accounts lookup required.
 */

import type { BankTransaction, BelgianVatRate, PurchaseExpense } from '../types/accounting';
import { BELGIAN_PCMN_ACCOUNTS } from '../utils/belgianAccounting';

export interface BookingSuggestion {
  pcmnAccount: string;
  category: string;
  vatRate: BelgianVatRate;
  /** Income-tax deductibility of the charge, 0–100 (CIR 92). */
  deductibilityRate: number;
  /** Share of input VAT recoverable, 0–100 (Code TVA art. 45). */
  deductibleVatRate: number;
  /** 0..1 — low values mean the classification needs human confirmation. */
  confidence: number;
  matchedKeyword?: string;
}

interface KeywordRule {
  keywords: string[];
  accountCode: string;
  deductibleVatRate: number;
}

/** Expense-side PCMN accounts (those carrying a `deduct` rate). */
const EXPENSE_ACCOUNTS = BELGIAN_PCMN_ACCOUNTS.filter((a) => a.deduct !== undefined);

const KEYWORD_RULES: KeywordRule[] = [
  { keywords: ['proximus', 'orange', 'telenet', 'telecom', 'internet', 'mobile', 'voip', 'broadband'], accountCode: '616100', deductibleVatRate: 100 },
  { keywords: ['restaurant', 'lunch', 'diner', 'dîner', 'horeca', 'brasserie', 'café', 'cafe', 'traiteur', 'reception'], accountCode: '615100', deductibleVatRate: 100 },
  { keywords: ['carburant', 'fuel', 'essence', 'diesel', 'shell', 'total', 'q8', 'maes', 'esso', 'lukoil', 'station'], accountCode: '614100', deductibleVatRate: 50 },
  { keywords: ['lease', 'leasing', 'dieteren', 'd\'ieteren', 'arthur', 'alphabet', 'autolease'], accountCode: '614100', deductibleVatRate: 50 },
  { keywords: ['loyer', 'location', 'bureau', 'office', 'immobilier'], accountCode: '610000', deductibleVatRate: 100 },
  { keywords: ['electricité', 'electricite', 'electrabel', 'engie', 'luminus', 'eau', 'gaz', 'energie', 'energy', 'chauffage'], accountCode: '612000', deductibleVatRate: 100 },
  { keywords: ['honoraire', 'fiduciaire', 'comptable', 'fiscaliste', 'avocat', 'juridique', 'itaa', 'accountant', 'fiscal'], accountCode: '613100', deductibleVatRate: 100 },
  { keywords: ['software', 'logiciel', 'saas', 'cloud', 'azure', 'aws', 'github', 'atlassian', 'slack', 'notion', 'odoo', 'hosting', 'hébergement', 'hebergement', 'adobe', 'microsoft'], accountCode: '616200', deductibleVatRate: 100 },
  { keywords: ['cotisation', 'inasti', 'liantis', 'ucm', 'acerta', 'rsvz', 'securesx', 'xerius'], accountCode: '617000', deductibleVatRate: 100 },
  { keywords: ['plci', 'vapz', 'pension', 'retraite', 'assurance-vie'], accountCode: '618000', deductibleVatRate: 100 },
  { keywords: ['frais bancaire', 'commission', 'tenue de compte'], accountCode: '650000', deductibleVatRate: 100 },
  { keywords: ['taxe', 'redevance', 'communale', 'précompte'], accountCode: '640000', deductibleVatRate: 100 },
];

/** Lowercase, diacritic-stripped, punctuation-free search key. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Classifies a debit counterparty into a PCMN booking proposal. */
export function suggestExpenseBooking(
  counterpartyName: string,
  communication: string,
): BookingSuggestion {
  const haystack = normalize(`${counterpartyName} ${communication}`);

  for (const rule of KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      if (haystack.includes(normalize(keyword))) {
        const account = EXPENSE_ACCOUNTS.find((a) => a.code === rule.accountCode);
        return {
          pcmnAccount: rule.accountCode,
          category: account?.category ?? 'Divers',
          vatRate: (account?.vat ?? 21) as BelgianVatRate,
          deductibilityRate: account?.deduct ?? 100,
          deductibleVatRate: rule.deductibleVatRate,
          confidence: 0.9,
          matchedKeyword: keyword,
        };
      }
    }
  }

  // Generic fallback: services & biens divers, to be confirmed by the user.
  return {
    pcmnAccount: '611000',
    category: 'Divers',
    vatRate: 21,
    deductibilityRate: 100,
    deductibleVatRate: 100,
    confidence: 0.35,
  };
}

/**
 * Converts unreconciled debit bank transactions into draft purchase expenses.
 * Credit movements (receipts) and already-matched rows are skipped — those are
 * handled by the OGM reconciliation flow, not by booking.
 */
export function autoEncodeTransactions(transactions: BankTransaction[]): PurchaseExpense[] {
  const drafts: PurchaseExpense[] = [];

  for (const tx of transactions) {
    if (tx.reconciled || tx.amount >= 0 || tx.matchedExpenseId || tx.matchedInvoiceId) continue;

    const amountInclVat = Math.abs(tx.amount);
    const suggestion = suggestExpenseBooking(tx.counterpartyName, tx.communication);
    const amountExclVat = round2(amountInclVat / (1 + suggestion.vatRate / 100));
    const vatAmount = round2(amountInclVat - amountExclVat);
    const deductibleVat = round2((vatAmount * suggestion.deductibleVatRate) / 100);
    const nonDeductibleVat = round2(vatAmount - deductibleVat);
    const deductibleAmount =
      suggestion.deductibilityRate === 100
        ? amountExclVat
        : round2((amountExclVat * suggestion.deductibilityRate) / 100);
    const nonDeductibleAmount = round2(amountExclVat - deductibleAmount);

    const date = tx.valutaDate || tx.date;
    drafts.push({
      id: `auto-${tx.id}`,
      supplierName: tx.counterpartyName || 'Contrepartie bancaire',
      supplierBce: '',
      invoiceNumber: tx.structuredCommunication || tx.communication.slice(0, 24) || `TX-${tx.id}`,
      date,
      dueDate: date,
      category: suggestion.category,
      pcmnAccount: suggestion.pcmnAccount,
      description: `Auto-encodé depuis la banque — ${tx.counterpartyName}`,
      amountExclVat,
      vatRate: suggestion.vatRate,
      vatAmount,
      amountInclVat,
      deductibilityRate: suggestion.deductibilityRate,
      deductibleVatRate: suggestion.deductibleVatRate,
      deductibleAmount,
      nonDeductibleAmount,
      deductibleVat,
      nonDeductibleVat,
      structuredCommunication: tx.structuredCommunication,
      status: 'pending',
      ocrConfidence: suggestion.confidence,
      ocrExtractedData: {
        supplierRecognized: suggestion.confidence >= 0.8,
        vatDetected: suggestion.vatRate,
        bceValidated: false,
      },
    });
  }

  return drafts;
}

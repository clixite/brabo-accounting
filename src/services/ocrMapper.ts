/**
 * Pure mapping from the OCR server response to BRABO expense form values.
 * Kept free of React/DOM so it is unit-testable in isolation.
 */

import type { BelgianVatRate } from '../types/accounting';
import type { OcrExtractResult, OcrFields } from './ocrService';

export const BELGIAN_VAT_RATES: BelgianVatRate[] = [21, 12, 6, 0];

export interface OcrFormValues {
  supplierName: string;
  supplierBce: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amountExclVat: number | null;
  vatRate: BelgianVatRate | null;
  vatAmount: number | null;
  amountInclVat: number | null;
  pcmnAccount: string | null;
  category: string | null;
  description: string | null;
  deductibilityRate: number | null;
  deductibleVatRate: number | null;
  isInvestment: boolean;
  structuredCommunication?: string;
  iban?: string;
  paymentTermsDays: number | null;
}

export interface OcrQualityDot {
  key: string;
  label: string;
  ok: boolean;
  confidence?: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function nearestRate(computed: number): BelgianVatRate | null {
  let best: BelgianVatRate = BELGIAN_VAT_RATES[0];
  let bestDelta = Infinity;
  for (const rate of BELGIAN_VAT_RATES) {
    const delta = Math.abs(computed - rate);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = rate;
    }
  }
  return bestDelta <= 1.5 ? best : null;
}

/** Infer the dominant Belgian VAT rate from the extracted amounts. */
export function inferVatRate(
  totalExclVat: number | null,
  totalInclVat: number | null,
  vatAmount: number | null,
  detected?: number | null,
): BelgianVatRate | null {
  if (detected != null && (BELGIAN_VAT_RATES as number[]).includes(detected)) {
    return detected as BelgianVatRate;
  }
  if (totalExclVat != null && vatAmount != null && totalExclVat !== 0) {
    const rate = nearestRate(Math.round((vatAmount / totalExclVat) * 100));
    if (rate != null) return rate;
  }
  if (totalExclVat != null && totalInclVat != null && totalExclVat !== 0) {
    return nearestRate(Math.round((totalInclVat / totalExclVat - 1) * 100));
  }
  return null;
}

/** Map a full OCR response onto the expense form values (unknown → null/''). */
export function mapOcrResultToForm(result: OcrExtractResult): OcrFormValues {
  const f: OcrFields = result.fields ?? {};
  const s = result.suggestion;

  const supplierName = f.supplierName?.value ?? '';
  const supplierBce = f.supplierBce?.value ?? f.supplierVat?.value ?? '';
  const invoiceNumber = f.invoiceNumber?.value ?? '';
  const date = f.invoiceDate?.value ?? '';
  const dueDate = f.dueDate?.value ?? '';

  const totalExclVat = f.totalExclVat?.value ?? null;
  const totalInclVat = f.totalInclVat?.value ?? null;
  const vatAmount = f.vatAmount?.value ?? null;
  const vatRate = inferVatRate(totalExclVat, totalInclVat, vatAmount, f.vatRate?.value ?? null);

  // Prefer the explicit HTVA; derive it from the TVAC when missing.
  let amountExclVat = totalExclVat;
  if (amountExclVat == null && totalInclVat != null && vatRate != null) {
    amountExclVat = round2(totalInclVat / (1 + vatRate / 100));
  }

  const description = s?.description ?? [invoiceNumber, supplierName].filter(Boolean).join(' — ');

  return {
    supplierName,
    supplierBce,
    invoiceNumber,
    date,
    dueDate,
    amountExclVat,
    vatRate,
    vatAmount,
    amountInclVat: totalInclVat,
    pcmnAccount: s?.pcmnAccount ?? null,
    category: s?.category ?? null,
    description: description || null,
    deductibilityRate: s?.deductibilityRate ?? null,
    deductibleVatRate: s?.deductibleVatRate ?? null,
    isInvestment: s?.isInvestment ?? false,
    structuredCommunication: f.structuredCommunication?.value ?? undefined,
    iban: f.iban?.value ?? undefined,
    paymentTermsDays: f.paymentTermsDays?.value ?? null,
  };
}

/** Confidence summary per key field, for the "Qualité OCR" row. */
export function ocrQualityDots(result: OcrExtractResult): OcrQualityDot[] {
  const f = result.fields ?? {};
  const dots: OcrQualityDot[] = [
    { key: 'supplierName', label: 'Fournisseur', ok: Boolean(f.supplierName?.value), confidence: f.supplierName?.confidence },
    { key: 'supplierBce', label: 'BCE', ok: Boolean(f.supplierBce?.value), confidence: f.supplierBce?.confidence },
    { key: 'invoiceNumber', label: 'Référence', ok: Boolean(f.invoiceNumber?.value), confidence: f.invoiceNumber?.confidence },
    { key: 'invoiceDate', label: 'Date', ok: Boolean(f.invoiceDate?.value), confidence: f.invoiceDate?.confidence },
    { key: 'totalInclVat', label: 'Total TVAC', ok: f.totalInclVat?.value != null, confidence: f.totalInclVat?.confidence },
    { key: 'structuredCommunication', label: 'OGM', ok: Boolean(f.structuredCommunication?.value), confidence: f.structuredCommunication?.confidence },
  ];
  return dots;
}

/** True when the extracted values still satisfy TVAC ≈ HTVA + TVA. */
export function isOcrAmountConsistent(result: OcrExtractResult): boolean {
  const f = result.fields ?? {};
  const incl = f.totalInclVat?.value;
  const excl = f.totalExclVat?.value;
  const vat = f.vatAmount?.value;
  if (incl == null || excl == null || vat == null) return true; // nothing to contradict
  return Math.abs(incl - (excl + vat)) < 0.5;
}

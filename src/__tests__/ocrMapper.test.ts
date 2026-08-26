import { describe, it, expect } from 'vitest';
import type { OcrExtractResult } from '../services/ocrService';
import {
  inferVatRate,
  isOcrAmountConsistent,
  mapOcrResultToForm,
  ocrQualityDots,
} from '../services/ocrMapper';

function makeResult(overrides: Partial<OcrExtractResult> = {}): OcrExtractResult {
  return {
    engine: 'paddleocr',
    engineVersion: '3.0.0',
    processedAt: '2026-02-01T10:00:00Z',
    pages: 1,
    confidence: 0.94,
    rawText: 'Proximus SA\nTVA BE 0202.239.951\nTotal TVAC 296,45',
    fields: {
      supplierName: { value: 'Proximus SA', confidence: 0.97 },
      supplierVat: { value: 'BE0202239951', confidence: 0.98 },
      supplierBce: { value: 'BE 0202.239.951', confidence: 0.98 },
      invoiceNumber: { value: 'PROX-2026-9912', confidence: 0.95 },
      invoiceDate: { value: '2026-02-12', confidence: 0.94 },
      dueDate: { value: '2026-03-14', confidence: 0.93 },
      structuredCommunication: { value: '+++000/0001/23470+++', confidence: 0.99 },
      iban: { value: 'BE68539007547034', confidence: 0.98 },
      totalExclVat: { value: 245.0, confidence: 0.96 },
      vatRate: { value: 21, confidence: 0.9 },
      vatAmount: { value: 51.45, confidence: 0.95 },
      totalInclVat: { value: 296.45, confidence: 0.97 },
    },
    suggestion: {
      pcmnAccount: '616100',
      category: 'Télécom & Internet',
      label: 'Abonnements Télécom, Internet et Mobile',
      deductibilityRate: 100,
      deductibleVatRate: 100,
      isInvestment: false,
      description: 'Abonnement Fibre Bizz',
    },
    warnings: [],
    ...overrides,
  };
}

describe('inferVatRate', () => {
  it('prefers the explicitly detected rate', () => {
    expect(inferVatRate(100, null, null, 21)).toBe(21);
    expect(inferVatRate(100, null, null, 6)).toBe(6);
  });

  it('derives the rate from VAT/HTVA', () => {
    expect(inferVatRate(245, null, 51.45)).toBe(21);
    expect(inferVatRate(140, null, 16.8)).toBe(12);
    expect(inferVatRate(100, null, 6)).toBe(6);
    expect(inferVatRate(100, null, 0)).toBe(0);
  });

  it('derives the rate from TVAC/HTVA', () => {
    expect(inferVatRate(100, 121, null)).toBe(21);
    expect(inferVatRate(100, 106, null)).toBe(6);
  });

  it('returns null when nothing is consistent', () => {
    expect(inferVatRate(100, null, 7.7)).toBeNull(); // 7.7% → no Belgian rate
    expect(inferVatRate(null, null, null)).toBeNull();
  });
});

describe('mapOcrResultToForm', () => {
  it('maps a full extraction onto the form values', () => {
    const v = mapOcrResultToForm(makeResult());
    expect(v.supplierName).toBe('Proximus SA');
    expect(v.supplierBce).toBe('BE 0202.239.951');
    expect(v.invoiceNumber).toBe('PROX-2026-9912');
    expect(v.date).toBe('2026-02-12');
    expect(v.dueDate).toBe('2026-03-14');
    expect(v.amountExclVat).toBe(245.0);
    expect(v.vatRate).toBe(21);
    expect(v.vatAmount).toBe(51.45);
    expect(v.amountInclVat).toBe(296.45);
    expect(v.pcmnAccount).toBe('616100');
    expect(v.category).toBe('Télécom & Internet');
    expect(v.deductibilityRate).toBe(100);
    expect(v.deductibleVatRate).toBe(100);
    expect(v.structuredCommunication).toBe('+++000/0001/23470+++');
    expect(v.iban).toBe('BE68539007547034');
  });

  it('derives the HTVA from TVAC when the HTVA is missing', () => {
    const result = makeResult();
    delete result.fields.totalExclVat;
    const v = mapOcrResultToForm(result);
    expect(v.amountExclVat).toBeCloseTo(245.0, 1); // 296.45 / 1.21
    expect(v.vatRate).toBe(21);
  });

  it('falls back to the VAT number when no formatted BCE is present', () => {
    const result = makeResult();
    delete result.fields.supplierBce;
    const v = mapOcrResultToForm(result);
    expect(v.supplierBce).toBe('BE0202239951');
  });

  it('returns empty/null values for a bare result', () => {
    const result = makeResult({
      fields: {},
      suggestion: {
        pcmnAccount: null,
        category: null,
        label: null,
        deductibilityRate: null,
        deductibleVatRate: null,
        isInvestment: false,
        description: null,
      },
    });
    const v = mapOcrResultToForm(result);
    expect(v.supplierName).toBe('');
    expect(v.amountExclVat).toBeNull();
    expect(v.vatRate).toBeNull();
    expect(v.pcmnAccount).toBeNull();
  });
});

describe('ocrQualityDots', () => {
  it('reports per-field extraction quality', () => {
    const dots = ocrQualityDots(makeResult());
    expect(dots.find((d) => d.key === 'supplierName')?.ok).toBe(true);
    expect(dots.find((d) => d.key === 'totalInclVat')?.ok).toBe(true);
    expect(dots.find((d) => d.key === 'invoiceDate')?.confidence).toBe(0.94);
  });

  it('flags missing fields', () => {
    const result = makeResult();
    delete result.fields.invoiceDate;
    const dots = ocrQualityDots(result);
    expect(dots.find((d) => d.key === 'invoiceDate')?.ok).toBe(false);
  });
});

describe('isOcrAmountConsistent', () => {
  it('accepts consistent totals', () => {
    expect(isOcrAmountConsistent(makeResult())).toBe(true);
  });

  it('detects inconsistent totals', () => {
    const result = makeResult();
    result.fields.totalInclVat = { value: 999.0, confidence: 0.9 };
    expect(isOcrAmountConsistent(result)).toBe(false);
  });

  it('is lenient when amounts are missing', () => {
    const result = makeResult();
    delete result.fields.totalInclVat;
    expect(isOcrAmountConsistent(result)).toBe(true);
  });
});

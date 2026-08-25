import { describe, it, expect } from 'vitest';
import {
  runFiscalAudit,
  auditInvoice,
  auditExpense,
} from '../services/fiscalAudit';
import { INITIAL_COMPANY_PROFILE, INITIAL_INVOICES, INITIAL_PURCHASES } from '../data/mockBelgianData';
import type { Invoice, PurchaseExpense, InvoiceLine } from '../types/accounting';

function makeBadVatInvoice(): Invoice {
  const inv: Invoice = {
    ...INITIAL_INVOICES[0],
    id: 'inv-bad-vat',
    invoiceNumber: 'BAD-001',
    lines: [
      {
        id: 'l-1',
        description: 'Prestation incohérente',
        pcmnAccount: '705000',
        quantity: 1,
        unitPrice: 1000,
        vatRate: 21,
        vatRegime: 'standard_21',
        totalExclVat: 1000,
        vatAmount: 999, // wrong — should be 210
        totalInclVat: 1999,
      } as InvoiceLine,
    ],
    totalVatAmount: 999,
    subtotalExclVat: 1000,
    totalInclVat: 1999,
  };
  return inv;
}

describe('Fiscal anomaly detection engine', () => {
  it('flags a line VAT arithmetic mismatch (FIS-001)', () => {
    const issues = auditInvoice(makeBadVatInvoice());
    expect(issues.some((i) => i.code === 'FIS-001')).toBe(true);
  });

  it('flags an invalid supplier BCE (FIS-103)', () => {
    const bad: PurchaseExpense = {
      ...INITIAL_PURCHASES[0],
      id: 'exp-bad-bce',
      supplierBce: 'BE 0000.000.000',
    };
    const issues = auditExpense(bad);
    expect(issues.some((i) => i.code === 'FIS-103')).toBe(true);
  });

  it('flags non-deductible restaurant VAT (FIS-101)', () => {
    const resto: PurchaseExpense = {
      ...INITIAL_PURCHASES[2], // restaurant
      id: 'exp-resto',
      pcmnAccount: '615100',
      deductibleVatRate: 50, // should be 0 in Belgium
    };
    const issues = auditExpense(resto);
    expect(issues.some((i) => i.code === 'FIS-101')).toBe(true);
  });

  it('runs a full audit and returns a structured report', () => {
    const report = runFiscalAudit(INITIAL_INVOICES, INITIAL_PURCHASES, INITIAL_COMPANY_PROFILE);
    expect(report).toBeDefined();
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.riskScore).toBeGreaterThanOrEqual(0);
    expect(report.riskScore).toBeLessThanOrEqual(100);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.grids).toBeDefined();
  });
});

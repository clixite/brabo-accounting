import { describe, expect, it } from 'vitest';
import {
  computeCashFlow,
  computeMonthlyRevenue,
  computeOverdueAging,
  computeProfitLoss,
} from '../services/reporting';
import {
  INITIAL_BANK_TRANSACTIONS,
  INITIAL_INVOICES,
} from '../data/mockBelgianData';
import type { BankTransaction, Invoice, InvoiceLine, PurchaseExpense } from '../types/accounting';

function makeInvoice(overrides: Partial<Invoice>): Invoice {
  const line: InvoiceLine = {
    id: 'l1',
    description: 'Prestation',
    pcmnAccount: '705000',
    quantity: 1,
    unitPrice: 1000,
    vatRate: 21,
    vatRegime: 'standard_21',
    totalExclVat: 1000,
    vatAmount: 210,
    totalInclVat: 1210,
  };
  return {
    id: 'inv-x',
    type: 'invoice',
    invoiceNumber: 'X-1',
    date: '2026-01-10',
    dueDate: '2026-02-09',
    client: {
      id: 'c1',
      name: 'Client',
      bceNumber: 'BE 0477.472.701',
      vatNumber: 'BE0477472701',
      peppolEndpointId: '0208:0477472701',
      isPeppolEnabled: true,
      street: 'Rue',
      number: '1',
      postalCode: '1000',
      city: 'Bruxelles',
      country: 'Belgique',
      email: 'x@x.be',
    },
    lines: [line],
    subtotalExclVat: 1000,
    vatBreakdown: [{ rate: 21, regime: 'standard_21', baseAmount: 1000, vatAmount: 210 }],
    totalVatAmount: 210,
    totalInclVat: 1210,
    structuredCommunication: '+++000/0000/00097+++',
    status: 'sent',
    paymentTermsDays: 30,
    createdAt: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<PurchaseExpense>): PurchaseExpense {
  return {
    id: 'e1',
    supplierName: 'Fournisseur',
    supplierBce: 'BE 0202.239.951',
    invoiceNumber: 'F-1',
    date: '2026-01-05',
    dueDate: '2026-02-05',
    category: 'Télécom',
    pcmnAccount: '616100',
    description: 'Abonnement',
    amountExclVat: 200,
    vatRate: 21,
    vatAmount: 42,
    amountInclVat: 242,
    deductibilityRate: 100,
    deductibleVatRate: 100,
    deductibleAmount: 200,
    nonDeductibleAmount: 0,
    deductibleVat: 42,
    nonDeductibleVat: 0,
    status: 'approved',
    ...overrides,
  };
}

describe('P&L statement', () => {
  it('computes revenue, expenses, gross result and VAT net', () => {
    const invoices = [
      makeInvoice({ id: 'a', subtotalExclVat: 5000, totalVatAmount: 1050 }),
      makeInvoice({ id: 'b', type: 'credit_note', subtotalExclVat: 1000, totalVatAmount: 210 }),
    ];
    const purchases = [makeExpense({ amountExclVat: 200, deductibleVat: 42 })];
    const pl = computeProfitLoss(invoices, purchases);

    expect(pl.revenueExclVat).toBeCloseTo(4000, 2); // 5000 − 1000 (note de crédit)
    expect(pl.expensesExclVat).toBeCloseTo(200, 2);
    expect(pl.grossResult).toBeCloseTo(3800, 2);
    expect(pl.vatCollected).toBeCloseTo(840, 2); // 1050 − 210
    expect(pl.vatDeductible).toBeCloseTo(42, 2);
    expect(pl.vatNet).toBeCloseTo(798, 2);
  });

  it('skips pending expenses and cancelled invoices', () => {
    const invoices = [makeInvoice({ status: 'cancelled', subtotalExclVat: 5000 })];
    const purchases = [makeExpense({ status: 'pending', amountExclVat: 999 })];
    const pl = computeProfitLoss(invoices, purchases);
    expect(pl.revenueExclVat).toBe(0);
    expect(pl.expensesExclVat).toBe(0);
  });
});

describe('Cash flow', () => {
  it('splits inflows and outflows and nets them', () => {
    const txns: BankTransaction[] = [
      { id: '1', statementNumber: '001', date: '2026-01-01', valutaDate: '2026-01-01', amount: 1000, currency: 'EUR', counterpartyName: 'A', counterpartyIban: 'BE1', communication: '', isStructured: false, reconciled: false },
      { id: '2', statementNumber: '001', date: '2026-01-02', valutaDate: '2026-01-02', amount: -400, currency: 'EUR', counterpartyName: 'B', counterpartyIban: 'BE2', communication: '', isStructured: false, reconciled: false },
    ];
    const cash = computeCashFlow(txns);
    expect(cash.inflows).toBeCloseTo(1000, 2);
    expect(cash.outflows).toBeCloseTo(400, 2);
    expect(cash.netCashFlow).toBeCloseTo(600, 2);
  });
});

describe('Overdue aging', () => {
  it('buckets unpaid invoices by days past due', () => {
    const asOf = '2026-04-01';
    const invoices = [
      makeInvoice({ id: 'cur', dueDate: '2026-04-10', status: 'sent', totalInclVat: 1000 }), // future
      makeInvoice({ id: 'd10', dueDate: '2026-03-22', status: 'sent', totalInclVat: 2000 }), // 10 days late
      makeInvoice({ id: 'd45', dueDate: '2026-02-15', status: 'sent', totalInclVat: 3000 }), // 45 days late
      makeInvoice({ id: 'd90', dueDate: '2026-01-01', status: 'sent', totalInclVat: 4000 }), // 90 days late
      makeInvoice({ id: 'paid', dueDate: '2026-02-01', status: 'paid', totalInclVat: 5000 }), // paid
    ];
    const aging = computeOverdueAging(invoices, asOf);
    expect(aging.totalCount).toBe(4);
    expect(aging.totalAmount).toBeCloseTo(10000, 2);
    expect(aging.buckets.find((b) => b.key === '0_30')!.amount).toBeCloseTo(2000, 2);
    expect(aging.buckets.find((b) => b.key === '31_60')!.amount).toBeCloseTo(3000, 2);
    expect(aging.buckets.find((b) => b.key === '60plus')!.amount).toBeCloseTo(4000, 2);
  });
});

describe('Monthly revenue series', () => {
  it('returns 12 points and sums revenue per month', () => {
    const invoices = [
      makeInvoice({ id: 'j1', date: '2026-01-15', subtotalExclVat: 1000 }),
      makeInvoice({ id: 'j2', date: '2026-01-20', subtotalExclVat: 500 }),
      makeInvoice({ id: 'f1', date: '2026-02-05', subtotalExclVat: 700 }),
    ];
    const series = computeMonthlyRevenue(invoices, 2026);
    expect(series.length).toBe(12);
    expect(series[0].revenue).toBeCloseTo(1500, 2);
    expect(series[1].revenue).toBeCloseTo(700, 2);
    expect(series[2].revenue).toBe(0);
  });

  it('works on the seeded dataset', () => {
    const series = computeMonthlyRevenue(INITIAL_INVOICES, 2026);
    expect(series.length).toBe(12);
    expect(INITIAL_BANK_TRANSACTIONS.length).toBeGreaterThan(0);
  });
});

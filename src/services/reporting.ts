/**
 * BRABO — management reporting engine.
 *
 * Pure, dependency-free financial statements computed from the in-memory
 * domain model (sales invoices, purchase expenses, bank transactions). Used by
 * the client "Rapports" view and the cabinet's consolidated pilotage screen.
 */

import type { BankTransaction, Invoice, PurchaseExpense } from '../types/accounting';

export interface ProfitLossStatement {
  revenueExclVat: number;
  expensesExclVat: number;
  grossResult: number;
  vatCollected: number;
  vatDeductible: number;
  vatNet: number;
}

export interface CashFlowStatement {
  inflows: number;
  outflows: number;
  netCashFlow: number;
}

export interface OverdueBucket {
  key: 'current' | '0_30' | '31_60' | '60plus';
  label: string;
  count: number;
  amount: number;
}

export interface OverdueAging {
  buckets: OverdueBucket[];
  totalCount: number;
  totalAmount: number;
}

export interface MonthlyRevenuePoint {
  month: string;
  revenue: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function activeInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.filter((i) => i.status !== 'cancelled');
}

function activeExpenses(purchases: PurchaseExpense[]): PurchaseExpense[] {
  return purchases.filter((p) => p.status !== 'pending');
}

/** Simplified P&L: revenue − expenses = gross result, plus VAT position. */
export function computeProfitLoss(
  invoices: Invoice[],
  purchases: PurchaseExpense[],
): ProfitLossStatement {
  let revenueExclVat = 0;
  let vatCollected = 0;

  for (const inv of activeInvoices(invoices)) {
    const sign = inv.type === 'credit_note' ? -1 : 1;
    revenueExclVat += inv.subtotalExclVat * sign;
    vatCollected += inv.totalVatAmount * sign;
  }

  const expensesExclVat = activeExpenses(purchases).reduce((a, p) => a + p.amountExclVat, 0);
  const vatDeductible = activeExpenses(purchases).reduce((a, p) => a + p.deductibleVat, 0);

  return {
    revenueExclVat: round2(revenueExclVat),
    expensesExclVat: round2(expensesExclVat),
    grossResult: round2(revenueExclVat - expensesExclVat),
    vatCollected: round2(vatCollected),
    vatDeductible: round2(vatDeductible),
    vatNet: round2(vatCollected - vatDeductible),
  };
}

export function computeCashFlow(transactions: BankTransaction[]): CashFlowStatement {
  const inflows = transactions.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const outflows = transactions
    .filter((t) => t.amount < 0)
    .reduce((a, t) => a + Math.abs(t.amount), 0);

  return {
    inflows: round2(inflows),
    outflows: round2(outflows),
    netCashFlow: round2(inflows - outflows),
  };
}

/** Buckets unpaid invoices by days past due date. */
export function computeOverdueAging(invoices: Invoice[], asOf?: string): OverdueAging {
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  const buckets: OverdueBucket[] = [
    { key: 'current', label: 'À échoir', count: 0, amount: 0 },
    { key: '0_30', label: '0 – 30 j', count: 0, amount: 0 },
    { key: '31_60', label: '31 – 60 j', count: 0, amount: 0 },
    { key: '60plus', label: '> 60 j', count: 0, amount: 0 },
  ];

  let totalCount = 0;
  let totalAmount = 0;

  for (const inv of activeInvoices(invoices)) {
    if (inv.type !== 'invoice' || inv.status === 'paid' || inv.status === 'draft') continue;
    const daysPastDue = Math.floor((Date.parse(today) - Date.parse(inv.dueDate)) / 86_400_000);
    const bucket =
      daysPastDue <= 0
        ? buckets[0]
        : daysPastDue <= 30
          ? buckets[1]
          : daysPastDue <= 60
            ? buckets[2]
            : buckets[3];

    bucket.count += 1;
    bucket.amount = round2(bucket.amount + inv.totalInclVat);
    totalCount += 1;
    totalAmount = round2(totalAmount + inv.totalInclVat);
  }

  return { buckets, totalCount, totalAmount };
}

/** Monthly revenue series (excl. VAT) for a fiscal year — for charting. */
export function computeMonthlyRevenue(invoices: Invoice[], year: number): MonthlyRevenuePoint[] {
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  return months.map((month) => {
    const prefix = `${year}-${month}`;
    const revenue = activeInvoices(invoices)
      .filter((i) => i.type === 'invoice' && i.date.startsWith(prefix))
      .reduce((a, i) => a + i.subtotalExclVat, 0);
    return { month: `${year}-${month}`, revenue: round2(revenue) };
  });
}

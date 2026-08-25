import { describe, expect, it } from 'vitest';
import {
  autoEncodeTransactions,
  suggestExpenseBooking,
} from '../services/autoBooker';
import type { BankTransaction } from '../types/accounting';

function makeTx(overrides: Partial<BankTransaction>): BankTransaction {
  return {
    id: 'tx-1',
    statementNumber: '001',
    date: '2026-02-15',
    valutaDate: '2026-02-15',
    amount: -242.0,
    currency: 'EUR',
    counterpartyName: 'Fournisseur',
    counterpartyIban: 'BE68 0000 0000 0000',
    communication: '',
    isStructured: false,
    reconciled: false,
    ...overrides,
  };
}

describe('Automatic booking — classification', () => {
  it('classifies a telecom counterparty to PCMN 616100 with full deductibility', () => {
    const s = suggestExpenseBooking('PROXIMUS SA', 'Abonnement telecom pro');
    expect(s.pcmnAccount).toBe('616100');
    expect(s.vatRate).toBe(21);
    expect(s.deductibilityRate).toBe(100);
    expect(s.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('classifies fuel to the vehicle account with 50 % VAT recoverable', () => {
    const s = suggestExpenseBooking('SHELL STATION', 'Carburant diesel');
    expect(s.pcmnAccount).toBe('614100');
    expect(s.deductibleVatRate).toBe(50);
  });

  it('falls back to a generic account with low confidence for unknown suppliers', () => {
    const s = suggestExpenseBooking('FOURNISSEUR INCONNU XYZ', '');
    expect(s.confidence).toBeLessThan(0.8);
    expect(s.pcmnAccount).toBe('611000');
  });
});

describe('Automatic booking — transaction encoding', () => {
  it('encodes a debit transaction into a pending expense with correct VAT split', () => {
    const drafts = autoEncodeTransactions([
      makeTx({ id: 'tx-a', amount: -242.0, counterpartyName: 'PROXIMUS SA', communication: 'Abonnement' }),
    ]);
    expect(drafts.length).toBe(1);
    const d = drafts[0];
    expect(d.supplierName).toBe('PROXIMUS SA');
    expect(d.pcmnAccount).toBe('616100');
    expect(d.amountInclVat).toBeCloseTo(242.0, 2);
    expect(d.amountExclVat).toBeCloseTo(200.0, 2);
    expect(d.vatAmount).toBeCloseTo(42.0, 2);
    expect(d.deductibleVat).toBeCloseTo(42.0, 2);
    expect(d.status).toBe('pending');
  });

  it('skips credit movements, reconciled rows and already-matched rows', () => {
    const drafts = autoEncodeTransactions([
      makeTx({ id: 'credit', amount: 1000.0 }), // receipt
      makeTx({ id: 'reconciled', amount: -50.0, reconciled: true }),
      makeTx({ id: 'matched', amount: -50.0, matchedExpenseId: 'exp-1' }),
    ]);
    expect(drafts.length).toBe(0);
  });

  it('applies 50 % VAT recoverability for vehicle fuel', () => {
    const drafts = autoEncodeTransactions([
      makeTx({ id: 'fuel', amount: -121.0, counterpartyName: 'SHELL', communication: 'Carburant' }),
    ]);
    // 121 incl → 100 excl + 21 VAT; recoverable VAT = 10.50
    expect(drafts[0].amountExclVat).toBeCloseTo(100.0, 2);
    expect(drafts[0].vatAmount).toBeCloseTo(21.0, 2);
    expect(drafts[0].deductibleVat).toBeCloseTo(10.5, 2);
    expect(drafts[0].nonDeductibleVat).toBeCloseTo(10.5, 2);
  });
});

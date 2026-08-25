import { describe, it, expect } from 'vitest';
import {
  buildLedger,
  verifyLedgerBalance,
  assertLedgerBalanced,
  exportFiduciaryPackage,
  listFiduciaryFormats,
} from '../services/fiduciaryBridge';
import { INITIAL_COMPANY_PROFILE, INITIAL_INVOICES, INITIAL_PURCHASES } from '../data/mockBelgianData';

describe('Fiduciary bridge — Belgian double-entry ledger', () => {
  it('builds a non-empty ledger', () => {
    const ledger = buildLedger(INITIAL_INVOICES, INITIAL_PURCHASES);
    expect(ledger.entries.length).toBeGreaterThan(0);
    expect(ledger.salesEntries.length).toBeGreaterThan(0);
    expect(ledger.purchaseEntries.length).toBeGreaterThan(0);
  });

  it('verifies the double-entry balance (Σ debits = Σ credits)', () => {
    const ledger = buildLedger(INITIAL_INVOICES, INITIAL_PURCHASES);
    const report = verifyLedgerBalance(ledger.entries);
    expect(report.isBalanced).toBe(true);
    expect(report.difference).toBeCloseTo(0, 2);
    expect(report.unbalancedEntries).toHaveLength(0);
  });

  it('assertLedgerBalanced does not throw for a balanced ledger', () => {
    const ledger = buildLedger(INITIAL_INVOICES, INITIAL_PURCHASES);
    expect(() => assertLedgerBalanced(ledger.entries)).not.toThrow();
  });

  it('exports a verified Sage BOB 50 package', () => {
    const pkg = exportFiduciaryPackage(INITIAL_INVOICES, INITIAL_PURCHASES, INITIAL_COMPANY_PROFILE, 'sage_bob50');
    expect(pkg.isValid).toBe(true);
    expect(pkg.files.length).toBeGreaterThan(0);
    expect(pkg.balanceReport.isBalanced).toBe(true);
  });

  it('exports packages for every supported target', () => {
    for (const format of ['winbooks', 'horus', 'exact_online', 'octopus', 'yuki', 'full_bundle'] as const) {
      const pkg = exportFiduciaryPackage(INITIAL_INVOICES, INITIAL_PURCHASES, INITIAL_COMPANY_PROFILE, format);
      expect(pkg.isValid).toBe(true);
      expect(pkg.files.length).toBeGreaterThan(0);
    }
  });

  it('lists all available formats', () => {
    const formats = listFiduciaryFormats();
    expect(formats.some((f) => f.value === 'sage_bob50')).toBe(true);
    expect(formats.some((f) => f.value === 'full_bundle')).toBe(true);
  });
});

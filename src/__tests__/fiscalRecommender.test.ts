import { describe, expect, it } from 'vitest';
import { recommendFiscalStrategy } from '../services/fiscalRecommender';
import type { ClientFinancialProfile } from '../services/fiscalRecommender';

function makeProfile(overrides: Partial<ClientFinancialProfile> = {}): ClientFinancialProfile {
  return {
    turnoverExclVat: 100000,
    vatCollected: 21000,
    vatDeductible: 5000,
    expensesExclVat: 40000,
    overdueCount: 0,
    overdueAmount: 0,
    selfDeclarationGranted: false,
    vatRegime: 'quarterly',
    hasDirectorRemuneration45k: true,
    ...overrides,
  };
}

describe('Fiscal strategy recommender', () => {
  it('flags overdue receivables as critical with a recoverable estimate', () => {
    const recs = recommendFiscalStrategy(makeProfile({ overdueCount: 3, overdueAmount: 6000 }));
    const rec = recs.find((r) => r.id === 'recouvrement');
    expect(rec).toBeDefined();
    expect(rec!.severity).toBe('critical');
    // 6000 * 0.125 + 3 * 40 = 750 + 120 = 870
    expect(rec!.estimatedBenefit).toBeCloseTo(870, 2);
  });

  it('recommends securing the reduced ISOC rate when the 45 k€ condition is unmet', () => {
    const recs = recommendFiscalStrategy(makeProfile({ hasDirectorRemuneration45k: false }));
    const rec = recs.find((r) => r.id === 'isoc_reduced');
    expect(rec).toBeDefined();
    expect(rec!.severity).toBe('important');
    // profit = 100000 − 40000 = 60000 → 60000 * 0.05 = 3000
    expect(rec!.estimatedBenefit).toBeCloseTo(3000, 2);
  });

  it('recommends PLCI/VAPZ for profitable clients', () => {
    const recs = recommendFiscalStrategy(makeProfile({ turnoverExclVat: 80000, expensesExclVat: 20000 }));
    const rec = recs.find((r) => r.id === 'plci_vapz');
    expect(rec).toBeDefined();
    expect(rec!.category).toBe('PLCI');
  });

  it('warns when the franchise VAT threshold is about to be crossed', () => {
    const recs = recommendFiscalStrategy(
      makeProfile({ vatRegime: 'franchise_art56bis', turnoverExclVat: 24000 }),
    );
    const rec = recs.find((r) => r.id === 'franchise_threshold');
    expect(rec).toBeDefined();
    expect(rec!.severity).toBe('critical');
  });

  it('always reports the self-declaration status', () => {
    const recs = recommendFiscalStrategy(makeProfile());
    expect(recs.some((r) => r.id === 'declaration_status')).toBe(true);
  });

  it('sorts critical before important before opportunity', () => {
    const recs = recommendFiscalStrategy(makeProfile({ overdueCount: 1, overdueAmount: 500 }));
    expect(recs[0].severity).toBe('critical');
    const severities = recs.map((r) => r.severity);
    const rank: Record<string, number> = { critical: 0, important: 1, opportunity: 2 };
    for (let i = 1; i < severities.length; i += 1) {
      expect(rank[severities[i - 1]]).toBeLessThanOrEqual(rank[severities[i]]);
    }
  });
});

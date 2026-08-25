import { describe, expect, it } from 'vitest';
import {
  compareDividendRegimes,
  simulateAtn,
  simulateIsoc,
} from '../services/fiscalStrategy';

describe('ISOC / corporate tax (20 % vs 25 %)', () => {
  it('applies the 20 % reduced SME rate under 100 k€ with director remuneration', () => {
    const sim = simulateIsoc(85000, true);
    expect(sim.taxAmount).toBeCloseTo(17000, 2);
    expect(sim.effectiveRate).toBeCloseTo(20, 1);
    expect(sim.savings).toBeCloseTo(4250, 2);
  });

  it('applies 20 % on the first tranche and 25 % above 100 k€', () => {
    const sim = simulateIsoc(150000, true);
    // 100000 * 0.20 + 50000 * 0.25 = 20000 + 12500 = 32500
    expect(sim.taxAmount).toBeCloseTo(32500, 2);
    expect(sim.savings).toBeCloseTo(5000, 2);
  });

  it('falls back to the 25 % standard rate without director remuneration', () => {
    const sim = simulateIsoc(85000, false);
    expect(sim.taxAmount).toBeCloseTo(21250, 2);
    expect(sim.savings).toBe(0);
  });
});

describe('Dividend regime comparison', () => {
  it('returns the three Belgian regimes with the correct net received', () => {
    const comparison = compareDividendRegimes(100000);
    const byKind = Object.fromEntries(comparison.regimes.map((r) => [r.kind, r]));

    expect(comparison.regimes.length).toBe(3);
    expect(byKind.vvpr_bis.netReceived).toBeCloseTo(85000, 2);
    expect(byKind.ordinary.netReceived).toBeCloseTo(70000, 2);
    expect(byKind.liquidation_reserve.netReceived).toBeCloseTo(95000, 2);
    expect(byKind.liquidation_reserve.upfrontRate).toBe(10);
  });
});

describe('Company car ATN / VAA', () => {
  it('enforces the 1 600 € annual minimum', () => {
    const sim = simulateAtn(1000, 0, 'electric', 6);
    expect(sim.annualAtn).toBe(1600);
    expect(sim.monthlyAtn).toBeCloseTo(1600 / 12, 2);
  });

  it('uses the 4 % CO₂ rate for a full-electric vehicle', () => {
    const sim = simulateAtn(55000, 0, 'electric', 6);
    expect(sim.co2Percentage).toBe(4.0);
  });

  it('applies the age coefficient after 60 months', () => {
    const sim = simulateAtn(55000, 91, 'petrol', 70);
    expect(sim.ageCoefficient).toBe(0.7);
  });
});

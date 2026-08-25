import { describe, expect, it } from 'vitest';
import { computePayroll, computeWithholdingTax } from '../services/payroll';

describe('Belgian withholding tax (précompte professionnel)', () => {
  it('is zero under the 1 500 € monthly bracket', () => {
    expect(computeWithholdingTax(1500)).toBe(0);
    expect(computeWithholdingTax(1000)).toBe(0);
  });

  it('applies 26.75 % on the 1 500–2 500 € tranche', () => {
    // (2000 − 1500) × 0.2675 = 133.75
    expect(computeWithholdingTax(2000)).toBeCloseTo(133.75, 2);
  });

  it('stacks the marginal tranches', () => {
    // 1000 × 0.2675 + 1000 × 0.385 = 652.50
    expect(computeWithholdingTax(3500)).toBeCloseTo(652.5, 2);
  });
});

describe('Belgian payroll (brut → net + coût employeur)', () => {
  it('computes the full breakdown for a 3 500 € gross salary', () => {
    const p = computePayroll(3500);

    expect(p.grossMonthly).toBe(3500);
    expect(p.employeeOnss).toBeCloseTo(457.45, 2); // 3500 × 0.1307
    expect(p.taxableIncome).toBeCloseTo(3042.55, 2);
    expect(p.withholdingTax).toBeCloseTo(476.38, 2);
    expect(p.netMonthly).toBeCloseTo(2566.17, 2);
    expect(p.employerOnss).toBeCloseTo(875, 2); // 3500 × 0.25
    expect(p.employerTotalCost).toBeCloseTo(4375, 2);
    expect(p.netAnnual).toBeCloseTo(2566.17 * 12, 2);
    expect(p.employerAnnualCost).toBeCloseTo(4375 * 12, 2);
  });

  it('returns zero for a zero or negative gross', () => {
    const p = computePayroll(-100);
    expect(p.grossMonthly).toBe(0);
    expect(p.netMonthly).toBe(0);
    expect(p.employerTotalCost).toBe(0);
  });
});

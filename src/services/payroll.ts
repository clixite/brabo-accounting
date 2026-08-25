/**
 * BRABO — Belgian payroll simulator (salaire brut → net + coût employeur).
 *
 * Simplified but realistic 2026 barèmes:
 *  - Employee ONSS (cotisation sociale) : 13,07 % of gross.
 *  - Précompte professionnel : progressive marginal scale on the taxable base.
 *  - Employer ONSS : 25 % of gross (coût patronal total).
 *
 * This is a planning/simulation tool (the "paie" module), not a substitute for
 * a certified social-secretariat (SD Worx, Acerta, Liantis…) integration.
 */

export interface PayrollResult {
  grossMonthly: number;
  employeeOnss: number;
  taxableIncome: number;
  withholdingTax: number;
  netMonthly: number;
  employerOnss: number;
  employerTotalCost: number;
  netAnnual: number;
  employerAnnualCost: number;
}

export const EMPLOYEE_ONSS_RATE = 0.1307;
export const EMPLOYER_ONSS_RATE = 0.25;

/** Marginal précompte professionnel brackets (monthly taxable base, EUR). */
export const WITHHOLDING_BRACKETS: readonly { upTo: number; rate: number }[] = [
  { upTo: 1500, rate: 0 },
  { upTo: 2500, rate: 0.2675 },
  { upTo: 3500, rate: 0.385 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.435 },
];

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Progressive withholding tax on the monthly taxable base. */
export function computeWithholdingTax(taxableMonthly: number): number {
  let remaining = Math.max(0, taxableMonthly);
  let tax = 0;
  let lowerBound = 0;

  for (const bracket of WITHHOLDING_BRACKETS) {
    const width = bracket.upTo - lowerBound;
    const slice = Math.max(0, Math.min(remaining, width));
    tax += slice * bracket.rate;
    remaining -= slice;
    lowerBound = bracket.upTo;
    if (remaining <= 0) break;
  }

  return round2(tax);
}

/** Full monthly payroll breakdown (gross → net + employer cost). */
export function computePayroll(grossMonthly: number): PayrollResult {
  const gross = Math.max(0, grossMonthly);
  const employeeOnss = round2(gross * EMPLOYEE_ONSS_RATE);
  const taxableIncome = round2(gross - employeeOnss);
  const withholdingTax = computeWithholdingTax(taxableIncome);
  const netMonthly = round2(taxableIncome - withholdingTax);
  const employerOnss = round2(gross * EMPLOYER_ONSS_RATE);
  const employerTotalCost = round2(gross + employerOnss);

  return {
    grossMonthly: gross,
    employeeOnss,
    taxableIncome,
    withholdingTax,
    netMonthly,
    employerOnss,
    employerTotalCost,
    netAnnual: round2(netMonthly * 12),
    employerAnnualCost: round2(employerTotalCost * 12),
  };
}

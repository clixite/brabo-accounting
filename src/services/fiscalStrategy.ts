/**
 * BRABO — Belgian fiscal strategy engine (cabinet side).
 *
 * Pure, deterministic simulations the ITAA accountant uses to "improve and
 * optimise" a client's tax position: ISOC/venB corporate tax (20% reduced SME
 * rate vs 25%), the dividend-distribution regimes (VVPR-bis, liquidation
 * reserve, ordinary), and the ATN/VAA company-car benefit. Social contributions
 * (INASTI/RSVZ + PLCI/VAPZ) are re-exported from the shared accounting utils.
 *
 * References: CIR 92 art. 215 (ISOC), art. 269/171 (précompte mobilier), and
 * the company-car ATN formula (CO₂ × 6/7, minimum 1 600 €/an).
 */

export const ISOC_REDUCED_TRANCHE = 100_000;
export const ISOC_REDUCED_RATE = 0.2;
export const ISOC_STANDARD_RATE = 0.25;

export interface IsocSimulation {
  taxableProfit: number;
  /** True when the 45 000 € director-remuneration condition is met (SME rate). */
  isSmeEligible: boolean;
  taxAmount: number;
  effectiveRate: number;
  standardTax: number;
  savings: number;
  netAfterTax: number;
}

/** Corporate income tax (impôt des sociétés / vennootschapsbelasting). */
export function simulateIsoc(
  taxableProfit: number,
  hasDirectorRemuneration45k: boolean,
): IsocSimulation {
  const profit = Math.max(0, taxableProfit);
  const eligible = hasDirectorRemuneration45k;

  let taxAmount: number;
  if (eligible && profit <= ISOC_REDUCED_TRANCHE) {
    taxAmount = profit * ISOC_REDUCED_RATE;
  } else if (eligible) {
    taxAmount =
      ISOC_REDUCED_TRANCHE * ISOC_REDUCED_RATE + (profit - ISOC_REDUCED_TRANCHE) * ISOC_STANDARD_RATE;
  } else {
    taxAmount = profit * ISOC_STANDARD_RATE;
  }

  const standardTax = profit * ISOC_STANDARD_RATE;
  return {
    taxableProfit: profit,
    isSmeEligible: eligible,
    taxAmount,
    effectiveRate: profit > 0 ? (taxAmount / profit) * 100 : 0,
    standardTax,
    savings: Math.max(0, standardTax - taxAmount),
    netAfterTax: profit - taxAmount,
  };
}

export type DividendRegimeKind = 'vvpr_bis' | 'liquidation_reserve' | 'ordinary';

export interface DividendRegime {
  kind: DividendRegimeKind;
  label: string;
  withholdingRate: number;
  /** Net amount actually received by the shareholder (per € gross). */
  netReceived: number;
  /** Immediate tax paid at constitution (liquidation reserve) when applicable. */
  upfrontRate: number;
  waitingYears: number;
  description: string;
}

export interface DividendComparison {
  grossAmount: number;
  regimes: DividendRegime[];
}

/**
 * Compares the three Belgian dividend-distribution regimes for a given gross
 * distributable amount. Rates: VVPR-bis 15 %, liquidation reserve 10 % up front
 * + 5 % at distribution (after 5 years), ordinary 30 %.
 */
export function compareDividendRegimes(grossAmount: number): DividendComparison {
  const gross = Math.max(0, grossAmount);
  return {
    grossAmount: gross,
    regimes: [
      {
        kind: 'vvpr_bis',
        label: 'VVPR-bis',
        withholdingRate: 15,
        netReceived: gross * 0.85,
        upfrontRate: 0,
        waitingYears: 3,
        description: 'Sociétés constituées après le 01/07/2013, actions nominatives nouvelles libérées.',
      },
      {
        kind: 'liquidation_reserve',
        label: 'Réserve de liquidation',
        withholdingRate: 5,
        netReceived: gross * 0.95,
        upfrontRate: 10,
        waitingYears: 5,
        description: '10 % à la constitution + 5 % à la distribution après 5 ans.',
      },
      {
        kind: 'ordinary',
        label: 'Dividende ordinaire',
        withholdingRate: 30,
        netReceived: gross * 0.7,
        upfrontRate: 0,
        waitingYears: 0,
        description: 'Taux standard sans condition de délai ni de capital.',
      },
    ],
  };
}

export type AtnFuelType = 'electric' | 'petrol' | 'diesel' | 'hybrid';

export interface AtnSimulation {
  monthlyAtn: number;
  annualAtn: number;
  co2Percentage: number;
  ageCoefficient: number;
}

const ATN_MIN_ANNUAL = 1600;
const REF_CO2_PETROL = 91;
const REF_CO2_DIESEL = 71;

/**
 * Company-car benefit in kind (ATN / voordeel alle aard).
 * Value = catalogue × age coefficient × CO₂ % × 6/7, minimum 1 600 €/an.
 */
export function simulateAtn(
  catalogValue: number,
  co2Grams: number,
  fuelType: AtnFuelType,
  ageMonths: number,
): AtnSimulation {
  let co2Percentage = 5.5;
  if (fuelType === 'electric') {
    co2Percentage = 4.0;
  } else if (fuelType === 'petrol') {
    co2Percentage = 5.5 + (co2Grams - REF_CO2_PETROL) * 0.1;
  } else if (fuelType === 'hybrid') {
    co2Percentage = 5.5 + (co2Grams - REF_CO2_PETROL) * 0.1;
  } else {
    co2Percentage = 5.5 + (co2Grams - REF_CO2_DIESEL) * 0.1;
  }
  co2Percentage = Math.min(18.0, Math.max(4.0, co2Percentage));

  let ageCoefficient = 1.0;
  if (ageMonths > 60) ageCoefficient = 0.7;
  else if (ageMonths > 48) ageCoefficient = 0.76;
  else if (ageMonths > 36) ageCoefficient = 0.82;
  else if (ageMonths > 24) ageCoefficient = 0.88;
  else if (ageMonths > 12) ageCoefficient = 0.94;

  const rawAnnual = catalogValue * ageCoefficient * (co2Percentage / 100) * (6 / 7);
  const annualAtn = Math.max(ATN_MIN_ANNUAL, rawAnnual);

  return {
    monthlyAtn: annualAtn / 12,
    annualAtn,
    co2Percentage,
    ageCoefficient,
  };
}

export { simulateBelgianSocialContributions } from '../utils/belgianAccounting';

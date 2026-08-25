import { describe, expect, it } from 'vitest';
import {
  calculateVatGrids,
  generateIntervatVatDeclarationXml,
} from '../utils/belgianAccounting';
import {
  INITIAL_COMPANY_PROFILE,
  INITIAL_INVOICES,
  INITIAL_PURCHASES,
} from '../data/mockBelgianData';

describe('Intervat periodic VAT return XML (déclaration périodique)', () => {
  const grids = calculateVatGrids(INITIAL_INVOICES, INITIAL_PURCHASES, '2026-Q1');

  it('emits a well-formed declaration with the declarant VAT number', () => {
    const xml = generateIntervatVatDeclarationXml(INITIAL_COMPANY_PROFILE, grids);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('VATDeclarationConsignment');
    // VAT number is normalised to digits (BE prefix stripped).
    expect(xml).toContain('0789456175');
  });

  it('carries the period, year and every official grid', () => {
    const xml = generateIntervatVatDeclarationXml(INITIAL_COMPANY_PROFILE, grids);
    expect(xml).toContain('<Period>2026-Q1</Period>');
    expect(xml).toContain('<Year>2026</Year>');
    for (const grid of ['Grid00', 'Grid03', 'Grid54', 'Grid59', 'Grid71', 'Grid72']) {
      expect(xml).toContain(`<${grid}>`);
    }
  });

  it('reflects the computed balance (grid71 vs grid72)', () => {
    const xml = generateIntervatVatDeclarationXml(INITIAL_COMPANY_PROFILE, grids);
    expect(xml).toContain(`<Grid71>${grids.grid71.toFixed(2)}</Grid71>`);
    expect(xml).toContain(`<Grid72>${grids.grid72.toFixed(2)}</Grid72>`);
    // Exactly one of the two balance lines is non-zero.
    expect(grids.grid71 === 0 || grids.grid72 === 0).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  validateInvoiceSchematron,
  validateInvoiceBatch,
  summarizeBatch,
} from '../services/schematronValidator';
import { INITIAL_COMPANY_PROFILE, INITIAL_INVOICES } from '../data/mockBelgianData';
import type { Invoice } from '../types/accounting';

const context = { company: INITIAL_COMPANY_PROFILE };

describe('Peppol Schematron validator (EN 16931 / CIUS-BE / BIS 3.0)', () => {
  it('produces a clean report for a valid invoice', () => {
    const report = validateInvoiceSchematron(INITIAL_INVOICES[0], context);
    expect(report).toBeDefined();
    expect(report.rulesEvaluated).toBeGreaterThan(0);
    expect(report.summary.errorCount).toBe(0);
    expect(report.isValid).toBe(true);
    expect(report.summary.complianceScore).toBeGreaterThanOrEqual(90);
  });

  it('flags an invalid buyer VAT as a WARNING (BR-BE-05)', () => {
    const bad: Invoice = {
      ...INITIAL_INVOICES[0],
      client: {
        ...INITIAL_INVOICES[0].client,
        bceNumber: 'BE 0477.472.702',
        vatNumber: 'BE0477472702',
      },
    };
    const report = validateInvoiceSchematron(bad, context);
    expect(report.warnings.some((e) => e.ruleId === 'BR-BE-05')).toBe(true);
  });

  it('flags an invalid seller BCE as an ERROR (BR-06/BR-BE-02)', () => {
    const badContext = {
      company: { ...INITIAL_COMPANY_PROFILE, bceNumber: 'BE 0789.456.123', peppolEndpointId: '0208:0789456123' },
    };
    const report = validateInvoiceSchematron(INITIAL_INVOICES[0], badContext);
    expect(report.isValid).toBe(false);
    expect(report.errors.some((e) => e.ruleId === 'BR-06' || e.ruleId === 'BR-BE-02')).toBe(true);
  });

  it('reports EN16931 customization id in the header', () => {
    const report = validateInvoiceSchematron(INITIAL_INVOICES[0], context);
    expect(report.customizationId).toContain('en16931');
    expect(report.profileId).toContain('peppol');
  });

  it('summarizes a batch', () => {
    const reports = validateInvoiceBatch(
      INITIAL_INVOICES.filter((i) => i.type === 'invoice'),
      context,
    );
    const summary = summarizeBatch(reports);
    expect(summary.totalDocuments).toBe(reports.length);
    expect(summary.validDocuments).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { peppolStatusLabel, transmitInvoice } from '../services/peppolService';
import { INITIAL_COMPANY_PROFILE, INITIAL_INVOICES } from '../data/mockBelgianData';

describe('Peppol BIS 3.0 transmission service', () => {
  it('accepts a clean invoice and returns the UBL payload + message id', () => {
    const invoice = INITIAL_INVOICES[0];
    const result = transmitInvoice(invoice, INITIAL_COMPANY_PROFILE, { messageId: 'MSG-1' });

    expect(result.success).toBe(true);
    expect(result.status).toBe('ACCEPTED');
    expect(result.messageId).toBe('MSG-1');
    expect(result.ublXml).toContain('urn:cen.eu:en16931:2017');
    expect(result.ublXml).toContain(invoice.invoiceNumber);
    expect(result.customizationId).toContain('en16931');
    expect(result.errors.length).toBe(0);
  });

  it('rejects an invoice with a blocking Schematron error (invalid buyer endpoint)', () => {
    const invoice = {
      ...INITIAL_INVOICES[0],
      client: { ...INITIAL_INVOICES[0].client, peppolEndpointId: '0208:0477472702' },
    };
    const result = transmitInvoice(invoice, INITIAL_COMPANY_PROFILE, { messageId: 'MSG-2' });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('maps a quote to a non-transmissible state via the validator (type code)', () => {
    const quote = { ...INITIAL_INVOICES[0], type: 'quote' as const };
    const result = transmitInvoice(quote, INITIAL_COMPANY_PROFILE, { messageId: 'MSG-3' });
    // A quote is not transmissible through Peppol (BR-04): it must be rejected.
    expect(result.status).toBe('REJECTED');
  });

  it('labels delivery statuses in French', () => {
    expect(peppolStatusLabel('ACCEPTED')).toBe('Acceptée');
    expect(peppolStatusLabel('PENDING')).toBe('En attente (relecture)');
    expect(peppolStatusLabel('REJECTED')).toBe('Rejetée');
    expect(peppolStatusLabel(undefined)).toBe('Non transmise');
  });
});

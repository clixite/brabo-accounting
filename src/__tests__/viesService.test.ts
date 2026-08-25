import { describe, it, expect } from 'vitest';
import {
  validateNationalSyntax,
  consultVies,
  splitCountryPrefix,
  normalizeVatInput,
  buildViesCertificate,
  renderViesCertificateText,
  verifyVatBatch,
} from '../services/viesService';

describe('VIES intra-EU VAT validation', () => {
  it('normalizes raw VAT input', () => {
    expect(normalizeVatInput('FR 838 240 409 84')).toBe('FR83824040984');
    expect(normalizeVatInput('be-0123.456.789')).toBe('BE0123456789');
  });

  it('splits a leading country prefix', () => {
    expect(splitCountryPrefix('FR83824040984')).toEqual({ country: 'FR', digits: '83824040984' });
    expect(splitCountryPrefix('83824040984')).toEqual({ country: null, digits: '83824040984' });
  });

  it('validates national syntax per member state', () => {
    expect(validateNationalSyntax('FR', '83824040984')).toBe(true);
    expect(validateNationalSyntax('NL', '123456789B01')).toBe(true);
    expect(validateNationalSyntax('DE', '123456789')).toBe(true);
    expect(validateNationalSyntax('LU', '12345678')).toBe(true);
    expect(validateNationalSyntax('IT', '12345678901')).toBe(true);
  });

  it('rejects malformed VAT numbers', () => {
    expect(validateNationalSyntax('FR', '123')).toBe(false);
    expect(validateNationalSyntax('NL', '123456789')).toBe(false);
    expect(validateNationalSyntax('DE', 'ABC')).toBe(false);
  });

  it('consultVies returns a VALID result for a valid FR VAT', () => {
    const result = consultVies({
      requesterBce: '0789456175',
      targetCountry: 'FR',
      targetVatNumber: '83824040984',
    });
    expect(result.isValid).toBe(true);
    expect(result.fullVatNumber).toBe('FR83824040984');
    expect(result.usableForExemption).toBe(true);
    expect(result.consultationNumber).toMatch(/^VIES-/);
  });

  it('consultVies returns INVALID for a malformed VAT', () => {
    const result = consultVies({
      requesterBce: '0789456175',
      targetCountry: 'FR',
      targetVatNumber: '123',
    });
    expect(result.isValid).toBe(false);
    expect(result.usableForExemption).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('builds a retention certificate and renders text proof', () => {
    const result = consultVies({
      requesterBce: '0789456175',
      targetCountry: 'DE',
      targetVatNumber: '123456789',
    });
    const cert = buildViesCertificate(result, '0789456175');
    expect(cert.requesterBce).toBe('0789456175');
    expect(cert.targetFullVatNumber).toBe('DE123456789');

    const text = renderViesCertificateText(cert);
    expect(text).toContain('ATTESTATION DE VALIDATION VIES');
    expect(text).toContain(cert.consultationNumber);
  });

  it('verifies a batch', () => {
    const results = verifyVatBatch('0789456175', [
      { country: 'FR', vatNumber: '83824040984' },
      { country: 'NL', vatNumber: '123456789B01' },
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.isValid)).toBe(true);
  });
});

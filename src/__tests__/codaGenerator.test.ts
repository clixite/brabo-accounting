import { describe, it, expect } from 'vitest';
import {
  generateSampleCodaFile,
  validateCodaFile,
  generateCodaFromBankTransactions,
  extractStructuredCommunications,
  CODA_RECORD_LENGTH,
} from '../services/codaGenerator';
import {
  INITIAL_BANK_TRANSACTIONS,
  INITIAL_COMPANY_PROFILE,
} from '../data/mockBelgianData';

describe('Febelfin CODA generator & validator', () => {
  it('generates a sample statement with 80-character records', () => {
    const result = generateSampleCodaFile({ movementCount: 4 });
    expect(result.recordCount).toBeGreaterThan(3);
    expect(result.content.length).toBeGreaterThan(0);

    for (const record of result.records) {
      expect(record.length).toBe(CODA_RECORD_LENGTH);
    }
  });

  it('starts with header record type 0 and ends with trailer 9', () => {
    const result = generateSampleCodaFile();
    expect(result.records[0].startsWith('0')).toBe(true);
    expect(result.records[result.records.length - 1].startsWith('9')).toBe(true);
  });

  it('validates its own output', () => {
    const result = generateSampleCodaFile();
    const validation = validateCodaFile(result.content);
    expect(validation.isValid).toBe(true);
  });

  it('builds a CODA file from bank transactions', () => {
    const result = generateCodaFromBankTransactions(
      INITIAL_BANK_TRANSACTIONS.slice(0, 3),
      INITIAL_COMPANY_PROFILE,
    );
    expect(result.movementCount).toBe(3);
    expect(validateCodaFile(result.content).isValid).toBe(true);
  });

  it('extracts structured communications (OGM)', () => {
    const result = generateSampleCodaFile({ movementCount: 6 });
    const extracted = extractStructuredCommunications(result.content);
    expect(extracted.length).toBeGreaterThan(0);
  });
});
